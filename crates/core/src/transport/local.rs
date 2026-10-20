use std::sync::Arc;
use async_trait::async_trait;
use bytes::Bytes;

use crate::db::Database;
use crate::sync::{get_db_version, get_paged_changes, get_site_id, CURRENT_SCHEMA_VERSION, PROTOCOL_VERSION};
use super::{
    BoxStream, ByteRange, ChangeBatch, ChangePage, FileId, FileStream, PeerHealth, PushAck,
    SyncEvent, Transport, TransportError, TransportKind,
};

/// An in-process transport connecting two `Database` instances directly.
/// Used for deterministic unit testing of synchronization algorithms and multi-instance convergence.
pub struct LocalTransport {
    target_db: Arc<Database>,
    device_name: Option<String>,
    requester_site_id: Option<Vec<u8>>,
    protocol_version: u32,
    schema_version: u32,
}

impl LocalTransport {
    pub fn new(target_db: Arc<Database>, requester_site_id: Option<Vec<u8>>) -> Self {
        Self {
            target_db,
            device_name: None,
            requester_site_id,
            protocol_version: PROTOCOL_VERSION,
            schema_version: CURRENT_SCHEMA_VERSION,
        }
    }

    pub fn with_device_name(mut self, name: impl Into<String>) -> Self {
        self.device_name = Some(name.into());
        self
    }

    pub fn with_protocol_version(mut self, version: u32) -> Self {
        self.protocol_version = version;
        self
    }

    pub fn with_schema_version(mut self, version: u32) -> Self {
        self.schema_version = version;
        self
    }
}

#[async_trait]
impl Transport for LocalTransport {
    fn kind(&self) -> TransportKind {
        TransportKind::Local
    }

    async fn health(&self) -> Result<PeerHealth, TransportError> {
        let conn = self.target_db.conn();
        let db_version = get_db_version(&conn).map_err(|e| TransportError::Other(e.to_string()))?;
        let site_id = get_site_id(&conn).map_err(|e| TransportError::Other(e.to_string()))?;

        Ok(PeerHealth {
            status: "ok".to_string(),
            site_id: hex::encode(&site_id),
            device_name: self.device_name.clone(),
            protocol_version: self.protocol_version,
            schema_version: self.schema_version,
            db_version,
        })
    }

    async fn pull(&self, since: i64, limit: u32) -> Result<ChangePage, TransportError> {
        let conn = self.target_db.conn();
        let (changes, next_cursor, has_more) = get_paged_changes(
            &conn,
            since,
            limit,
            self.requester_site_id.as_deref(),
        )
        .map_err(|e| TransportError::Other(e.to_string()))?;

        let server_db_version = get_db_version(&conn).map_err(|e| TransportError::Other(e.to_string()))?;

        Ok(ChangePage {
            changes,
            next_cursor,
            has_more,
            server_db_version,
        })
    }

    async fn push(&self, batch: ChangeBatch) -> Result<PushAck, TransportError> {
        if batch.protocol_version != self.protocol_version {
            return Err(TransportError::ProtocolMismatch(format!(
                "Sender protocol version {} != target {}",
                batch.protocol_version, self.protocol_version
            )));
        }
        if batch.schema_version != self.schema_version {
            return Err(TransportError::SchemaMismatch(format!(
                "Sender schema version {} != target {}",
                batch.schema_version, self.schema_version
            )));
        }

        self.target_db
            .apply_changes(&batch.changes)
            .map_err(|e| TransportError::Corrupt(e.to_string()))?;

        let new_db_version = self
            .target_db
            .get_db_version()
            .map_err(|e| TransportError::Other(e.to_string()))?;

        let applied_through = batch
            .changes
            .iter()
            .map(|c| c.db_version)
            .max()
            .unwrap_or(0);

        Ok(PushAck {
            applied_through,
            db_version: new_db_version,
        })
    }

    async fn missing_files(&self, _ids: &[FileId]) -> Result<Vec<FileId>, TransportError> {
        Ok(Vec::new())
    }

    async fn get_file(&self, _id: &FileId, _range: Option<ByteRange>) -> Result<FileStream, TransportError> {
        Err(TransportError::Other("File transfer not configured in local transport".to_string()))
    }

    async fn put_file(&self, _id: &FileId, _offset: u64, _bytes: Bytes) -> Result<(), TransportError> {
        Err(TransportError::Other("File transfer not configured in local transport".to_string()))
    }

    fn subscribe(&self) -> Option<BoxStream<'static, SyncEvent>> {
        None
    }
}
