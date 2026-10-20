pub mod config;
pub mod coordinator;
pub mod cursors;
pub mod engine;
pub mod protocol;

pub use config::{
    KeyStore, LimitSettings, MailboxSettings, ServerSettings, SyncConfig,
};
pub use coordinator::{
    EndpointConfig, PeerConfig, PeerSyncStatus, SyncCoordinator, SyncStatus,
};
pub use protocol::{
    compress_payload, decompress_payload, validate_wire_batch, ProtocolError, SyncEnvelope,
    WireChange, WireChangesetPayload, WireValue,
};

use rusqlite::{params, Connection, ToSql};
use serde::{Deserialize, Serialize};

use crate::error::Result;

pub const PROTOCOL_VERSION: u32 = 1;
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum CrValue {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

impl From<rusqlite::types::Value> for CrValue {
    fn from(v: rusqlite::types::Value) -> Self {
        match v {
            rusqlite::types::Value::Null => CrValue::Null,
            rusqlite::types::Value::Integer(i) => CrValue::Integer(i),
            rusqlite::types::Value::Real(r) => CrValue::Real(r),
            rusqlite::types::Value::Text(s) => CrValue::Text(s),
            rusqlite::types::Value::Blob(b) => CrValue::Blob(b),
        }
    }
}

impl From<CrValue> for rusqlite::types::Value {
    fn from(v: CrValue) -> Self {
        match v {
            CrValue::Null => rusqlite::types::Value::Null,
            CrValue::Integer(i) => rusqlite::types::Value::Integer(i),
            CrValue::Real(r) => rusqlite::types::Value::Real(r),
            CrValue::Text(s) => rusqlite::types::Value::Text(s),
            CrValue::Blob(b) => rusqlite::types::Value::Blob(b),
        }
    }
}

impl ToSql for CrValue {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        match self {
            CrValue::Null => Ok(rusqlite::types::ToSqlOutput::Owned(rusqlite::types::Value::Null)),
            CrValue::Integer(i) => Ok(rusqlite::types::ToSqlOutput::Owned(rusqlite::types::Value::Integer(*i))),
            CrValue::Real(r) => Ok(rusqlite::types::ToSqlOutput::Owned(rusqlite::types::Value::Real(*r))),
            CrValue::Text(s) => Ok(rusqlite::types::ToSqlOutput::Borrowed(rusqlite::types::ValueRef::Text(s.as_bytes()))),
            CrValue::Blob(b) => Ok(rusqlite::types::ToSqlOutput::Borrowed(rusqlite::types::ValueRef::Blob(b.as_slice()))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CrChange {
    pub table: String,
    pub pk: Vec<u8>,
    pub cid: String,
    pub val: CrValue,
    pub col_version: i64,
    pub db_version: i64,
    pub site_id: Vec<u8>,
    pub cl: i64,
    pub seq: i64,
}

/// Retrieves all changeset rows since `since_version` ordered chronologically.
pub fn get_changes_since(conn: &Connection, since_version: i64) -> Result<Vec<CrChange>> {
    let (changes, _, _) = get_paged_changes(conn, since_version, 100_000, None)?;
    Ok(changes)
}

/// Retrieves a page of changeset rows since `since_version`.
/// - Never splits a `db_version` across pages: if the last row in the batch has `db_version = V`,
///   all subsequent rows belonging to `V` are included to keep transactions atomic.
/// - If `exclude_site_id` is specified, changes authored by that site are omitted ("no echo").
/// Returns `(changes, next_cursor, has_more)`.
pub fn get_paged_changes(
    conn: &Connection,
    since_version: i64,
    limit: u32,
    exclude_site_id: Option<&[u8]>,
) -> Result<(Vec<CrChange>, i64, bool)> {
    let (sql, is_filtered) = match exclude_site_id {
        Some(_) => (
            "SELECT [table], pk, cid, val, col_version, db_version, site_id, cl, seq
             FROM crsql_changes
             WHERE db_version > ?1 AND (site_id IS NOT ?2 OR site_id IS NULL)
             ORDER BY db_version ASC, seq ASC
             LIMIT ?3",
            true,
        ),
        None => (
            "SELECT [table], pk, cid, val, col_version, db_version, site_id, cl, seq
             FROM crsql_changes
             WHERE db_version > ?1
             ORDER BY db_version ASC, seq ASC
             LIMIT ?2",
            false,
        ),
    };

    let mut stmt = conn.prepare(sql)?;
    let row_mapper = |row: &rusqlite::Row| -> rusqlite::Result<CrChange> {
        let val_rusqlite: rusqlite::types::Value = row.get(3)?;
        Ok(CrChange {
            table: row.get(0)?,
            pk: row.get(1)?,
            cid: row.get(2)?,
            val: CrValue::from(val_rusqlite),
            col_version: row.get(4)?,
            db_version: row.get(5)?,
            site_id: row.get(6)?,
            cl: row.get(7)?,
            seq: row.get(8)?,
        })
    };

    let mut changes: Vec<CrChange> = if is_filtered {
        let rows = stmt.query_map(params![since_version, exclude_site_id, limit], row_mapper)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()?
    } else {
        let rows = stmt.query_map(params![since_version, limit], row_mapper)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()?
    };

    if changes.is_empty() {
        return Ok((Vec::new(), since_version, false));
    }

    // Boundary rule: Never split a db_version across pages.
    // If the last row's db_version has remaining rows, fetch them.
    let last_db_version = changes.last().unwrap().db_version;
    let last_seq = changes.last().unwrap().seq;

    let remainder_sql = match exclude_site_id {
        Some(_) => {
            "SELECT [table], pk, cid, val, col_version, db_version, site_id, cl, seq
             FROM crsql_changes
             WHERE db_version = ?1 AND seq > ?2 AND (site_id IS NOT ?3 OR site_id IS NULL)
             ORDER BY seq ASC"
        }
        None => {
            "SELECT [table], pk, cid, val, col_version, db_version, site_id, cl, seq
             FROM crsql_changes
             WHERE db_version = ?1 AND seq > ?2
             ORDER BY seq ASC"
        }
    };

    let mut rem_stmt = conn.prepare(remainder_sql)?;
    let remainder_changes: Vec<CrChange> = if is_filtered {
        let rows = rem_stmt.query_map(params![last_db_version, last_seq, exclude_site_id], row_mapper)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()?
    } else {
        let rows = rem_stmt.query_map(params![last_db_version, last_seq], row_mapper)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()?
    };

    changes.extend(remainder_changes);

    // Check if there are any remaining changes with db_version > last_db_version
    let more_sql = match exclude_site_id {
        Some(_) => {
            "SELECT count(*) FROM crsql_changes
             WHERE db_version > ?1 AND (site_id IS NOT ?2 OR site_id IS NULL)
             LIMIT 1"
        }
        None => {
            "SELECT count(*) FROM crsql_changes
             WHERE db_version > ?1
             LIMIT 1"
        }
    };

    let count: i64 = if is_filtered {
        conn.query_row(more_sql, params![last_db_version, exclude_site_id], |r| r.get(0))?
    } else {
        conn.query_row(more_sql, params![last_db_version], |r| r.get(0))?
    };

    let has_more = count > 0;
    Ok((changes, last_db_version, has_more))
}

/// Applies a slice of changeset rows to the database inside a savepoint transaction.
pub fn apply_changes(conn: &Connection, changes: &[CrChange]) -> Result<()> {
    if changes.is_empty() {
        return Ok(());
    }

    conn.execute("SAVEPOINT sync_apply", [])?;

    let result = apply_changes_conn(conn, changes);

    match result {
        Ok(()) => {
            conn.execute("RELEASE sync_apply", [])?;
            Ok(())
        }
        Err(err) => {
            let _ = conn.execute("ROLLBACK TO sync_apply", []);
            let _ = conn.execute("RELEASE sync_apply", []);
            Err(err)
        }
    }
}

/// Applies changeset rows into an existing active transaction / connection without managing savepoints.
pub fn apply_changes_conn(conn: &Connection, changes: &[CrChange]) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO crsql_changes ([table], pk, cid, val, col_version, db_version, site_id, cl, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )?;

    for c in changes {
        stmt.execute(params![
            c.table,
            c.pk,
            c.cid,
            c.val,
            c.col_version,
            c.db_version,
            c.site_id,
            c.cl,
            c.seq,
        ])?;
    }
    Ok(())
}

/// Returns the current cr-sqlite db_version for this database instance.
pub fn get_db_version(conn: &Connection) -> Result<i64> {
    let version: i64 = conn.query_row("SELECT crsql_db_version()", [], |r| r.get(0))?;
    Ok(version)
}

/// Returns the 16-byte site_id unique to this database instance.
pub fn get_site_id(conn: &Connection) -> Result<Vec<u8>> {
    let site_id: Vec<u8> = conn.query_row("SELECT crsql_site_id()", [], |r| r.get(0))?;
    Ok(site_id)
}
