use std::sync::Arc;
use std::time::Duration;
use async_trait::async_trait;
use base64::prelude::*;
use bytes::Bytes;
use futures_util::stream::{BoxStream, StreamExt};

use crate::crypto::{
    compute_aad, decrypt_payload, encrypt_payload, SyncKeys, XCHACHA20_NONCE_SIZE,
};
use crate::sync::protocol::{
    compress_payload, decompress_payload, SyncEnvelope, WireChange, WireChangesetPayload,
    MAX_DECOMPRESSED_PAYLOAD_BYTES,
};
use crate::sync::{CrChange, CURRENT_SCHEMA_VERSION, PROTOCOL_VERSION};
use crate::transport::server::{
    is_valid_file_id, ApplyChangesRequest, ChangesResponse, MissingFilesResponse,
};
use crate::transport::{
    ByteRange, ChangeBatch, ChangePage, FileId, FileStream, PeerHealth, PushAck, SyncEvent,
    Transport, TransportError, TransportKind,
};

/// HTTP client transport connecting to an embedded hub sync server over LAN or Tailscale.
pub struct HttpClient {
    base_url: String,
    kind: TransportKind,
    auth_token: Option<String>,
    expected_site_id: Option<String>,
    local_site_id: Option<String>,
    sync_keys: Option<Arc<SyncKeys>>,
    client: reqwest::Client,
}

impl HttpClient {
    pub fn new(
        base_url: String,
        kind: TransportKind,
        auth_token: Option<String>,
        expected_site_id: Option<String>,
        local_site_id: Option<String>,
        sync_keys: Option<Arc<SyncKeys>>,
    ) -> Self {
        let timeout = match kind {
            TransportKind::Lan => Duration::from_millis(2500),
            TransportKind::Tailscale => Duration::from_millis(5000),
            _ => Duration::from_secs(10),
        };
        let connect_timeout = match kind {
            TransportKind::Lan => Duration::from_millis(800),
            _ => Duration::from_millis(2500),
        };

        let client = reqwest::Client::builder()
            .connect_timeout(connect_timeout)
            .timeout(timeout)
            .build()
            .unwrap_or_default();

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            kind,
            auth_token,
            expected_site_id,
            local_site_id,
            sync_keys,
            client,
        }
    }

    pub fn with_client(mut self, client: reqwest::Client) -> Self {
        self.client = client;
        self
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn map_reqwest_error(&self, e: reqwest::Error) -> TransportError {
        if e.is_connect() || e.is_timeout() {
            TransportError::Unreachable(e.to_string())
        } else {
            TransportError::Other(e.to_string())
        }
    }

    fn map_status_error(&self, status: reqwest::StatusCode, text: &str) -> TransportError {
        match status.as_u16() {
            401 => TransportError::Unauthorized(text.to_string()),
            409 => TransportError::SchemaMismatch(text.to_string()),
            413 => TransportError::PayloadTooLarge(text.to_string()),
            422 => TransportError::Corrupt(text.to_string()),
            426 => TransportError::ProtocolMismatch(text.to_string()),
            429 => TransportError::RateLimited {
                retry_after_secs: 5,
            },
            _ => TransportError::Other(format!("HTTP {}: {}", status, text)),
        }
    }
}

#[async_trait]
impl Transport for HttpClient {
    fn kind(&self) -> TransportKind {
        self.kind
    }

    async fn health(&self) -> Result<PeerHealth, TransportError> {
        let url = format!("{}/api/sync/health", self.base_url);
        let mut req = self.client.get(&url);
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let health: PeerHealth = resp
            .json()
            .await
            .map_err(|e| TransportError::Corrupt(e.to_string()))?;

        if let Some(expected) = &self.expected_site_id {
            if &health.site_id != expected {
                return Err(TransportError::Other(format!(
                    "Peer site_id mismatch: expected {}, got {}",
                    expected, health.site_id
                )));
            }
        }

        if health.protocol_version != PROTOCOL_VERSION {
            return Err(TransportError::ProtocolMismatch(format!(
                "local v{} vs peer v{}",
                PROTOCOL_VERSION, health.protocol_version
            )));
        }

        if health.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(TransportError::SchemaMismatch(format!(
                "local v{} vs peer v{}",
                CURRENT_SCHEMA_VERSION, health.schema_version
            )));
        }

