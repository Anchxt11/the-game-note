use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::prelude::*;
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

use crate::crypto::{
    compute_aad, decrypt_payload, encrypt_payload, verify_token_constant_time, SyncKeys,
};
use crate::db::Database;
use crate::error::Result;
use crate::storage::FileStorage;
use crate::sync::protocol::{
    compress_payload, decompress_payload, validate_wire_batch, SyncEnvelope, WireChange,
    WireChangesetPayload, MAX_DECOMPRESSED_PAYLOAD_BYTES,
};
use crate::sync::{
    cursors, get_db_version, get_paged_changes, get_site_id, CrChange,
    CURRENT_SCHEMA_VERSION, PROTOCOL_VERSION,
};
use crate::transport::{PeerHealth, PushAck};

pub const DEFAULT_SERVER_PORT: u16 = 8765;
pub const MAX_FILE_SIZE_BYTES: usize = 25 * 1024 * 1024; // 25 MiB

#[derive(Clone)]
pub struct ServerConfig {
    pub host: IpAddr,
    pub port: u16,
    pub auth_token: Option<String>,
    pub device_name: Option<String>,
    pub sync_keys: Option<Arc<SyncKeys>>,
    pub on_change_applied: Option<Arc<dyn Fn() + Send + Sync>>,
}

impl std::fmt::Debug for ServerConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServerConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("auth_token", &self.auth_token)
            .field("device_name", &self.device_name)
            .field("sync_keys", &self.sync_keys)
            .finish()
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED),
            port: DEFAULT_SERVER_PORT,
            auth_token: None,
            device_name: Some("Laptop Hub".to_string()),
            sync_keys: None,
            on_change_applied: None,
        }
    }
}

pub struct ServerState {
    pub db: Arc<Database>,
    pub storage: Option<Arc<FileStorage>>,
    pub auth_token: Option<String>,
    pub device_name: Option<String>,
    pub sync_keys: Option<Arc<SyncKeys>>,
    pub event_tx: broadcast::Sender<i64>,
    pub on_change_applied: Option<Arc<dyn Fn() + Send + Sync>>,
}

/// Validates whether an incoming IP address belongs to loopback, RFC1918 private network,
/// or Tailscale's CGNAT range (`100.64.0.0/10` and `fd7a:115c:a1e0::/48`).
pub fn is_allowed_source_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            if ipv4.is_loopback() || ipv4.is_link_local() {
                return true;
            }
            let octets = ipv4.octets();
            // RFC1918: 10.0.0.0/8
            if octets[0] == 10 {
                return true;
            }
            // RFC1918: 172.16.0.0/12 (172.16 - 172.31)
            if octets[0] == 172 && (16..=31).contains(&octets[1]) {
                return true;
            }
            // RFC1918: 192.168.0.0/16
            if octets[0] == 192 && octets[1] == 168 {
                return true;
            }
            // Tailscale CGNAT: 100.64.0.0/10 (100.64.0.0 to 100.127.255.255)
            if octets[0] == 100 && (octets[1] & 0xC0) == 64 {
                return true;
            }
            false
        }
        IpAddr::V6(ipv6) => {
            if ipv6.is_loopback() {
                return true;
            }
            let segments = ipv6.segments();
            // Unique Local Address: fc00::/7 (fc00:: and fd00::)
            if (segments[0] & 0xfe00) == 0xfc00 {
                return true;
            }
            // Tailscale IPv6 prefix: fd7a:115c:a1e0::/48
            if segments[0] == 0xfd7a && segments[1] == 0x115c && segments[2] == 0xa1e0 {
                return true;
            }
            false
        }
    }
}

