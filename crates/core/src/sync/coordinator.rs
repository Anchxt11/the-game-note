use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};

use crate::crypto::SyncKeys;
use crate::db::Database;
use crate::error::{AppError, Result};
use crate::sync::cursors::{self, CursorDirection};
use crate::sync::engine::{sync_with_peer, SyncStats};
use crate::storage::{is_valid_file_id, FileStorage};
use crate::transport::client::HttpClient;
use crate::transport::mailbox::{sync_with_mailbox, MailboxClient, MailboxSyncStats};
use crate::transport::{Transport, TransportKind};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EndpointConfig {
    pub kind: TransportKind,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PeerConfig {
    pub site_id: String,
    pub name: String,
    pub endpoints: Vec<EndpointConfig>,
}

#[derive(Debug, Clone, Default)]
struct PeerRuntimeState {
    last_working_endpoint: Option<String>,
    last_synced_at: Option<i64>,
    last_error: Option<String>,
    active_transport: Option<TransportKind>,
    consecutive_failures: u32,
    next_retry_at: Option<Instant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerSyncStatus {
    pub peer_id: String,
    pub name: String,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    pub active_transport: Option<TransportKind>,
    pub consecutive_failures: u32,
    pub pull_cursor: i64,
    pub push_cursor: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub state: String, // "idle", "syncing", "paused", "error"
    pub active_transport: Option<TransportKind>,
    pub last_synced_at: Option<i64>,
    pub pending_local_changes: i64,
    pub last_error: Option<String>,
    pub peers: Vec<PeerSyncStatus>,
}

fn is_valid_site_id(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit())
}

/// Orchestrates multi-transport synchronization across configured peers.
/// Handles endpoint connection, lifecycle pauses (Android backgrounding),
/// debounced local writes, reactive SSE triggers, and binary media sync.
pub struct SyncCoordinator {
    db: Arc<Database>,
    peers: Arc<RwLock<Vec<PeerConfig>>>,
    sync_keys: Arc<RwLock<Option<Arc<SyncKeys>>>>,
    auth_token: Arc<RwLock<Option<String>>>,
    peer_locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    peer_runtime: Arc<RwLock<HashMap<String, PeerRuntimeState>>>,
    active_listeners: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
    on_change_applied: Arc<RwLock<Option<Arc<dyn Fn() + Send + Sync>>>>,
    paused: Arc<AtomicBool>,
    state: Arc<RwLock<String>>,
    mailbox_url: Arc<RwLock<Option<String>>>,
    mailbox_lock: Arc<Mutex<()>>,
    mailbox_runtime: Arc<RwLock<PeerRuntimeState>>,
    storage: Arc<RwLock<Option<Arc<FileStorage>>>>,
    lan_enabled: Arc<AtomicBool>,
}

impl SyncCoordinator {
    pub fn new(
        db: Arc<Database>,
        peers: Vec<PeerConfig>,
        sync_keys: Option<Arc<SyncKeys>>,
        auth_token: Option<String>,
    ) -> Self {
        Self::with_mailbox(db, peers, sync_keys, auth_token, None)
    }

    pub fn with_mailbox(
        db: Arc<Database>,
        peers: Vec<PeerConfig>,
        sync_keys: Option<Arc<SyncKeys>>,
        auth_token: Option<String>,
        mailbox_url: Option<String>,
    ) -> Self {
        Self::with_options(db, peers, sync_keys, auth_token, mailbox_url, None)
    }

    pub fn with_options(
        db: Arc<Database>,
        peers: Vec<PeerConfig>,
        sync_keys: Option<Arc<SyncKeys>>,
        auth_token: Option<String>,
        mailbox_url: Option<String>,
        storage: Option<Arc<FileStorage>>,
    ) -> Self {
        Self {
            db,
            peers: Arc::new(RwLock::new(peers)),
            sync_keys: Arc::new(RwLock::new(sync_keys)),
            auth_token: Arc::new(RwLock::new(auth_token)),
            peer_locks: Arc::new(Mutex::new(HashMap::new())),
            peer_runtime: Arc::new(RwLock::new(HashMap::new())),
            active_listeners: Arc::new(Mutex::new(HashMap::new())),
            on_change_applied: Arc::new(RwLock::new(None)),
            paused: Arc::new(AtomicBool::new(false)),
            state: Arc::new(RwLock::new("idle".to_string())),
            mailbox_url: Arc::new(RwLock::new(mailbox_url)),
            mailbox_lock: Arc::new(Mutex::new(())),
            mailbox_runtime: Arc::new(RwLock::new(PeerRuntimeState::default())),
            storage: Arc::new(RwLock::new(storage)),
            lan_enabled: Arc::new(AtomicBool::new(true)),
        }
    }

    pub fn is_lan_enabled(&self) -> bool {
        self.lan_enabled.load(Ordering::SeqCst)
    }

    pub fn set_lan_enabled(&self, enabled: bool) {
        self.lan_enabled.store(enabled, Ordering::SeqCst);
    }

    pub async fn set_storage(&self, storage: Option<Arc<FileStorage>>) {
        let mut s = self.storage.write().await;
        *s = storage;
    }

    pub async fn get_storage(&self) -> Option<Arc<FileStorage>> {
        self.storage.read().await.clone()
    }

    pub async fn set_mailbox_url(&self, url: Option<String>) {
        let mut m = self.mailbox_url.write().await;
        *m = url;
    }

    pub async fn get_mailbox_url(&self) -> Option<String> {
        self.mailbox_url.read().await.clone()
    }

    pub async fn sync_mailbox_cycle(&self) -> Result<MailboxSyncStats> {
        let _guard = self.mailbox_lock.lock().await;

        let mailbox_url = match self.get_mailbox_url().await {
            Some(u) if !u.is_empty() => u,
            _ => return Ok(MailboxSyncStats::default()),
        };

        let sync_keys = match self.sync_keys.read().await.clone() {
            Some(k) => k,
            None => return Ok(MailboxSyncStats::default()),
        };

        let local_site_id = hex::encode(self.db.get_site_id()?);
        let client = MailboxClient::new(mailbox_url.clone(), local_site_id, sync_keys);

        match sync_with_mailbox(&self.db, &client, 2000).await {
            Ok(stats) => {
                let now = chrono::Utc::now().timestamp_millis();
                let mut runtime = self.mailbox_runtime.write().await;
                runtime.last_working_endpoint = Some(mailbox_url);
                runtime.last_synced_at = Some(now);
                runtime.last_error = None;
                runtime.active_transport = Some(TransportKind::Mailbox);
                runtime.consecutive_failures = 0;
                runtime.next_retry_at = None;

                if stats.rows_pulled > 0 {
                    let cb = self.on_change_applied.read().await.clone();
                    if let Some(cb) = cb {
                        cb();
                    }
                }

                Ok(stats)
            }
            Err(e) => {
                let mut runtime = self.mailbox_runtime.write().await;
                runtime.last_error = Some(e.to_string());
                runtime.consecutive_failures += 1;
                let backoff_secs = (1u64 << runtime.consecutive_failures.min(6)).min(60);
                runtime.next_retry_at = Some(Instant::now() + Duration::from_secs(backoff_secs));
                Err(e)
            }
        }
    }

    pub async fn set_on_change_applied<F: Fn() + Send + Sync + 'static>(&self, cb: F) {
        let mut w = self.on_change_applied.write().await;
        *w = Some(Arc::new(cb));
    }

    pub async fn update_peers(&self, peers: Vec<PeerConfig>) {
        let mut p = self.peers.write().await;
        *p = peers;
    }

    pub async fn get_peers(&self) -> Vec<PeerConfig> {
        self.peers.read().await.clone()
    }

    pub async fn set_sync_keys(&self, keys: Option<Arc<SyncKeys>>) {
        let mut k = self.sync_keys.write().await;
        *k = keys;
    }

    pub async fn get_sync_keys(&self) -> Option<Arc<SyncKeys>> {
        self.sync_keys.read().await.clone()
    }

    pub async fn set_auth_token(&self, token: Option<String>) {
        let mut t = self.auth_token.write().await;
        *t = token;
    }

    pub async fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
        let mut s = self.state.write().await;
        *s = "paused".to_string();
    }

    pub async fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        let mut s = self.state.write().await;
        *s = "idle".to_string();
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    async fn get_peer_lock(&self, peer_id: &str) -> Arc<Mutex<()>> {
        let mut locks = self.peer_locks.lock().await;
        locks
            .entry(peer_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    /// Triggers a sync cycle for a specific peer or all peers.
    pub async fn trigger_sync(
        &self,
        target_peer_id: Option<&str>,
    ) -> Result<Vec<(String, SyncStats)>> {
        if self.is_paused() {
            return Ok(Vec::new());
        }

        {
            let mut s = self.state.write().await;
            *s = "syncing".to_string();
        }

        let peers = { self.peers.read().await.clone() };
        let mut results = Vec::new();

        // 1. Sync with Mailbox first (fastest, ~30ms cloud roundtrip)
        if target_peer_id.is_none() || target_peer_id == Some("mailbox") {
            if let Ok(m_stats) = self.sync_mailbox_cycle().await {
                if m_stats.rows_pulled > 0 || m_stats.rows_pushed > 0 {
                    results.push((
                        "mailbox".to_string(),
                        SyncStats {
                            rows_pulled: m_stats.rows_pulled,
                            rows_pushed: m_stats.rows_pushed,
                            pull_cursor: m_stats.pull_seq as i64,
                            push_cursor: m_stats.push_db_version,
                        },
                    ));
                }
            }
        }

        // 2. Sync with direct LAN peers
        if self.is_lan_enabled() {
            for peer in peers {
                if let Some(target) = target_peer_id {
                    if peer.site_id != target {
                        continue;
                    }
                }

                match self.sync_peer_cycle(&peer).await {
                    Ok((actual_site_id, stats)) => {
                        results.push((actual_site_id, stats));
                    }
                    Err(e) => {
                        log::warn!("Sync cycle failed for peer {}: {}", peer.site_id, e);
                    }
                }
            }
        }

        {
            let mut s = self.state.write().await;
            *s = "idle".to_string();
        }

        Ok(results)
    }

    /// Executes a single sync cycle with a peer, handling transport selection and failover.
    pub async fn sync_peer_cycle(&self, peer: &PeerConfig) -> Result<(String, SyncStats)> {
        let peer_lock = self.get_peer_lock(&peer.site_id).await;
        let _guard = peer_lock.lock().await;

        // Skip attempting unreachable peer if currently within exponential backoff window
        {
            let runtime = self.peer_runtime.read().await;
            if let Some(state) = runtime.get(&peer.site_id) {
                if let Some(retry_at) = state.next_retry_at {
                    if Instant::now() < retry_at {
                        return Ok((peer.site_id.clone(), SyncStats::default()));
                    }
                }
            }
        }

        let local_site_id = hex::encode(self.db.get_site_id()?);
        let sync_keys = { self.sync_keys.read().await.clone() };
        let auth_token = { self.auth_token.read().await.clone() };

        // 1. Determine which endpoint to try
        let last_working = {
            let runtime = self.peer_runtime.read().await;
            runtime
                .get(&peer.site_id)
                .and_then(|r| r.last_working_endpoint.clone())
        };

        // Order endpoints: last working first, then remaining LAN endpoints
        let mut candidate_endpoints = Vec::new();
        if let Some(ref lw) = last_working {
            if let Some(ep) = peer.endpoints.iter().find(|e| &e.url == lw) {
                candidate_endpoints.push(ep.clone());
            }
        }

        // Add remaining endpoints
        for ep in &peer.endpoints {
            if !candidate_endpoints.iter().any(|c| c.url == ep.url) {
                candidate_endpoints.push(ep.clone());
            }
        }

        if candidate_endpoints.iter().any(|c| !c.url.contains("localhost") && !c.url.contains("127.0.0.1")) {
            candidate_endpoints.retain(|c| !c.url.contains("localhost") && !c.url.contains("127.0.0.1"));
        }

        if candidate_endpoints.is_empty() {
            let err_msg = "No sync endpoints configured for peer".to_string();
            self.record_peer_error(&peer.site_id, &err_msg).await;
            return Err(AppError::InvalidOperation(err_msg));
        }

        let is_placeholder_id = !is_valid_site_id(&peer.site_id);
        let expected_site_id = if is_placeholder_id {
            None
        } else {
            Some(peer.site_id.clone())
        };

        let mut connected_client: Option<(HttpClient, TransportKind, String)> = None;
        let mut last_endpoint_error: Option<String> = None;

        for ep in candidate_endpoints {
            let client = HttpClient::new(
                ep.url.clone(),
                ep.kind,
                auth_token.clone(),
                expected_site_id.clone(),
                Some(local_site_id.clone()),
                sync_keys.clone(),
            );

            match client.health().await {
                Ok(health) => {
                    // Skip if the endpoint points to our own local device
                    if health.site_id == local_site_id {
                        log::debug!("Endpoint {} points to self, skipping", ep.url);
                        last_endpoint_error = Some("Endpoint points to this device itself".to_string());
                        continue;
                    }

                    // If we had an expected real site_id, ensure it matches
                    if let Some(ref exp) = expected_site_id {
                        if &health.site_id != exp {
                            log::debug!("Endpoint {} site_id mismatch: expected {}, got {}", ep.url, exp, health.site_id);
                            last_endpoint_error = Some(format!("Peer site_id mismatch (expected {}, got {})", exp, health.site_id));
                            continue;
                        }
                    }

                    connected_client = Some((client, ep.kind, health.site_id));
                    break;
                }
                Err(e) => {
                    log::debug!("Endpoint {} unreachable: {}", ep.url, e);
                    last_endpoint_error = Some(format!("{}: {}", ep.url, e));
                }
            }
        }

        let (client, transport_kind, actual_site_id) = match connected_client {
            Some(c) => c,
            None => {
                let details = last_endpoint_error
                    .map(|e| format!(": {}", e))
                    .unwrap_or_default();
                let err_msg = format!("All endpoints unreachable for peer {}{}", peer.name, details);
                self.record_peer_error(&peer.site_id, &err_msg).await;
                return Err(AppError::InvalidOperation(err_msg));
            }
        };

        // If peer had a placeholder site_id, adopt actual_site_id
        let old_site_id = peer.site_id.clone();
        if actual_site_id != old_site_id {
            let mut peers = self.peers.write().await;
            if let Some(existing_pos) = peers.iter().position(|p| p.site_id == actual_site_id) {
                if let Some(old_pos) = peers.iter().position(|p| p.site_id == old_site_id) {
                    let old_peer = peers.remove(old_pos);
                    let target_pos = if existing_pos > old_pos { existing_pos - 1 } else { existing_pos };
                    for ep in old_peer.endpoints {
                        if !peers[target_pos].endpoints.iter().any(|e| e.url == ep.url) {
                            peers[target_pos].endpoints.push(ep);
                        }
                    }
                }
            } else {
                for p in peers.iter_mut() {
                    if p.site_id == old_site_id {
                        p.site_id = actual_site_id.clone();
                    }
                }
            }
            let mut runtime = self.peer_runtime.write().await;
            runtime.remove(&old_site_id);
        }

        // 2. Execute sync cycle with actual_site_id
        let result = sync_with_peer(&self.db, &client, &actual_site_id, 2000).await;

        match result {
            Ok(stats) => {
                let now = chrono::Utc::now().timestamp_millis();
                let mut runtime = self.peer_runtime.write().await;
                let state = runtime.entry(actual_site_id.clone()).or_default();
                state.last_working_endpoint = Some(client.base_url().to_string());
                state.last_synced_at = Some(now);
                state.last_error = None;
                state.active_transport = Some(transport_kind);
                state.consecutive_failures = 0;
                state.next_retry_at = None;

                if stats.rows_pulled > 0 {
                    let cb = self.on_change_applied.read().await.clone();
                    if let Some(cb) = cb {
                        cb();
                    }
                }

                // Sync binary attachments (images / media files) with peer
                let _ = self.sync_files_with_peer(&client).await;

                Ok((actual_site_id, stats))
            }
            Err(e) => {
                self.record_peer_error(&actual_site_id, &e.to_string()).await;
                Err(e)
            }
        }
    }

    /// Automatically synchronizes binary image and media attachments with a connected peer.
    /// Scans elements for referenced `file_id`s, requests missing ones, verifies HMAC, and uploads
    /// files that the peer lacks.
    pub async fn sync_files_with_peer(&self, client: &HttpClient) -> Result<usize> {
        let storage = match self.get_storage().await {
            Some(s) => s,
            None => return Ok(0),
        };
        let sync_keys = self.sync_keys.read().await.clone();

        // 1. Scan all file_ids referenced in the local database
        let local_referenced_ids = {
            let conn = self.db.conn();
            let mut stmt = match conn.prepare(
                "SELECT content FROM elements WHERE content LIKE '%\"file_id\"%'"
            ) {
                Ok(s) => s,
                Err(_) => return Ok(0),
            };
            let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
                Ok(r) => r,
                Err(_) => return Ok(0),
            };
            let mut ids = std::collections::HashSet::new();
            for r in rows {
                if let Ok(c) = r {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&c) {
                        if let Some(fid) = json.get("file_id").and_then(|v| v.as_str()) {
                            if is_valid_file_id(fid) {
                                ids.insert(fid.to_string());
                            }
                        }
                    }
                }
            }
            ids
        };

        // 2. Filter for files that we are missing locally
        let missing_locally: Vec<String> = local_referenced_ids
            .into_iter()
            .filter(|fid| !storage.has_file(fid))
            .collect();

        let mut downloaded_count = 0;
        if !missing_locally.is_empty() {
            // Ask peer which of these missing files it has
            if let Ok(peer_missing) = client.missing_files(&missing_locally).await {
                let peer_missing_set: std::collections::HashSet<_> = peer_missing.into_iter().collect();
                let available_on_peer: Vec<String> = missing_locally
                    .into_iter()
                    .filter(|id| !peer_missing_set.contains(id))
                    .collect();

                // Download up to 10 files per sync cycle
                for fid in available_on_peer.into_iter().take(10) {
                    use futures_util::StreamExt;
                    if let Ok(mut stream) = client.get_file(&fid, None).await {
                        let mut file_bytes = Vec::new();
                        let mut ok = true;
                        while let Some(chunk_res) = stream.next().await {
                            match chunk_res {
                                Ok(chunk) => file_bytes.extend_from_slice(&chunk),
                                Err(_) => {
                                    ok = false;
                                    break;
                                }
                            }
                        }

                        if ok && !file_bytes.is_empty() {
                            let is_valid = if let Some(ref keys) = sync_keys {
                                crate::crypto::verify_file_id(&keys.file_key, &file_bytes, &fid)
                            } else {
                                true
                            };

                            if is_valid {
                                if storage.store_file(&fid, &file_bytes).is_ok() {
                                    downloaded_count += 1;
                                }
                            } else {
                                log::warn!("File integrity verification failed for file {}", fid);
                            }
                        }
                    }
                }
            }
        }

        // 3. Upload files that peer is missing
        if let Ok(local_stored_ids) = storage.list_content_addressed_files() {
            if !local_stored_ids.is_empty() {
                let sample: Vec<String> = local_stored_ids.into_iter().take(20).collect();
                if let Ok(peer_missing) = client.missing_files(&sample).await {
                    for fid in peer_missing.into_iter().take(5) {
                        if let Ok(bytes) = storage.read_file(&fid) {
                            let _ = client.put_file(&fid, 0, bytes::Bytes::from(bytes)).await;
                        }
                    }
                }
            }
        }

        if downloaded_count > 0 {
            let cb = self.on_change_applied.read().await.clone();
            if let Some(cb) = cb {
                cb();
            }
        }

        Ok(downloaded_count)
    }

    async fn record_peer_error(&self, peer_id: &str, error: &str) {
        let mut runtime = self.peer_runtime.write().await;
        let state = runtime.entry(peer_id.to_string()).or_default();
        state.last_error = Some(error.to_string());
        state.consecutive_failures += 1;

        // Exponential backoff with 60s cap: 1s, 2s, 4s, 8s, 16s, 32s, 60s
        let backoff_secs = (1u64 << state.consecutive_failures.min(6)).min(60);
        state.next_retry_at = Some(Instant::now() + Duration::from_secs(backoff_secs));
    }

    /// Returns aggregate sync status across all peers and local database version.
    pub async fn get_status(&self) -> Result<SyncStatus> {
        let peers = { self.peers.read().await.clone() };
        let runtime = { self.peer_runtime.read().await.clone() };
        let state = { self.state.read().await.clone() };
        let mailbox_url = { self.mailbox_url.read().await.clone() };
        let m_runtime = { self.mailbox_runtime.read().await.clone() };

        let local_db_version = self.db.get_db_version().unwrap_or(0);
        let mut peer_statuses = Vec::new();
        let mut min_push_cursor = local_db_version;
        let mut active_transport = None;
        let mut last_synced_at = None;
        let mut last_error = None;

        let conn = self.db.conn();
        let my_site_id = crate::sync::get_site_id(&conn).ok().map(hex::encode).unwrap_or_default();

        for peer in peers {
            if peer.site_id == my_site_id {
                continue;
            }
            let r_state = runtime.get(&peer.site_id).cloned().unwrap_or_default();
            let pull_cursor = cursors::get_cursor(&conn, &peer.site_id, CursorDirection::Pull)
                .unwrap_or(0);
            let push_cursor = cursors::get_cursor(&conn, &peer.site_id, CursorDirection::Push)
                .unwrap_or(0);

            if push_cursor < min_push_cursor {
                min_push_cursor = push_cursor;
            }

            if r_state.active_transport.is_some() {
                active_transport = r_state.active_transport;
            }

            if let Some(ts) = r_state.last_synced_at {
                last_synced_at = Some(last_synced_at.map_or(ts, |prev: i64| prev.max(ts)));
            }

            if r_state.last_error.is_some() {
                last_error = r_state.last_error.clone();
            }

            peer_statuses.push(PeerSyncStatus {
                peer_id: peer.site_id,
                name: peer.name,
                last_synced_at: r_state.last_synced_at,
                last_error: r_state.last_error,
                active_transport: r_state.active_transport,
                consecutive_failures: r_state.consecutive_failures,
                pull_cursor,
                push_cursor,
            });
        }

        if let Ok(known_peers) = cursors::list_peers(&conn) {
            let now = chrono::Utc::now().timestamp_millis();
            for kp in known_peers {
                if kp.peer_id == my_site_id || kp.peer_id == "mailbox" {
                    continue;
                }
                if !peer_statuses.iter().any(|p| p.peer_id == kp.peer_id) {
                    if let Some(ts) = kp.last_seen_at {
                        last_synced_at = Some(last_synced_at.map_or(ts, |prev: i64| prev.max(ts)));
                    }
                    // Only mark as actively connected if seen within the last 45 seconds
                    let is_active = kp.last_seen_at.map_or(false, |ts| (now - ts) < 45_000);
                    if is_active && kp.push_version < min_push_cursor {
                        min_push_cursor = kp.push_version;
                    }
                    let transport = if is_active && self.is_lan_enabled() {
                        if let Some(r_state) = runtime.get(&kp.peer_id) {
                            r_state.active_transport
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                    if transport.is_some() && active_transport.is_none() {
                        active_transport = transport;
                    }

                    peer_statuses.push(PeerSyncStatus {
                        peer_id: kp.peer_id,
                        name: kp.display_name.unwrap_or_else(|| "Paired Device".to_string()),
                        last_synced_at: kp.last_seen_at,
                        last_error: None,
                        active_transport: transport,
                        consecutive_failures: 0,
                        pull_cursor: kp.pull_version,
                        push_cursor: kp.push_version,
                    });
                }
            }
        }

        let is_mailbox_configured = mailbox_url.as_ref().map_or(false, |u| !u.is_empty());
        let mut mailbox_push_cursor = 0;

        // If mailbox is configured, include mailbox in peer statuses
        if is_mailbox_configured {
            let pull_cursor = cursors::get_cursor(&conn, "mailbox", CursorDirection::Pull).unwrap_or(0);
            let push_cursor = cursors::get_cursor(&conn, "mailbox", CursorDirection::Push).unwrap_or(0);
            mailbox_push_cursor = push_cursor;

            if m_runtime.active_transport.is_some() && active_transport.is_none() {
                active_transport = m_runtime.active_transport;
            }
            if let Some(ts) = m_runtime.last_synced_at {
                last_synced_at = Some(last_synced_at.map_or(ts, |prev: i64| prev.max(ts)));
            }

            peer_statuses.push(PeerSyncStatus {
                peer_id: "mailbox".to_string(),
                name: "Cloud Mailbox".to_string(),
                last_synced_at: m_runtime.last_synced_at,
                last_error: m_runtime.last_error.clone(),
                active_transport: m_runtime.active_transport,
                consecutive_failures: m_runtime.consecutive_failures,
                pull_cursor,
                push_cursor,
            });
        }

        // Pending changes: if mailbox is configured, calculate against mailbox push cursor
        let pending_local_changes = if is_mailbox_configured {
            (local_db_version - mailbox_push_cursor).max(0)
        } else {
            (local_db_version - min_push_cursor).max(0)
        };

        // Error reporting: if mailbox is healthy and active, do not surface transient LAN peer errors as global error
        let is_mailbox_healthy = is_mailbox_configured
            && m_runtime.last_error.is_none()
            && m_runtime.active_transport.is_some();

        let top_level_error = if is_mailbox_healthy {
            None
        } else if let Some(ref m_err) = m_runtime.last_error {
            Some(m_err.clone())
        } else {
            last_error
        };

        Ok(SyncStatus {
            state,
            active_transport,
            last_synced_at,
            pending_local_changes,
            last_error: top_level_error,
            peers: peer_statuses,
        })
    }

    /// Forgets / removes a peer from both the cursors table and in-memory runtime.
    pub async fn forget_peer(&self, peer_id: &str) -> Result<()> {
        {
            let conn = self.db.conn();
            cursors::delete_peer(&conn, peer_id)?;
        }
        let mut runtime = self.peer_runtime.write().await;
        runtime.remove(peer_id);
        let mut peers = self.peers.write().await;
        peers.retain(|p| p.site_id != peer_id);
        Ok(())
    }

    /// Clears transient runtime state for inactive peers without deleting persistent paired peers.
    pub async fn clear_inactive_peers(&self) -> Result<()> {
        Ok(())
    }

    /// Returns a working HttpClient connected to an endpoint of the peer, if reachable.
    pub async fn get_working_client_for_peer(&self, peer: &PeerConfig) -> Option<HttpClient> {
        let auth_token = { self.auth_token.read().await.clone() };
        let sync_keys = { self.sync_keys.read().await.clone() };
        let local_site_id = hex::encode(self.db.get_site_id().ok()?);

        let last_working = {
            let runtime = self.peer_runtime.read().await;
            runtime.get(&peer.site_id).and_then(|r| r.last_working_endpoint.clone())
        };

        let mut candidate_endpoints = Vec::new();
        if let Some(ref lw) = last_working {
            if let Some(ep) = peer.endpoints.iter().find(|e| &e.url == lw) {
                candidate_endpoints.push(ep.clone());
            }
        }
        for ep in &peer.endpoints {
            if !candidate_endpoints.iter().any(|c| c.url == ep.url) {
                candidate_endpoints.push(ep.clone());
            }
        }

        for ep in candidate_endpoints {
            let client = HttpClient::new(
                ep.url.clone(),
                ep.kind,
                auth_token.clone(),
                if peer.site_id.len() == 32 { Some(peer.site_id.clone()) } else { None },
                Some(local_site_id.clone()),
                sync_keys.clone(),
            );

            if let Ok(health) = client.health().await {
                if health.site_id != local_site_id {
                    return Some(client);
                }
            }
        }
        None
    }

    pub async fn handle_discovered_peer(self: &Arc<Self>, discovered: crate::transport::discovery::DiscoveredPeer) {
        if !self.is_lan_enabled() {
            return;
        }

        if let Ok(local_site) = self.db.get_site_id() {
            if hex::encode(local_site) == discovered.site_id {
                return;
            }
        }

        // 1. Check if the peer is already known by exact site_id or endpoint
        let is_exact_known = {
            let peers = self.peers.read().await;
            peers.iter().any(|p| p.site_id == discovered.site_id || p.endpoints.iter().any(|e| e.url == discovered.endpoint_url))
        } || {
            let conn = self.db.conn();
            cursors::list_peers(&conn)
                .map(|list| list.iter().any(|kp| kp.peer_id == discovered.site_id))
                .unwrap_or(false)
        };

        let auth_token = self.auth_token.read().await.clone();
        let sync_keys = self.sync_keys.read().await.clone();

        // 2. If not known by exact site_id, verify using shared auth_token
        let is_verified = if is_exact_known {
            true
        } else if let Some(ref token) = auth_token {
            let probe_client = HttpClient::new(
                discovered.endpoint_url.clone(),
                TransportKind::Lan,
                Some(token.clone()),
                Some(discovered.site_id.clone()),
                None,
                sync_keys.clone(),
            );
            match probe_client.health().await {
                Ok(health) => {
                    log::info!(
                        "Successfully verified discovered LAN peer {} ({}) with shared pairing token",
                        health.device_name.as_deref().unwrap_or(&discovered.device_name),
                        health.site_id
                    );
                    true
                }
                Err(e) => {
                    log::debug!(
                        "Ignoring un-paired LAN peer {} ({}): health verification failed: {}",
                        discovered.device_name,
                        discovered.site_id,
                        e
                    );
                    false
                }
            }
        } else {
            false
        };

        if !is_verified {
            log::debug!(
                "Ignoring un-paired LAN peer {} ({})",
                discovered.device_name,
                discovered.site_id
            );
            return;
        }

        let mut peers = self.peers.write().await;
        let peer_cfg = if let Some(existing) = peers.iter_mut().find(|p| p.site_id == discovered.site_id) {
            if !discovered.device_name.is_empty() {
                existing.name = discovered.device_name.clone();
            }
            existing.endpoints.retain(|e| !e.url.contains("localhost") && !e.url.contains("127.0.0.1"));
            if !existing.endpoints.iter().any(|e| e.url == discovered.endpoint_url) {
                existing.endpoints.push(EndpointConfig {
                    kind: TransportKind::Lan,
                    url: discovered.endpoint_url.clone(),
                });
            }
            existing.clone()
        } else if let Some(placeholder) = peers.iter_mut().find(|p| !is_valid_site_id(&p.site_id) || p.name == "Paired Hub") {
            log::info!(
                "Adopting real site_id {} and endpoint {} for placeholder peer {}",
                discovered.site_id,
                discovered.endpoint_url,
                placeholder.name
            );
            placeholder.site_id = discovered.site_id.clone();
            if !discovered.device_name.is_empty() {
                placeholder.name = discovered.device_name.clone();
            }
            placeholder.endpoints.retain(|e| !e.url.contains("localhost") && !e.url.contains("127.0.0.1"));
            if !placeholder.endpoints.iter().any(|e| e.url == discovered.endpoint_url) {
                placeholder.endpoints.push(EndpointConfig {
                    kind: TransportKind::Lan,
                    url: discovered.endpoint_url.clone(),
                });
            }
            placeholder.clone()
        } else if let Some(existing) = peers.iter_mut().find(|p| p.endpoints.iter().any(|e| e.url == discovered.endpoint_url)) {
            existing.site_id = discovered.site_id.clone();
            if !discovered.device_name.is_empty() {
                existing.name = discovered.device_name.clone();
            }
            existing.clone()
        } else {
            let new_peer = PeerConfig {
                site_id: discovered.site_id.clone(),
                name: discovered.device_name.clone(),
                endpoints: vec![EndpointConfig {
                    kind: TransportKind::Lan,
                    url: discovered.endpoint_url.clone(),
                }],
            };
            peers.push(new_peer.clone());
            new_peer
        };
        drop(peers);

        {
            let mut runtime = self.peer_runtime.write().await;
            let state = runtime.entry(discovered.site_id.clone()).or_default();
            state.last_working_endpoint = Some(discovered.endpoint_url.clone());
            state.active_transport = Some(TransportKind::Lan);
        }

        self.start_sse_listener_for_peer(peer_cfg.clone()).await;

        let this = self.clone();
        tokio::spawn(async move {
            let _ = this.sync_peer_cycle(&peer_cfg).await;
        });
    }

    pub async fn start_sse_listener_for_peer(self: &Arc<Self>, peer: PeerConfig) {
        let mut listeners = self.active_listeners.lock().await;
        if listeners.contains_key(&peer.site_id) {
            return;
        }
        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
        listeners.insert(peer.site_id.clone(), stop_tx);

        let this = self.clone();
        let auth_token = self.auth_token.read().await.clone();
        let local_site_id = self.db.get_site_id().ok().map(hex::encode);
        let sync_keys = self.sync_keys.read().await.clone();

        tokio::spawn(async move {
            let endpoint_url = {
                let runtime = this.peer_runtime.read().await;
                runtime
                    .get(&peer.site_id)
                    .and_then(|r| r.last_working_endpoint.clone())
                    .or_else(|| peer.endpoints.first().map(|e| e.url.clone()))
            };

            let Some(url) = endpoint_url else { return };

            let client = HttpClient::new(
                url,
                TransportKind::Lan,
                auth_token,
                Some(peer.site_id.clone()),
                local_site_id,
                sync_keys,
            );

            use futures_util::StreamExt;
            if let Some(mut stream) = client.subscribe() {
                loop {
                    tokio::select! {
                        _ = &mut stop_rx => {
                            break;
                        }
                        event = stream.next() => {
                            match event {
                                Some(crate::transport::SyncEvent::ChangesAvailable { db_version: _ }) => {
                                    log::debug!("SSE live event received from peer {}, syncing immediately", peer.site_id);
                                    let _ = this.sync_peer_cycle(&peer).await;
                                }
                                None => {
                                    tokio::time::sleep(Duration::from_secs(2)).await;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            let mut listeners = this.active_listeners.lock().await;
            listeners.remove(&peer.site_id);
        });
    }

    pub async fn fast_push_pending_changes(&self) {
        if self.is_paused() {
            return;
        }

        let local_site_id = match self.db.get_site_id() {
            Ok(s) => s,
            Err(_) => return,
        };
        let local_site_id_hex = hex::encode(&local_site_id);
        let sync_keys = { self.sync_keys.read().await.clone() };
        let auth_token = { self.auth_token.read().await.clone() };

        // 1. Fast push to Mailbox if configured
        if let Some(ref m_url) = *self.mailbox_url.read().await {
            if !m_url.is_empty() {
                if let Some(ref keys) = sync_keys {
                    let m_url = m_url.clone();
                    let keys = keys.clone();
                    let db = self.db.clone();
                    let local_site_id_hex = local_site_id_hex.clone();
                    tokio::spawn(async move {
                        let client = MailboxClient::new(m_url, local_site_id_hex, keys);
                        let _ = sync_with_mailbox(&db, &client, 2000).await;
                    });
                }
            }
        }

        // 2. Fast push to LAN peers
        if !self.is_lan_enabled() {
            return;
        }

        let peers = { self.peers.read().await.clone() };
        if peers.is_empty() {
            return;
        }

        for peer in peers {
            let last_working = {
                let runtime = self.peer_runtime.read().await;
                runtime.get(&peer.site_id).and_then(|r| r.last_working_endpoint.clone())
            };

            let mut candidate_urls = Vec::new();
            if let Some(ref lw) = last_working {
                candidate_urls.push(lw.clone());
            }
            for ep in &peer.endpoints {
                if !candidate_urls.contains(&ep.url) {
                    candidate_urls.push(ep.url.clone());
                }
            }

            if candidate_urls.is_empty() {
                continue;
            }

            let peer_site_id = peer.site_id.clone();
            let peer_site_id_bytes = hex::decode(&peer_site_id).unwrap_or_default();
            let db = self.db.clone();
            let sync_keys = sync_keys.clone();
            let auth_token = auth_token.clone();
            let local_site_id_hex = local_site_id_hex.clone();
            let local_site_id_bytes = local_site_id.clone();

            tokio::spawn(async move {
                let push_cursor = {
                    let conn = db.conn();
                    cursors::get_cursor(&conn, &peer_site_id, CursorDirection::Push).unwrap_or(0)
                };

                let (changes, next_cursor, _) = {
                    let conn = db.conn();
                    match crate::sync::get_paged_changes(
                        &conn,
                        push_cursor,
                        1000,
                        Some(&peer_site_id_bytes),
                    ) {
                        Ok(res) => res,
                        Err(_) => return,
                    }
                };

                if changes.is_empty() {
                    return;
                }

                for target_url in candidate_urls {
                    let client = HttpClient::new(
                        target_url,
                        TransportKind::Lan,
                        auth_token.clone(),
                        Some(peer_site_id.clone()),
                        Some(local_site_id_hex.clone()),
                        sync_keys.clone(),
                    );

                    let batch = crate::transport::ChangeBatch {
                        changes: changes.clone(),
                        sender_site_id: hex::encode(&local_site_id_bytes),
                        protocol_version: crate::sync::PROTOCOL_VERSION,
                        schema_version: crate::sync::CURRENT_SCHEMA_VERSION,
                    };

                    if let Ok(ack) = client.push(batch).await {
                        let conn = db.conn();
                        let _ = cursors::set_cursor(&conn, &peer_site_id, CursorDirection::Push, next_cursor.max(ack.applied_through));
                        break;
                    }
                }
            });
        }
    }
}