        Ok(health)
    }

    async fn pull(&self, since: i64, limit: u32) -> Result<ChangePage, TransportError> {
        let mut url = format!("{}/api/sync/changes?since={}&limit={}", self.base_url, since, limit);
        if let Some(req_id) = &self.local_site_id {
            url.push_str(&format!("&requester={}", req_id));
        }
        if self.sync_keys.is_some() {
            url.push_str("&envelope=true");
        }

        let mut req = self.client.get(&url);
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let changes_resp: ChangesResponse = resp
            .json()
            .await
            .map_err(|e| TransportError::Corrupt(format!("Failed to parse changes response: {}", e)))?;

        let (wire_changes, next_cursor, has_more, server_db_version) = match changes_resp {
            ChangesResponse::Envelope(env) => {
                if env.protocol_version != PROTOCOL_VERSION {
                    return Err(TransportError::ProtocolMismatch(format!(
                        "Envelope protocol mismatch: v{}",
                        env.protocol_version
                    )));
                }
                if env.schema_version != CURRENT_SCHEMA_VERSION {
                    return Err(TransportError::SchemaMismatch(format!(
                        "Envelope schema mismatch: v{}",
                        env.schema_version
                    )));
                }

                let Some(keys) = self.sync_keys.as_ref() else {
                    return Err(TransportError::Corrupt(
                        "Received encrypted envelope but no sync keys configured".to_string(),
                    ));
                };

                let aad = compute_aad(env.protocol_version, &env.sender_site_id, &env.kind, env.key_id);
                let nonce_bytes = BASE64_STANDARD
                    .decode(&env.nonce)
                    .map_err(|e| TransportError::Corrupt(format!("Invalid nonce base64: {}", e)))?;
                let ciphertext = BASE64_STANDARD
                    .decode(&env.payload)
                    .map_err(|e| TransportError::Corrupt(format!("Invalid payload base64: {}", e)))?;

                let nonce_arr: [u8; XCHACHA20_NONCE_SIZE] = nonce_bytes
                    .as_slice()
                    .try_into()
                    .map_err(|_| TransportError::Corrupt("Nonce must be 24 bytes".to_string()))?;

                let decrypted = decrypt_payload(&keys.enc_key, &ciphertext, &nonce_arr, &aad)
                    .map_err(|e| TransportError::Corrupt(format!("Decryption failed: {}", e)))?;

                let decompressed = decompress_payload(&decrypted, MAX_DECOMPRESSED_PAYLOAD_BYTES)
                    .map_err(|e| TransportError::Corrupt(format!("Decompression failed: {}", e)))?;

                let payload: WireChangesetPayload = serde_json::from_slice(&decompressed)
                    .map_err(|e| TransportError::Corrupt(format!("Invalid JSON payload: {}", e)))?;

                (
                    payload.changes,
                    payload.next_cursor,
                    payload.has_more,
                    payload.server_db_version,
                )
            }
            ChangesResponse::Payload(p) => (p.changes, p.next_cursor, p.has_more, p.server_db_version),
        };

        let mut changes = Vec::with_capacity(wire_changes.len());
        for wc in wire_changes {
            let cc = CrChange::try_from(wc)
                .map_err(|e| TransportError::Corrupt(format!("Failed to parse change: {}", e)))?;
            changes.push(cc);
        }

        Ok(ChangePage {
            changes,
            next_cursor,
            has_more,
            server_db_version,
        })
    }

    async fn push(&self, batch: ChangeBatch) -> Result<PushAck, TransportError> {
        let url = format!("{}/api/sync/changes", self.base_url);
        let mut req = self.client.post(&url);
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }

        let wire_changes: Vec<WireChange> = batch.changes.into_iter().map(WireChange::from).collect();

        if let Some(keys) = self.sync_keys.as_ref() {
            let payload = WireChangesetPayload {
                changes: wire_changes,
                next_cursor: 0,
                has_more: false,
                server_db_version: 0,
            };

            let json_bytes = serde_json::to_vec(&payload)
                .map_err(|e| TransportError::Other(e.to_string()))?;
            let compressed = compress_payload(&json_bytes)
                .map_err(|e| TransportError::Other(e.to_string()))?;
            let aad = compute_aad(batch.protocol_version, &batch.sender_site_id, "changes", 1);
            let (ciphertext, nonce) = encrypt_payload(&keys.enc_key, &compressed, &aad)
                .map_err(|e| TransportError::Other(e.to_string()))?;

            let env = SyncEnvelope {
                protocol_version: batch.protocol_version,
                schema_version: batch.schema_version,
                sender_site_id: batch.sender_site_id,
                kind: "changes".to_string(),
                key_id: 1,
                nonce: BASE64_STANDARD.encode(nonce),
                payload: BASE64_STANDARD.encode(ciphertext),
            };

            req = req.json(&env);
        } else {
            let direct = ApplyChangesRequest {
                protocol_version: Some(batch.protocol_version),
                schema_version: Some(batch.schema_version),
                changes: wire_changes,
            };
            req = req.json(&direct);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let ack: PushAck = resp
            .json()
            .await
            .map_err(|e| TransportError::Corrupt(format!("Failed to parse push ack: {}", e)))?;

        Ok(ack)
    }

    async fn missing_files(&self, ids: &[FileId]) -> Result<Vec<FileId>, TransportError> {
        let url = format!("{}/api/sync/files/missing", self.base_url);
        let mut req = self.client.post(&url);
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }

        let resp = req
            .json(&serde_json::json!({ "file_ids": ids }))
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let missing: MissingFilesResponse = resp
            .json()
            .await
            .map_err(|e| TransportError::Corrupt(e.to_string()))?;

        Ok(missing.missing_ids)
    }

    async fn get_file(&self, id: &FileId, range: Option<ByteRange>) -> Result<FileStream, TransportError> {
        if !is_valid_file_id(id) {
            return Err(TransportError::Other(format!("Invalid file ID: {}", id)));
        }

        let url = format!("{}/api/sync/files/{}", self.base_url, id);
        let mut req = self.client.get(&url);
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }

        if let Some(r) = range {
            req = req.header("Range", format!("bytes={}-{}", r.start, r.end.saturating_sub(1)));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let stream = resp
            .bytes_stream()
            .map(|chunk| chunk.map_err(|e| TransportError::Other(e.to_string())));

        Ok(Box::pin(stream))
    }

    async fn put_file(&self, id: &FileId, offset: u64, bytes: Bytes) -> Result<(), TransportError> {
        if !is_valid_file_id(id) {
            return Err(TransportError::Other(format!("Invalid file ID: {}", id)));
        }

        let url = format!("{}/api/sync/files/{}?offset={}", self.base_url, id, offset);
        let mut req = self.client.put(&url);
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }

        let resp = req
            .body(bytes)
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        Ok(())
    }

    fn subscribe(&self) -> Option<BoxStream<'static, SyncEvent>> {
        let (tx, rx) = tokio::sync::mpsc::channel(32);
        let url = format!("{}/api/sync/events", self.base_url);
        let auth_token = self.auth_token.clone();

        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(1500))
                .build()
                .unwrap_or_default();

            loop {
                let mut req = client.get(&url);
                if let Some(token) = &auth_token {
                    req = req.bearer_auth(token);
                }

                if let Ok(res) = req.send().await {
                    if res.status().is_success() {
                        let mut byte_stream = res.bytes_stream();
                        let mut buffer = String::new();

                        while let Some(chunk_res) = byte_stream.next().await {
                            if let Ok(chunk) = chunk_res {
                                if let Ok(text) = std::str::from_utf8(&chunk) {
                                    buffer.push_str(text);
                                    while let Some(idx) = buffer.find("\n\n") {
                                        let event_block = buffer[..idx].to_string();
                                        buffer = buffer[idx + 2..].to_string();

                                        for line in event_block.lines() {
                                            if let Some(data) = line.strip_prefix("data:") {
                                                let data = data.trim();
                                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                                                    if let Some(version) = val.get("db_version").and_then(|v| v.as_i64()) {
                                                        if tx.send(SyncEvent::ChangesAvailable { db_version: version }).await.is_err() {
                                                            return;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            } else {
                                break;
                            }
                        }
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                if tx.is_closed() {
                    return;
                }
            }
        });

        let stream = futures_util::stream::unfold(rx, |mut rx| async move {
            rx.recv().await.map(|item| (item, rx))
        });

        Some(Box::pin(stream))
    }
}