/// Validates that a file ID matches strict 64-character lowercase hex (SHA-256 / HMAC-SHA256).
pub fn is_valid_file_id(id: &str) -> bool {
    id.len() == 64 && id.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn check_auth(headers: &HeaderMap, expected_token: Option<&str>) -> bool {
    let Some(expected) = expected_token else {
        return false;
    };

    if expected.is_empty() {
        return false;
    }

    let Some(auth_header) = headers.get(axum::http::header::AUTHORIZATION) else {
        return false;
    };

    let Ok(auth_str) = auth_header.to_str() else {
        return false;
    };

    if let Some(token) = auth_str.strip_prefix("Bearer ") {
        verify_token_constant_time(expected, token)
    } else {
        false
    }
}

pub type ApiResult<T> = std::result::Result<T, (StatusCode, Json<serde_json::Value>)>;

// --- Route Handlers ---

async fn handle_health(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<PeerHealth>> {
    if !check_auth(&headers, state.auth_token.as_deref()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let conn = state.db.conn();
    let site_id = get_site_id(&conn).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;
    let db_version = get_db_version(&conn).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    Ok(Json(PeerHealth {
        status: "ok".to_string(),
        site_id: hex::encode(site_id),
        device_name: state.device_name.clone(),
        protocol_version: PROTOCOL_VERSION,
        schema_version: CURRENT_SCHEMA_VERSION,
        db_version,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ChangesQuery {
    pub since: Option<i64>,
    pub limit: Option<u32>,
    pub requester: Option<String>,
    pub envelope: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChangesResponse {
    Envelope(SyncEnvelope),
    Payload(WireChangesetPayload),
}

async fn handle_get_changes(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Query(query): Query<ChangesQuery>,
) -> ApiResult<Json<ChangesResponse>> {
    if !check_auth(&headers, state.auth_token.as_deref()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let since = query.since.unwrap_or(0);
    let limit = query.limit.unwrap_or(1000).min(5000);
    let requester_bytes = query.requester.as_deref().and_then(|r| hex::decode(r).ok());

    let conn = state.db.conn();
    let (changes, next_cursor, has_more) = get_paged_changes(
        &conn,
        since,
        limit,
        requester_bytes.as_deref(),
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    if let Some(ref req_str) = query.requester {
        let _ = cursors::upsert_peer(&conn, req_str, None);
        let _ = cursors::set_cursor(&conn, req_str, crate::sync::cursors::CursorDirection::Push, next_cursor);
    }

    let server_db_version = get_db_version(&conn).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    let local_site_id = hex::encode(get_site_id(&conn).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?);
    drop(conn);

    let wire_changes = changes.into_iter().map(WireChange::from).collect();
    let wire_payload = WireChangesetPayload {
        changes: wire_changes,
        next_cursor,
        has_more,
        server_db_version,
    };

    if query.envelope.unwrap_or(false) && state.sync_keys.is_some() {
        let keys = state.sync_keys.as_ref().unwrap();
        let json_bytes = serde_json::to_vec(&wire_payload).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        })?;
        let compressed = compress_payload(&json_bytes).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        })?;
        let aad = compute_aad(PROTOCOL_VERSION, &local_site_id, "changes", 1);
        let (ciphertext, nonce) = encrypt_payload(&keys.enc_key, &compressed, &aad).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        })?;
        let env = SyncEnvelope {
            protocol_version: PROTOCOL_VERSION,
            schema_version: CURRENT_SCHEMA_VERSION,
            sender_site_id: local_site_id,
            kind: "changes".to_string(),
            key_id: 1,
            nonce: BASE64_STANDARD.encode(nonce),
            payload: BASE64_STANDARD.encode(ciphertext),
        };
        Ok(Json(ChangesResponse::Envelope(env)))
    } else {
        Ok(Json(ChangesResponse::Payload(wire_payload)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyChangesRequest {
    pub protocol_version: Option<u32>,
    pub schema_version: Option<u32>,
    pub changes: Vec<WireChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ApplyChangesBody {
    Envelope(SyncEnvelope),
    Direct(ApplyChangesRequest),
}

async fn handle_post_changes(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(body): Json<ApplyChangesBody>,
) -> ApiResult<Json<PushAck>> {
    if !check_auth(&headers, state.auth_token.as_deref()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let (proto, schema, wire_changes, sender_site_id) = match body {
        ApplyChangesBody::Envelope(env) => {
            if env.protocol_version != PROTOCOL_VERSION {
                return Err((
                    StatusCode::UPGRADE_REQUIRED,
                    Json(serde_json::json!({ "error": "Protocol mismatch" })),
                ));
            }
            if env.schema_version != CURRENT_SCHEMA_VERSION {
                return Err((
                    StatusCode::CONFLICT,
                    Json(serde_json::json!({ "error": "Schema mismatch" })),
                ));
            }
            let Some(keys) = state.sync_keys.as_ref() else {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({
                        "error": "Server does not have sync encryption keys configured"
                    })),
                ));
            };
            let aad = compute_aad(env.protocol_version, &env.sender_site_id, &env.kind, env.key_id);
            let nonce_bytes = BASE64_STANDARD.decode(&env.nonce).map_err(|e| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(serde_json::json!({ "error": format!("Invalid nonce base64: {}", e) })),
                )
            })?;
            let ciphertext = BASE64_STANDARD.decode(&env.payload).map_err(|e| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(serde_json::json!({ "error": format!("Invalid payload base64: {}", e) })),
                )
            })?;
            let nonce_arr: [u8; 24] = nonce_bytes.as_slice().try_into().map_err(|_| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(serde_json::json!({ "error": "Nonce must be 24 bytes" })),
                )
            })?;
            let decrypted = decrypt_payload(&keys.enc_key, &ciphertext, &nonce_arr, &aad).map_err(|e| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(serde_json::json!({ "error": format!("Decryption failed: {}", e) })),
                )
            })?;
            let decompressed = decompress_payload(&decrypted, MAX_DECOMPRESSED_PAYLOAD_BYTES).map_err(|e| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(serde_json::json!({ "error": format!("Decompression failed: {}", e) })),
                )
            })?;
            let payload: WireChangesetPayload = serde_json::from_slice(&decompressed).map_err(|e| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(serde_json::json!({ "error": format!("Invalid JSON payload: {}", e) })),
                )
            })?;
            (env.protocol_version, env.schema_version, payload.changes, Some(env.sender_site_id))
        }
        ApplyChangesBody::Direct(req) => (
            req.protocol_version.unwrap_or(PROTOCOL_VERSION),
            req.schema_version.unwrap_or(CURRENT_SCHEMA_VERSION),
            req.changes,
            None,
        ),
    };

    if let Err(e) = validate_wire_batch(proto, schema, &wire_changes) {
        return Err((
            StatusCode::from_u16(e.http_status()).unwrap_or(StatusCode::BAD_REQUEST),
            Json(serde_json::json!({ "error": e.to_string() })),
        ));
    }

    let mut cr_changes = Vec::with_capacity(wire_changes.len());
    for wc in wire_changes {
        let cc = CrChange::try_from(wc).map_err(|e| {
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        })?;
        cr_changes.push(cc);
    }

    let applied_through = cr_changes.iter().map(|c| c.db_version).max().unwrap_or(0);

    state.db.apply_changes(&cr_changes).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    if let Some(ref cb) = state.on_change_applied {
        cb();
    }

    let new_db_version = state.db.get_db_version().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    if let Some(ref sender) = sender_site_id {
        let conn = state.db.conn();
        let _ = cursors::upsert_peer(&conn, sender, None);
        let _ = cursors::set_cursor(&conn, sender, crate::sync::cursors::CursorDirection::Push, new_db_version);
    }

    // Broadcast SSE notification
    let _ = state.event_tx.send(new_db_version);

    Ok(Json(PushAck {
        applied_through,
        db_version: new_db_version,
    }))
}

