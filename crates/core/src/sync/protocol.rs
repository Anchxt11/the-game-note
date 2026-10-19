use std::io::{Read, Write};
use base64::prelude::*;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::sync::{CrChange, CrValue, CURRENT_SCHEMA_VERSION, PROTOCOL_VERSION};

pub const MAX_COMPRESSED_PAYLOAD_BYTES: usize = 4 * 1024 * 1024;    // 4 MiB
pub const MAX_DECOMPRESSED_PAYLOAD_BYTES: usize = 16 * 1024 * 1024; // 16 MiB
pub const MAX_BATCH_ROWS: usize = 5000;

#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProtocolError {
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Schema version mismatch: local v{local} vs peer v{peer}")]
    SchemaMismatch { local: u32, peer: u32 },
    #[error("Protocol version mismatch: local v{local} vs peer v{peer}")]
    ProtocolMismatch { local: u32, peer: u32 },
    #[error("Payload too large: {0}")]
    PayloadTooLarge(String),
    #[error("Invalid payload: {0}")]
    InvalidPayload(String),
    #[error("Rate limited, retry after {retry_after_secs}s")]
    RateLimited { retry_after_secs: u64 },
    #[error("Decompression failed: {0}")]
    DecompressionError(String),
}

impl ProtocolError {
    pub fn http_status(&self) -> u16 {
        match self {
            Self::Unauthorized(_) => 401,
            Self::SchemaMismatch { .. } => 409,
            Self::ProtocolMismatch { .. } => 426,
            Self::PayloadTooLarge(_) => 413,
            Self::InvalidPayload(_) => 422,
            Self::RateLimited { .. } => 429,
            Self::DecompressionError(_) => 422,
        }
    }
}

/// Plaintext envelope carrying encrypted payloads across transports and cloud mailboxes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SyncEnvelope {
    pub protocol_version: u32,
    pub schema_version: u32,
    pub sender_site_id: String, // hex 16 bytes (32 chars)
    pub kind: String,           // "changes", "ack", etc.
    pub key_id: u32,
    pub nonce: String,          // base64 24 bytes
    pub payload: String,        // base64 ciphertext
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", content = "v")]
pub enum WireValue {
    #[serde(rename = "null")]
    Null,
    #[serde(rename = "int")]
    Integer(i64),
    #[serde(rename = "real")]
    Real(f64),
    #[serde(rename = "text")]
    Text(String),
    #[serde(rename = "blob")]
    Blob(String), // base64
}

impl From<CrValue> for WireValue {
    fn from(v: CrValue) -> Self {
        match v {
            CrValue::Null => WireValue::Null,
            CrValue::Integer(i) => WireValue::Integer(i),
            CrValue::Real(r) => WireValue::Real(r),
            CrValue::Text(s) => WireValue::Text(s),
            CrValue::Blob(b) => WireValue::Blob(BASE64_STANDARD.encode(b)),
        }
    }
}

impl TryFrom<WireValue> for CrValue {
    type Error = ProtocolError;

    fn try_from(wv: WireValue) -> Result<Self, Self::Error> {
        match wv {
            WireValue::Null => Ok(CrValue::Null),
            WireValue::Integer(i) => Ok(CrValue::Integer(i)),
            WireValue::Real(r) => Ok(CrValue::Real(r)),
            WireValue::Text(s) => Ok(CrValue::Text(s)),
            WireValue::Blob(b64) => {
                let bytes = BASE64_STANDARD
                    .decode(&b64)
                    .map_err(|e| ProtocolError::InvalidPayload(format!("Invalid base64 in blob: {}", e)))?;
                Ok(CrValue::Blob(bytes))
            }
        }
    }
}

/// Change row wire format. Values are strictly type-tagged to preserve SQLite types across transports.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireChange {
    pub table: String,
    pub pk: String,          // base64 packed primary key
    pub cid: String,
    pub val: WireValue,
    pub col_version: i64,
    pub db_version: i64,
    pub site_id: String,     // hex 16 bytes
    pub cl: i64,
    pub seq: i64,
}

