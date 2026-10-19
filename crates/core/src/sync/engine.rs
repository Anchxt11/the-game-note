use serde::{Deserialize, Serialize};

use crate::db::Database;
use crate::error::{AppError, Result};
use crate::sync::cursors::{self, CursorDirection};
use crate::sync::{apply_changes_conn, get_paged_changes, CURRENT_SCHEMA_VERSION, PROTOCOL_VERSION};
use crate::transport::{ChangeBatch, Transport};

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct SyncStats {
    pub rows_pulled: usize,
    pub rows_pushed: usize,
    pub pull_cursor: i64,
    pub push_cursor: i64,
}

/// Executes a complete, bidirectional sync cycle with a remote peer via the given transport.
///
/// 1. Verifies health and protocol/schema compatibility.
/// 2. Pulls all pending changes since local `pull` cursor and atomically commits them alongside cursor update.
/// 3. Pushes all pending local changes since local `push` cursor (excluding changes authored by peer)
///    in page chunks bounded by `db_version`.
pub async fn sync_with_peer(
    db: &Database,
    transport: &dyn Transport,
    peer_id: &str,
    batch_limit: u32,
) -> Result<SyncStats> {
    let limit = if batch_limit == 0 { 1000 } else { batch_limit };

    // 1. Health check & version compatibility
    let health = transport.health().await.map_err(|e| AppError::InvalidOperation(e.to_string()))?;
    if health.protocol_version != PROTOCOL_VERSION {
        return Err(AppError::InvalidOperation(format!(
            "Protocol mismatch: local v{} vs peer v{}",
            PROTOCOL_VERSION, health.protocol_version
        )));
    }
    if health.schema_version != CURRENT_SCHEMA_VERSION {
        return Err(AppError::InvalidOperation(format!(
            "Schema mismatch: local v{} vs peer v{}",
            CURRENT_SCHEMA_VERSION, health.schema_version
        )));
    }

    // Register or update peer info
    {
        let conn = db.conn();
        cursors::upsert_peer(&conn, peer_id, health.device_name.as_deref())?;
    }

    let mut stats = SyncStats::default();

    // 2. PULL Phase: Fetch from remote and apply locally
    let mut pull_cursor = {
        let conn = db.conn();
        cursors::get_cursor(&conn, peer_id, CursorDirection::Pull)?
    };

    loop {
        let page = transport
            .pull(pull_cursor, limit)
            .await
            .map_err(|e| AppError::InvalidOperation(e.to_string()))?;

        if !page.changes.is_empty() {
            let mut conn = db.conn();
            // Transactional guarantee: apply changes AND advance cursor atomically
            let tx = conn.transaction()?;
            apply_changes_conn(&tx, &page.changes)?;
            cursors::set_cursor(&tx, peer_id, CursorDirection::Pull, page.next_cursor)?;
            tx.commit()?;

            stats.rows_pulled += page.changes.len();
            pull_cursor = page.next_cursor;
        } else {
            // Even if page is empty, if next_cursor advanced (e.g. server had filtered changes)
            if page.next_cursor > pull_cursor {
                let conn = db.conn();
                cursors::set_cursor(&conn, peer_id, CursorDirection::Pull, page.next_cursor)?;
                pull_cursor = page.next_cursor;
            }
        }

        if !page.has_more {
            break;
        }
    }
    stats.pull_cursor = pull_cursor;

    // 3. PUSH Phase: Query local changes and push to peer
    let mut push_cursor = {
        let conn = db.conn();
        cursors::get_cursor(&conn, peer_id, CursorDirection::Push)?
    };

    let local_site_id = db.get_site_id()?;
    let local_site_id_hex = hex::encode(&local_site_id);
    let peer_site_id_bytes = hex::decode(peer_id).unwrap_or_default();

    loop {
        let (changes, next_cursor, has_more) = {
            let conn = db.conn();
            get_paged_changes(
                &conn,
                push_cursor,
                limit,
                if peer_site_id_bytes.is_empty() { None } else { Some(&peer_site_id_bytes) },
            )?
        };

        if changes.is_empty() {
            let current_db_version = db.get_db_version()?;
            if push_cursor < current_db_version {
                let conn = db.conn();
                cursors::set_cursor(&conn, peer_id, CursorDirection::Push, current_db_version)?;
                push_cursor = current_db_version;
            }
            break;
        }

        let batch = ChangeBatch {
            changes: changes.clone(),
            sender_site_id: local_site_id_hex.clone(),
            protocol_version: PROTOCOL_VERSION,
            schema_version: CURRENT_SCHEMA_VERSION,
        };

        let _ack = transport
            .push(batch)
            .await
            .map_err(|e| AppError::InvalidOperation(e.to_string()))?;

        {
            let conn = db.conn();
            cursors::set_cursor(&conn, peer_id, CursorDirection::Push, next_cursor)?;
        }

        stats.rows_pushed += changes.len();
        push_cursor = next_cursor;

        if !has_more {
            let current_db_version = db.get_db_version()?;
            if push_cursor < current_db_version {
                let conn = db.conn();
                cursors::set_cursor(&conn, peer_id, CursorDirection::Push, current_db_version)?;
                push_cursor = current_db_version;
            }
            break;
        }
    }
    stats.push_cursor = push_cursor;

    Ok(stats)
}
