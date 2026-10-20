use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CursorDirection {
    Pull,
    Push,
}

impl CursorDirection {
    pub fn as_str(&self) -> &'static str {
        match self {
            CursorDirection::Pull => "pull",
            CursorDirection::Push => "push",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PeerInfo {
    pub peer_id: String,
    pub display_name: Option<String>,
    pub first_seen_at: i64,
    pub last_seen_at: Option<i64>,
    pub pull_version: i64,
    pub push_version: i64,
}

/// Initialize the device-local `sync_peers` and `sync_cursors` tables.
/// These are regular non-CRR SQLite tables that never sync across devices.
pub fn init_cursor_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS sync_peers (
            peer_id        TEXT PRIMARY KEY,
            display_name   TEXT,
            first_seen_at  INTEGER NOT NULL,
            last_seen_at   INTEGER
        );

        CREATE TABLE IF NOT EXISTS sync_cursors (
            peer_id        TEXT NOT NULL REFERENCES sync_peers(peer_id) ON DELETE CASCADE,
            direction      TEXT NOT NULL CHECK (direction IN ('pull','push')),
            version        INTEGER NOT NULL DEFAULT 0,
            updated_at     INTEGER NOT NULL,
            PRIMARY KEY (peer_id, direction)
        );
        "#,
    )?;
    Ok(())
}

/// Registers or updates a peer in the `sync_peers` table.
pub fn upsert_peer(conn: &Connection, peer_id: &str, display_name: Option<&str>) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        r#"
        INSERT INTO sync_peers (peer_id, display_name, first_seen_at, last_seen_at)
        VALUES (?1, ?2, ?3, ?3)
        ON CONFLICT(peer_id) DO UPDATE SET
            display_name = coalesce(?2, sync_peers.display_name),
            last_seen_at = ?3
        "#,
        params![peer_id, display_name, now],
    )?;
    Ok(())
}

/// Gets the current cursor version for a peer and direction. Defaults to 0 if not set.
pub fn get_cursor(conn: &Connection, peer_id: &str, direction: CursorDirection) -> Result<i64> {
    let mut stmt = conn.prepare(
        "SELECT version FROM sync_cursors WHERE peer_id = ?1 AND direction = ?2",
    )?;
    let mut rows = stmt.query(params![peer_id, direction.as_str()])?;
    if let Some(row) = rows.next()? {
        Ok(row.get(0)?)
    } else {
        Ok(0)
    }
}

/// Sets the cursor version for a peer and direction.
pub fn set_cursor(conn: &Connection, peer_id: &str, direction: CursorDirection, version: i64) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    // Ensure peer exists
    upsert_peer(conn, peer_id, None)?;
    conn.execute(
        r#"
        INSERT INTO sync_cursors (peer_id, direction, version, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(peer_id, direction) DO UPDATE SET
            version = ?3,
            updated_at = ?4
        "#,
        params![peer_id, direction.as_str(), version, now],
    )?;
    Ok(())
}

/// Resets (clears) cursors for a given peer (safe for re-pulling all data).
pub fn reset_cursor(conn: &Connection, peer_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM sync_cursors WHERE peer_id = ?1",
        params![peer_id],
    )?;
    Ok(())
}

/// Lists all known peers with their respective cursors.
pub fn list_peers(conn: &Connection) -> Result<Vec<PeerInfo>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            p.peer_id,
            p.display_name,
            p.first_seen_at,
            p.last_seen_at,
            coalesce(cpull.version, 0) as pull_version,
            coalesce(cpush.version, 0) as push_version
        FROM sync_peers p
        LEFT JOIN sync_cursors cpull ON p.peer_id = cpull.peer_id AND cpull.direction = 'pull'
        LEFT JOIN sync_cursors cpush ON p.peer_id = cpush.peer_id AND cpush.direction = 'push'
        ORDER BY p.last_seen_at DESC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(PeerInfo {
            peer_id: row.get(0)?,
            display_name: row.get(1)?,
            first_seen_at: row.get(2)?,
            last_seen_at: row.get(3)?,
            pull_version: row.get(4)?,
            push_version: row.get(5)?,
        })
    })?;

    let mut peers = Vec::new();
    for row in rows {
        peers.push(row?);
    }
    Ok(peers)
}

/// Deletes a peer and its cursors.
pub fn delete_peer(conn: &Connection, peer_id: &str) -> Result<()> {
    conn.execute("DELETE FROM sync_cursors WHERE peer_id = ?1", params![peer_id])?;
    conn.execute("DELETE FROM sync_peers WHERE peer_id = ?1", params![peer_id])?;
    Ok(())
}

/// Clears all peers and cursors.
pub fn clear_all_peers(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM sync_cursors", [])?;
    conn.execute("DELETE FROM sync_peers", [])?;
    Ok(())
}