impl From<CrChange> for WireChange {
    fn from(c: CrChange) -> Self {
        WireChange {
            table: c.table,
            pk: BASE64_STANDARD.encode(c.pk),
            cid: c.cid,
            val: WireValue::from(c.val),
            col_version: c.col_version,
            db_version: c.db_version,
            site_id: hex::encode(c.site_id),
            cl: c.cl,
            seq: c.seq,
        }
    }
}

impl TryFrom<WireChange> for CrChange {
    type Error = ProtocolError;

    fn try_from(wc: WireChange) -> Result<Self, Self::Error> {
        let pk = BASE64_STANDARD
            .decode(&wc.pk)
            .map_err(|e| ProtocolError::InvalidPayload(format!("Invalid base64 in pk: {}", e)))?;
        let site_id = hex::decode(&wc.site_id)
            .map_err(|e| ProtocolError::InvalidPayload(format!("Invalid hex in site_id: {}", e)))?;

        if site_id.len() != 16 {
            return Err(ProtocolError::InvalidPayload(format!(
                "site_id must be exactly 16 bytes, found {}",
                site_id.len()
            )));
        }

        let val = CrValue::try_from(wc.val)?;

        Ok(CrChange {
            table: wc.table,
            pk,
            cid: wc.cid,
            val,
            col_version: wc.col_version,
            db_version: wc.db_version,
            site_id,
            cl: wc.cl,
            seq: wc.seq,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireChangesetPayload {
    pub changes: Vec<WireChange>,
    pub next_cursor: i64,
    pub has_more: bool,
    pub server_db_version: i64,
}

/// Allow-listed table validation rules
pub fn validate_crr_table_and_column(table: &str, cid: &str) -> Result<(), ProtocolError> {
    // In cr-sqlite, cid "-1" represents a row-level delete tombstone metadata entry.
    if cid == "-1" {
        match table {
            "boards" | "elements" | "task_list_items" | "connectors" => return Ok(()),
            _ => return Err(ProtocolError::InvalidPayload(format!("Unknown CRR table: {}", table))),
        }
    }

    match table {
        "boards" => match cid {
            "id" | "parent_board_id" | "title" | "color_theme" | "created_at" | "updated_at" => Ok(()),
            _ => Err(ProtocolError::InvalidPayload(format!("Unknown column '{}' for table 'boards'", cid))),
        },
        "elements" => match cid {
            "id" | "board_id" | "element_type" | "x" | "y" | "width" | "height" | "z_index"
            | "content" | "style" | "created_at" | "updated_at" => Ok(()),
            _ => Err(ProtocolError::InvalidPayload(format!("Unknown column '{}' for table 'elements'", cid))),
        },
        "task_list_items" => match cid {
            "id" | "element_id" | "text" | "is_checked" | "order_index" => Ok(()),
            _ => Err(ProtocolError::InvalidPayload(format!("Unknown column '{}' for table 'task_list_items'", cid))),
        },
        "connectors" => match cid {
            "id" | "board_id" | "from_element_id" | "to_element_id" | "style" => Ok(()),
            _ => Err(ProtocolError::InvalidPayload(format!("Unknown column '{}' for table 'connectors'", cid))),
        },
        _ => Err(ProtocolError::InvalidPayload(format!("Forbidden or non-CRR table: {}", table))),
    }
}

/// Validates an incoming wire batch before it touches the database.
pub fn validate_wire_batch(
    protocol_version: u32,
    schema_version: u32,
    changes: &[WireChange],
) -> Result<(), ProtocolError> {
    if protocol_version != PROTOCOL_VERSION {
        return Err(ProtocolError::ProtocolMismatch {
            local: PROTOCOL_VERSION,
            peer: protocol_version,
        });
    }
    if schema_version != CURRENT_SCHEMA_VERSION {
        return Err(ProtocolError::SchemaMismatch {
            local: CURRENT_SCHEMA_VERSION,
            peer: schema_version,
        });
    }

    if changes.len() > MAX_BATCH_ROWS {
        return Err(ProtocolError::PayloadTooLarge(format!(
            "Batch row count {} exceeds maximum {}",
            changes.len(),
            MAX_BATCH_ROWS
        )));
    }

    for (idx, c) in changes.iter().enumerate() {
        validate_crr_table_and_column(&c.table, &c.cid)?;
        if c.col_version < 0 || c.db_version < 0 || c.cl < 0 || c.seq < 0 {
            return Err(ProtocolError::InvalidPayload(format!(
                "Negative metadata counters at row index {}",
                idx
            )));
        }
    }

    Ok(())
}

/// Gzip compression for wire payloads (compress-then-encrypt).
pub fn compress_payload(data: &[u8]) -> Result<Vec<u8>, ProtocolError> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|e| ProtocolError::InvalidPayload(format!("Gzip compression error: {}", e)))?;
    encoder
        .finish()
        .map_err(|e| ProtocolError::InvalidPayload(format!("Gzip compression finish error: {}", e)))
}

/// Gzip decompression with zip-bomb protection (hard limit on decompressed bytes).
pub fn decompress_payload(compressed: &[u8], max_bytes: usize) -> Result<Vec<u8>, ProtocolError> {
    if compressed.len() > MAX_COMPRESSED_PAYLOAD_BYTES {
        return Err(ProtocolError::PayloadTooLarge(format!(
            "Compressed size {} exceeds maximum {}",
            compressed.len(),
            MAX_COMPRESSED_PAYLOAD_BYTES
        )));
    }

    let mut decoder = GzDecoder::new(compressed);
    let mut decompressed = Vec::new();
    let mut take = decoder.by_ref().take((max_bytes + 1) as u64);

    take.read_to_end(&mut decompressed)
        .map_err(|e| ProtocolError::DecompressionError(format!("Gzip decompression failed: {}", e)))?;

    if decompressed.len() > max_bytes {
        return Err(ProtocolError::PayloadTooLarge(format!(
            "Decompressed size exceeds safety ceiling of {} bytes",
            max_bytes
        )));
    }

    Ok(decompressed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wire_value_tagged_format() {
        let text_val = WireValue::Text("hello".to_string());
        let json_text = serde_json::to_string(&text_val).unwrap();
        assert_eq!(json_text, r#"{"t":"text","v":"hello"}"#);

        let int_val = WireValue::Integer(42);
        let json_int = serde_json::to_string(&int_val).unwrap();
        assert_eq!(json_int, r#"{"t":"int","v":42}"#);

        let null_val = WireValue::Null;
        let json_null = serde_json::to_string(&null_val).unwrap();
        assert_eq!(json_null, r#"{"t":"null"}"#);

        let blob_bytes = vec![1, 2, 3, 4, 5];
        let wire_blob = WireValue::from(CrValue::Blob(blob_bytes.clone()));
        let cr_blob = CrValue::try_from(wire_blob).unwrap();
        assert_eq!(cr_blob, CrValue::Blob(blob_bytes));
    }

    #[test]
    fn test_cr_change_to_wire_change_roundtrip() {
        let original = CrChange {
            table: "elements".to_string(),
            pk: vec![10, 20, 30],
            cid: "content".to_string(),
            val: CrValue::Text("test content".to_string()),
            col_version: 1,
            db_version: 100,
            site_id: vec![7; 16],
            cl: 1,
            seq: 0,
        };

        let wire = WireChange::from(original.clone());
        assert_eq!(wire.table, "elements");
        assert_eq!(wire.site_id, hex::encode(&vec![7; 16]));

        let restored = CrChange::try_from(wire).unwrap();
        assert_eq!(original, restored);
    }

    #[test]
    fn test_validation_accepts_valid_tables_and_columns() {
        let valid_change = WireChange {
            table: "boards".to_string(),
            pk: BASE64_STANDARD.encode([1, 2, 3]),
            cid: "title".to_string(),
            val: WireValue::Text("New Board".to_string()),
            col_version: 1,
            db_version: 10,
            site_id: hex::encode([0u8; 16]),
            cl: 1,
            seq: 0,
        };

        assert!(validate_wire_batch(PROTOCOL_VERSION, CURRENT_SCHEMA_VERSION, &[valid_change]).is_ok());

        // Delete tombstone (-1) is also accepted on all CRRs
        let tombstone = WireChange {
            table: "elements".to_string(),
            pk: BASE64_STANDARD.encode([4, 5, 6]),
            cid: "-1".to_string(),
            val: WireValue::Null,
            col_version: 2,
            db_version: 11,
            site_id: hex::encode([0u8; 16]),
            cl: 2,
            seq: 0,
        };
        assert!(validate_wire_batch(PROTOCOL_VERSION, CURRENT_SCHEMA_VERSION, &[tombstone]).is_ok());
    }

    #[test]
    fn test_validation_rejects_forbidden_tables() {
        let bad_table = WireChange {
            table: "sqlite_master".to_string(),
            pk: BASE64_STANDARD.encode([1]),
            cid: "sql".to_string(),
            val: WireValue::Text("SELECT 1".to_string()),
            col_version: 1,
            db_version: 1,
            site_id: hex::encode([0u8; 16]),
            cl: 1,
            seq: 0,
        };

        let err = validate_wire_batch(PROTOCOL_VERSION, CURRENT_SCHEMA_VERSION, &[bad_table]).unwrap_err();
        assert!(matches!(err, ProtocolError::InvalidPayload(_)));
    }

    #[test]
    fn test_validation_rejects_unknown_columns() {
        let bad_column = WireChange {
            table: "boards".to_string(),
            pk: BASE64_STANDARD.encode([1]),
            cid: "malicious_col".to_string(),
            val: WireValue::Text("payload".to_string()),
            col_version: 1,
            db_version: 1,
            site_id: hex::encode([0u8; 16]),
            cl: 1,
            seq: 0,
        };

        let err = validate_wire_batch(PROTOCOL_VERSION, CURRENT_SCHEMA_VERSION, &[bad_column]).unwrap_err();
        assert!(matches!(err, ProtocolError::InvalidPayload(_)));
    }

    #[test]
    fn test_validation_rejects_version_mismatches() {
        let valid_change = WireChange {
            table: "boards".to_string(),
            pk: BASE64_STANDARD.encode([1]),
            cid: "title".to_string(),
            val: WireValue::Text("Title".to_string()),
            col_version: 1,
            db_version: 1,
            site_id: hex::encode([0u8; 16]),
            cl: 1,
            seq: 0,
        };

        // Protocol mismatch
        let err_proto = validate_wire_batch(999, CURRENT_SCHEMA_VERSION, &[valid_change.clone()]).unwrap_err();
        assert_eq!(err_proto.http_status(), 426);

        // Schema mismatch
        let err_schema = validate_wire_batch(PROTOCOL_VERSION, 999, &[valid_change]).unwrap_err();
        assert_eq!(err_schema.http_status(), 409);
    }

    #[test]
    fn test_compression_decompression_roundtrip() {
        let data = b"The quick brown fox jumps over the lazy dog repeated many times. ".repeat(100);
        let compressed = compress_payload(&data).unwrap();
        assert!(compressed.len() < data.len());

        let decompressed = decompress_payload(&compressed, MAX_DECOMPRESSED_PAYLOAD_BYTES).unwrap();
        assert_eq!(data, decompressed.as_slice());
    }

    #[test]
    fn test_decompression_zip_bomb_safety_ceiling() {
        let large_data = vec![0u8; 2048];
        let compressed = compress_payload(&large_data).unwrap();

        // Safety limit of only 500 bytes
        let err = decompress_payload(&compressed, 500).unwrap_err();
        assert!(matches!(err, ProtocolError::PayloadTooLarge(_)));
    }

    #[test]
    fn test_error_http_status_mapping() {
        assert_eq!(ProtocolError::Unauthorized("bad token".into()).http_status(), 401);
        assert_eq!(ProtocolError::SchemaMismatch { local: 1, peer: 2 }.http_status(), 409);
        assert_eq!(ProtocolError::ProtocolMismatch { local: 1, peer: 2 }.http_status(), 426);
        assert_eq!(ProtocolError::PayloadTooLarge("too big".into()).http_status(), 413);
        assert_eq!(ProtocolError::InvalidPayload("bad format".into()).http_status(), 422);
        assert_eq!(ProtocolError::RateLimited { retry_after_secs: 30 }.http_status(), 429);
    }
}