async fn handle_events(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
) -> ApiResult<Sse<impl Stream<Item = std::result::Result<Event, axum::Error>>>> {
    if !check_auth(&headers, state.auth_token.as_deref()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let rx = state.event_tx.subscribe();
    let stream = futures_util::stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(version) => {
                let event = Event::default().data(format!(r#"{{"db_version": {}}}"#, version));
                Some((Ok(event), rx))
            }
            Err(broadcast::error::RecvError::Lagged(_)) => {
                let event = Event::default().comment("lagged");
                Some((Ok(event), rx))
            }
            Err(broadcast::error::RecvError::Closed) => None,
        }
    });

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

#[derive(Debug, Deserialize)]
pub struct MissingFilesRequest {
    pub file_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MissingFilesResponse {
    pub missing_ids: Vec<String>,
}

async fn handle_missing_files(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Json(payload): Json<MissingFilesRequest>,
) -> ApiResult<Json<MissingFilesResponse>> {
    if !check_auth(&headers, state.auth_token.as_deref()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let mut missing = Vec::new();
    let storage = state.storage.as_ref();

    for id in payload.file_ids {
        if !is_valid_file_id(&id) {
            continue;
        }
        if let Some(storage) = storage {
            let path = storage.root_dir().join(&id);
            if !path.exists() {
                missing.push(id);
            }
        } else {
            missing.push(id);
        }
    }

    Ok(Json(MissingFilesResponse {
        missing_ids: missing,
    }))
}

async fn handle_get_file(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !check_auth(&headers, state.auth_token.as_deref()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    if !is_valid_file_id(&id) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid file ID format (must be 64 hex characters)" })),
        ));
    }

    let Some(storage) = state.storage.as_ref() else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "File storage not configured" })),
        ));
    };

    let path = storage.root_dir().join(&id);
    if !path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "File not found" })),
        ));
    }

    let data = std::fs::read(&path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    Ok((
        StatusCode::OK,
        [("Content-Type", "application/octet-stream")],
        data,
    )
        .into_response())
}

