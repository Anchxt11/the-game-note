use std::sync::Arc;
use std::time::Duration;
use base64::prelude::*;
use futures_util::stream::{BoxStream, StreamExt};
use serde::{Deserialize, Serialize};

use crate::crypto::{
    compute_aad, decrypt_payload, encrypt_payload, SyncKeys, XCHACHA20_NONCE_SIZE,
};
use crate::db::Database;
use crate::error::{AppError, Result};
use crate::sync::cursors::{self, CursorDirection};
use crate::sync::protocol::{
    compress_payload, decompress_payload, SyncEnvelope, WireChange, WireChangesetPayload,
    MAX_DECOMPRESSED_PAYLOAD_BYTES,
};
use crate::sync::{apply_changes_conn, get_paged_changes, CrChange, CURRENT_SCHEMA_VERSION, PROTOCOL_VERSION};
use crate::transport::{ChangeBatch, TransportError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailboxBatchItem {
    pub seq: u64,
    pub device_id: String,
    pub created_at: i64,
    pub size: usize,
    pub envelope: SyncEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PostChangesRequest {
    device_id: String,
    envelope: SyncEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PostChangesResponse {
    seq: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GetChangesResponse {
    batches: Vec<MailboxBatchItem>,
    latest_seq: u64,
    has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AckRequest {
    device_id: String,
    seq: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MailboxHealth {
    pub status: String,
    pub latest_seq: u64,
    pub devices_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct MailboxSyncStats {
    pub rows_pulled: usize,
    pub rows_pushed: usize,
    pub pull_seq: u64,
    pub push_db_version: i64,
}

/// Zero-knowledge client communicating with the Cloudflare Worker + SQLite Durable Object mailbox.
/// Payloads are always encrypted end-to-end with XChaCha20-Poly1305 before uploading.
pub struct MailboxClient {
    base_url: String,
    device_id: String,
    mailbox_token: String,
    sync_keys: Arc<SyncKeys>,
    client: reqwest::Client,
}

impl MailboxClient {
    pub fn new(base_url: String, device_id: String, sync_keys: Arc<SyncKeys>) -> Self {
        let mailbox_token = sync_keys.mailbox_token_hex();
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(3000))
            .timeout(Duration::from_millis(10000))
            .build()
            .unwrap_or_default();

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            device_id,
            mailbox_token,
            sync_keys,
            client,
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
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

    /// Checks the health and connection of the Cloudflare Worker mailbox.
    pub async fn health(&self) -> std::result::Result<MailboxHealth, TransportError> {
        let url = format!("{}/mailbox/health", self.base_url);
        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.mailbox_token)
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let health: MailboxHealth = resp
            .json()
            .await
            .map_err(|e| TransportError::Corrupt(format!("Invalid health response: {}", e)))?;

        Ok(health)
    }

    /// Encrypts and pushes a batch of changes to the mailbox.
    pub async fn push(&self, batch: &ChangeBatch) -> std::result::Result<u64, TransportError> {
        let url = format!("{}/mailbox/changes", self.base_url);

        let wire_changes: Vec<WireChange> = batch
            .changes
            .iter()
            .cloned()
            .map(WireChange::from)
            .collect();

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
        let (ciphertext, nonce) = encrypt_payload(&self.sync_keys.enc_key, &compressed, &aad)
            .map_err(|e| TransportError::Other(e.to_string()))?;

        let envelope = SyncEnvelope {
            protocol_version: batch.protocol_version,
            schema_version: batch.schema_version,
            sender_site_id: batch.sender_site_id.clone(),
            kind: "changes".to_string(),
            key_id: 1,
            nonce: BASE64_STANDARD.encode(nonce),
            payload: BASE64_STANDARD.encode(ciphertext),
        };

        let req = PostChangesRequest {
            device_id: self.device_id.clone(),
            envelope,
        };

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.mailbox_token)
            .json(&req)
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let post_resp: PostChangesResponse = resp
            .json()
            .await
            .map_err(|e| TransportError::Corrupt(format!("Invalid post response: {}", e)))?;

        Ok(post_resp.seq)
    }

    /// Pulls encrypted batches from the mailbox, filtering self-authored batches and decrypting foreign ones.
    pub async fn pull(
        &self,
        after_seq: u64,
        limit: u32,
    ) -> std::result::Result<(Vec<CrChange>, u64, bool), TransportError> {
        let url = format!("{}/mailbox/changes", self.base_url);
        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.mailbox_token)
            .query(&[("after", after_seq.to_string()), ("limit", limit.to_string())])
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(self.map_status_error(status, &body));
        }

        let changes_resp: GetChangesResponse = resp
            .json()
            .await
            .map_err(|e| TransportError::Corrupt(format!("Invalid pull response: {}", e)))?;

        let mut all_changes = Vec::new();
        let mut max_seq = after_seq;

        for item in changes_resp.batches {
            if item.seq > max_seq {
                max_seq = item.seq;
            }

            // Skip self-authored batches
            if item.device_id == self.device_id {
                continue;
            }

            // Decrypt foreign envelope
            let env = item.envelope;
            let nonce_bytes = BASE64_STANDARD
                .decode(&env.nonce)
                .map_err(|e| TransportError::Corrupt(format!("Invalid base64 nonce: {}", e)))?;
            let ciphertext = BASE64_STANDARD
                .decode(&env.payload)
                .map_err(|e| TransportError::Corrupt(format!("Invalid base64 payload: {}", e)))?;
            let aad = compute_aad(env.protocol_version, &env.sender_site_id, &env.kind, env.key_id);
            let nonce_arr: [u8; XCHACHA20_NONCE_SIZE] = nonce_bytes
                .try_into()
                .map_err(|_| TransportError::Corrupt("Nonce must be 24 bytes".to_string()))?;

            let decrypted = match decrypt_payload(&self.sync_keys.enc_key, &ciphertext, &nonce_arr, &aad) {
                Ok(d) => d,
                Err(e) => {
                    log::warn!("Skipping foreign batch seq {} due to decryption error: {}", item.seq, e);
                    continue;
                }
            };
            let decompressed = match decompress_payload(&decrypted, MAX_DECOMPRESSED_PAYLOAD_BYTES) {
                Ok(d) => d,
                Err(e) => {
                    log::warn!("Skipping batch seq {} due to decompression error: {}", item.seq, e);
                    continue;
                }
            };
            let payload: WireChangesetPayload = match serde_json::from_slice(&decompressed) {
                Ok(p) => p,
                Err(e) => {
                    log::warn!("Skipping batch seq {} due to JSON parsing error: {}", item.seq, e);
                    continue;
                }
            };

            for wc in payload.changes {
                if let Ok(cc) = CrChange::try_from(wc) {
                    all_changes.push(cc);
                }
            }
        }

        Ok((all_changes, max_seq, changes_resp.has_more))
    }

    /// Acknowledges processed sequence number to allow mailbox storage compaction.
    pub async fn ack(&self, seq: u64) -> std::result::Result<(), TransportError> {
        let url = format!("{}/mailbox/ack", self.base_url);
        let req = AckRequest {
            device_id: self.device_id.clone(),
            seq,
        };

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.mailbox_token)
            .json(&req)
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

    /// Subscribes to live SSE events from the mailbox Durable Object (`/mailbox/events`).
    /// Emits latest mailbox sequence numbers in real-time (~30-50ms latency).
    pub fn subscribe(&self) -> Option<BoxStream<'static, u64>> {
        let (tx, rx) = tokio::sync::mpsc::channel(32);
        let url = format!("{}/mailbox/events", self.base_url);
        let token = self.mailbox_token.clone();

        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(3000))
                .build()
                .unwrap_or_default();

            loop {
                let req = client.get(&url).bearer_auth(&token);

                if let Ok(res) = req.send().await {
                    if res.status().is_success() {
                        let mut byte_stream = res.bytes_stream();
                        let mut buffer = String::new();

                        loop {
                            let next_chunk = tokio::time::timeout(Duration::from_secs(35), byte_stream.next()).await;
                            let chunk_res = match next_chunk {
                                Ok(Some(res)) => res,
                                Ok(None) => break,
                                Err(_) => {
                                    log::debug!("Mailbox SSE idle timeout (no keepalive ping in 35s), reconnecting");
                                    break;
                                }
                            };

                            if let Ok(chunk) = chunk_res {
                                if let Ok(text) = std::str::from_utf8(&chunk) {
                                    buffer.push_str(text);
                                    while let Some(idx) = buffer.find("\n\n") {
                                        let event_block = buffer[..idx].to_string();
                                        buffer = buffer[idx + 2..].to_string();

                                        for line in event_block.lines() {
                                            if line.starts_with(':') {
                                                continue;
                                            }
                                            if let Some(data) = line.strip_prefix("data:") {
                                                let data = data.trim();
                                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                                                    if let Some(seq) = val.get("seq").and_then(|v| v.as_u64()) {
                                                        if tx.send(seq).await.is_err() {
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

                tokio::time::sleep(Duration::from_millis(1000)).await;
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

/// Executes a complete, bidirectional sync cycle against the Cloudflare mailbox.
pub async fn sync_with_mailbox(
    db: &Database,
    client: &MailboxClient,
    batch_limit: u32,
) -> Result<MailboxSyncStats> {
    let limit = if batch_limit == 0 { 100 } else { batch_limit };

    // 1. Health check
    let _health = client
        .health()
        .await
        .map_err(|e| AppError::InvalidOperation(e.to_string()))?;

    let local_site_id = db.get_site_id()?;
    let local_site_id_hex = hex::encode(&local_site_id);

    // Register mailbox peer
    {
        let conn = db.conn();
        cursors::upsert_peer(&conn, "mailbox", Some("Cloud Mailbox"))?;
    }

    let mut stats = MailboxSyncStats::default();

    // 2. PULL Phase: Fetch from mailbox and apply locally
    let mut pull_seq = {
        let conn = db.conn();
        let cur = cursors::get_cursor(&conn, "mailbox", CursorDirection::Pull)? as u64;
        if cur > _health.latest_seq {
            log::warn!("Mailbox latest_seq ({}) is lower than local cursor ({}). Resetting cursors to re-sync.", _health.latest_seq, cur);
            let _ = cursors::set_cursor(&conn, "mailbox", CursorDirection::Pull, 0);
            let _ = cursors::set_cursor(&conn, "mailbox", CursorDirection::Push, 0);
            0
        } else {
            cur
        }
    };

    loop {
        let (changes, latest_seq, has_more) = client
            .pull(pull_seq, limit)
            .await
            .map_err(|e| AppError::InvalidOperation(e.to_string()))?;

        if !changes.is_empty() {
            let mut conn = db.conn();
            let tx = conn.transaction()?;
            apply_changes_conn(&tx, &changes)?;
            cursors::set_cursor(&tx, "mailbox", CursorDirection::Pull, latest_seq as i64)?;

            // Register peer presence for any changes received
            let mut seen_sites = std::collections::HashSet::new();
            for c in &changes {
                let peer_site = hex::encode(&c.site_id);
                if peer_site != local_site_id_hex && seen_sites.insert(peer_site.clone()) {
                    let _ = cursors::upsert_peer(&tx, &peer_site, None);
                }
            }

            tx.commit()?;

            stats.rows_pulled += changes.len();
        } else if latest_seq > pull_seq {
            let conn = db.conn();
            cursors::set_cursor(&conn, "mailbox", CursorDirection::Pull, latest_seq as i64)?;
        }

        pull_seq = latest_seq;
        if !has_more {
            break;
        }
    }
    stats.pull_seq = pull_seq;

    // Best-effort ack
    if pull_seq > 0 {
        let _ = client.ack(pull_seq).await;
    }

    // 3. PUSH Phase: Query local changes since mailbox push cursor and upload
    let mut push_db_version = {
        let conn = db.conn();
        cursors::get_cursor(&conn, "mailbox", CursorDirection::Push)?
    };

    loop {
        let (changes, next_cursor, has_more) = {
            let conn = db.conn();
            get_paged_changes(&conn, push_db_version, limit, None)?
        };

        if changes.is_empty() {
            let current_db_version = db.get_db_version()?;
            if push_db_version < current_db_version {
                let conn = db.conn();
                cursors::set_cursor(&conn, "mailbox", CursorDirection::Push, current_db_version)?;
                push_db_version = current_db_version;
            }
            break;
        }

        // Only push own changes to cloud mailbox (prevent echoing pulled foreign changes)
        let own_changes: Vec<CrChange> = changes
            .into_iter()
            .filter(|c| c.site_id == local_site_id)
            .collect();

        if !own_changes.is_empty() {
            let batch_len = own_changes.len();
            let batch = ChangeBatch {
                changes: own_changes,
                sender_site_id: local_site_id_hex.clone(),
                protocol_version: PROTOCOL_VERSION,
                schema_version: CURRENT_SCHEMA_VERSION,
            };

            let _seq = client
                .push(&batch)
                .await
                .map_err(|e| AppError::InvalidOperation(e.to_string()))?;

            stats.rows_pushed += batch_len;
        }

        {
            let conn = db.conn();
            cursors::set_cursor(&conn, "mailbox", CursorDirection::Push, next_cursor)?;
        }
        push_db_version = next_cursor;

        if !has_more {
            break;
        }
    }
    stats.push_db_version = push_db_version;

    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::CrValue;

    #[tokio::test]
    async fn test_mailbox_live_roundtrip() {
        let secret = [88u8; 32];
        let keys = Arc::new(SyncKeys::derive_from_secret(&secret));
        let worker_url = "https://gamenote-mailbox.anchit-note.workers.dev".to_string();

        let client_a = MailboxClient::new(worker_url.clone(), "device_a_site_id".to_string(), keys.clone());
        let client_b = MailboxClient::new(worker_url, "device_b_site_id".to_string(), keys.clone());

        // 1. Health check
        let health = client_a.health().await.expect("health check must succeed");
        assert_eq!(health.status, "ok");

        // 2. Client A pushes changes
        let test_changes = vec![CrChange {
            table: "cards".to_string(),
            pk: b"card-cf-123".to_vec(),
            cid: "title".to_string(),
            val: CrValue::Text("Synced through Cloudflare Durable Object!".to_string()),
            col_version: 1,
            db_version: 1,
            site_id: vec![1u8; 16],
            cl: 1,
            seq: 0,
        }];

        let batch = ChangeBatch {
            changes: test_changes.clone(),
            sender_site_id: "device_a_site_id".to_string(),
            protocol_version: PROTOCOL_VERSION,
            schema_version: CURRENT_SCHEMA_VERSION,
        };

        let seq = client_a.push(&batch).await.expect("push must succeed");
        assert!(seq > 0);

        // 3. Client A pulls (should skip self-authored batch)
        let (changes_a, max_seq_a, _) = client_a.pull(seq - 1, 10).await.expect("pull must succeed");
        assert!(changes_a.is_empty(), "Client A must filter out its own batch");
        assert_eq!(max_seq_a, seq);

        // 4. Client B pulls (should receive and decrypt Client A's batch)
        let (changes_b, max_seq_b, _) = client_b.pull(seq - 1, 10).await.expect("pull must succeed");
        assert_eq!(changes_b.len(), 1, "Client B must receive the decrypted change");
        assert_eq!(changes_b[0].table, "cards");
        assert_eq!(changes_b[0].cid, "title");
        assert_eq!(changes_b[0].val, CrValue::Text("Synced through Cloudflare Durable Object!".to_string()));
        assert_eq!(max_seq_b, seq);

        // 5. Client B acks
        client_b.ack(seq).await.expect("ack must succeed");
    }
}