async fn handle_put_file(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: axum::body::Bytes,
) -> ApiResult<Json<serde_json::Value>> {
    if !check_auth(&headers, state.auth_token.as_deref()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    if !is_valid_file_id(&id) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid file ID format (must be 64 hex characters)" })),
        ));
    }

    if body.len() > MAX_FILE_SIZE_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(serde_json::json!({ "error": "File exceeds maximum upload size of 25 MiB" })),
        ));
    }

    let Some(storage) = state.storage.as_ref() else {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "File storage not configured" })),
        ));
    };

    let path = storage.root_dir().join(&id);
    std::fs::write(&path, &body).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "status": "stored", "id": id, "bytes": body.len() })))
}

/// Creates the Axum router with all sync endpoints and middleware.
pub fn create_sync_router(state: Arc<ServerState>) -> Router {
    Router::new()
        .route("/api/sync/health", get(handle_health))
        .route("/api/sync/changes", get(handle_get_changes).post(handle_post_changes))
        .route("/api/sync/events", get(handle_events))
        .route("/api/sync/files/missing", post(handle_missing_files))
        .route("/api/sync/files/{id}", get(handle_get_file).put(handle_put_file))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

/// Handle to a running embedded sync server.
pub struct ServerHandle {
    port: u16,
    shutdown_tx: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    join_handle: tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    event_tx: broadcast::Sender<i64>,
}

impl ServerHandle {
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn event_sender(&self) -> broadcast::Sender<i64> {
        self.event_tx.clone()
    }

    pub fn stop(&self) {
        if let Ok(mut tx) = self.shutdown_tx.lock() {
            if let Some(sender) = tx.take() {
                let _ = sender.send(());
            }
        }
    }

    pub async fn stop_and_wait(&self) {
        self.stop();
        let mut handle_guard = self.join_handle.lock().await;
        if let Some(handle) = handle_guard.take() {
            let _ = handle.await;
        }
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Starts the embedded desktop HTTP sync daemon.
pub async fn start_sync_server(
    config: ServerConfig,
    db: Arc<Database>,
    storage: Option<Arc<FileStorage>>,
) -> Result<ServerHandle> {
    let (event_tx, _) = broadcast::channel(128);
    let state = Arc::new(ServerState {
        db,
        storage,
        auth_token: config.auth_token,
        device_name: config.device_name,
        sync_keys: config.sync_keys,
        event_tx: event_tx.clone(),
        on_change_applied: config.on_change_applied,
    });

    let app = create_sync_router(state);
    let target_addr = SocketAddr::new(config.host, config.port);
    let listener = if config.port == 0 {
        tokio::net::TcpListener::bind(target_addr).await?
    } else {
        let mut last_err = None;
        let mut bound_listener = None;
        for attempt in 0..10 {
            match tokio::net::TcpListener::bind(target_addr).await {
                Ok(l) => {
                    bound_listener = Some(l);
                    break;
                }
                Err(e) => {
                    last_err = Some(e);
                    if attempt < 9 {
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                }
            }
        }
        match bound_listener {
            Some(l) => l,
            None => {
                let err = last_err.unwrap();
                log::error!("Failed to bind sync server to {}: {}", target_addr, err);
                return Err(crate::error::AppError::Io(err));
            }
        }
    };
    let bound_port = listener.local_addr()?.port();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let join_handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .ok();
    });

    Ok(ServerHandle {
        port: bound_port,
        shutdown_tx: std::sync::Mutex::new(Some(shutdown_tx)),
        join_handle: tokio::sync::Mutex::new(Some(join_handle)),
        event_tx,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    use tempfile::tempdir;

    #[test]
    fn test_is_allowed_source_ip() {
        // Allowed
        assert!(is_allowed_source_ip(&IpAddr::from_str("127.0.0.1").unwrap()));
        assert!(is_allowed_source_ip(&IpAddr::from_str("::1").unwrap()));
        assert!(is_allowed_source_ip(&IpAddr::from_str("10.0.0.1").unwrap()));
        assert!(is_allowed_source_ip(&IpAddr::from_str("172.16.0.1").unwrap()));
        assert!(is_allowed_source_ip(&IpAddr::from_str("172.31.255.255").unwrap()));
        assert!(is_allowed_source_ip(&IpAddr::from_str("192.168.1.1").unwrap()));
        assert!(is_allowed_source_ip(&IpAddr::from_str("100.64.0.1").unwrap())); // Tailscale
        assert!(is_allowed_source_ip(&IpAddr::from_str("100.127.255.255").unwrap())); // Tailscale
        assert!(is_allowed_source_ip(&IpAddr::from_str("fd7a:115c:a1e0::1").unwrap())); // Tailscale IPv6

        // Rejected (public / non-private)
        assert!(!is_allowed_source_ip(&IpAddr::from_str("8.8.8.8").unwrap()));
        assert!(!is_allowed_source_ip(&IpAddr::from_str("1.1.1.1").unwrap()));
        assert!(!is_allowed_source_ip(&IpAddr::from_str("172.32.0.1").unwrap()));
        assert!(!is_allowed_source_ip(&IpAddr::from_str("100.128.0.1").unwrap())); // Beyond 100.64.0.0/10
        assert!(!is_allowed_source_ip(&IpAddr::from_str("2607:f8b0:4005:805::200e").unwrap()));
    }

    #[test]
    fn test_is_valid_file_id() {
        assert!(is_valid_file_id("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"));
        assert!(!is_valid_file_id("../../../etc/passwd"));
        assert!(!is_valid_file_id("0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF")); // uppercase rejected
        assert!(!is_valid_file_id("short"));
        assert!(!is_valid_file_id("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefextra"));
    }

    #[tokio::test]
    async fn test_sync_server_health_and_auth() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let temp_dir = tempdir().unwrap();
        let storage = Arc::new(FileStorage::open_dir(temp_dir.path()).unwrap());

        let token = "test_bearer_secret_12345".to_string();
        let config = ServerConfig {
            host: IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
            port: 0, // OS assigns random available port
            auth_token: Some(token.clone()),
            device_name: Some("Test Server".to_string()),
            sync_keys: None,
            on_change_applied: None,
        };

        let handle = start_sync_server(config, db.clone(), Some(storage)).await.unwrap();
        let port = handle.port();

        let client = reqwest::Client::new();
        let base_url = format!("http://127.0.0.1:{}", port);

        // 1. Missing auth header -> 401
        let res_no_auth = client.get(format!("{}/api/sync/health", base_url)).send().await.unwrap();
        assert_eq!(res_no_auth.status(), 401);

        // 2. Invalid auth token -> 401
        let res_bad_auth = client
            .get(format!("{}/api/sync/health", base_url))
            .bearer_auth("wrong_token")
            .send()
            .await
            .unwrap();
        assert_eq!(res_bad_auth.status(), 401);

        // 3. Valid auth token -> 200 with PeerHealth
        let res_valid = client
            .get(format!("{}/api/sync/health", base_url))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(res_valid.status(), 200);

        let health: PeerHealth = res_valid.json().await.unwrap();
        assert_eq!(health.status, "ok");
        assert_eq!(health.device_name, Some("Test Server".to_string()));
        assert_eq!(health.site_id, hex::encode(db.get_site_id().unwrap()));
        assert_eq!(health.protocol_version, PROTOCOL_VERSION);

        // 4. File upload and download test
        let file_id = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
        let file_bytes = b"Sample image attachment bytes";

        // Path traversal attempt -> 400 Bad Request
        let res_bad_path = client
            .put(format!("{}/api/sync/files/../etc_passwd", base_url))
            .bearer_auth(&token)
            .body(file_bytes.to_vec())
            .send()
            .await
            .unwrap();
        assert!(res_bad_path.status() == 400 || res_bad_path.status() == 404);

        // PUT valid file
        let res_put = client
            .put(format!("{}/api/sync/files/{}", base_url, file_id))
            .bearer_auth(&token)
            .body(file_bytes.to_vec())
            .send()
            .await
            .unwrap();
        assert_eq!(res_put.status(), 200);

        // GET valid file
        let res_get = client
            .get(format!("{}/api/sync/files/{}", base_url, file_id))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(res_get.status(), 200);
        let fetched_bytes = res_get.bytes().await.unwrap();
        assert_eq!(fetched_bytes.as_ref(), file_bytes);

        // Missing files query
        let res_missing = client
            .post(format!("{}/api/sync/files/missing", base_url))
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "file_ids": [file_id, "b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"]
            }))
            .send()
            .await
            .unwrap();
        assert_eq!(res_missing.status(), 200);
        let missing_resp: MissingFilesResponse = res_missing.json().await.unwrap();
        assert_eq!(missing_resp.missing_ids.len(), 1);
        assert_eq!(missing_resp.missing_ids[0], "b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90");

        handle.stop();
    }
}
