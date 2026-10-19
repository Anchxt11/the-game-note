pub mod client;
pub mod discovery;
pub mod local;
pub mod mailbox;
pub mod server;

use std::ops::Range;
use std::pin::Pin;
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::sync::CrChange;

pub use client::HttpClient;
pub use discovery::{start_lan_discovery, DiscoveredPeer, LanDiscoveryHandle, LAN_DISCOVERY_PORT};
pub use local::LocalTransport;
pub use mailbox::{sync_with_mailbox, MailboxBatchItem, MailboxClient, MailboxHealth, MailboxSyncStats};
pub use server::{
    is_allowed_source_ip, is_valid_file_id, start_sync_server, ServerConfig, ServerHandle,
    DEFAULT_SERVER_PORT,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransportKind {
    Lan,
    Tailscale,
    Mailbox,
    Local,
}

#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransportError {
    #[error("Peer unreachable: {0}")]
    Unreachable(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Protocol version mismatch: {0}")]
    ProtocolMismatch(String),
    #[error("Schema version mismatch: {0}")]
    SchemaMismatch(String),
    #[error("Rate limited, retry after {retry_after_secs}s")]
    RateLimited { retry_after_secs: u64 },
    #[error("Payload too large: {0}")]
    PayloadTooLarge(String),
    #[error("Corrupt payload: {0}")]
    Corrupt(String),
    #[error("Transport error: {0}")]
    Other(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PeerHealth {
    pub status: String,
    pub site_id: String, // hex string
    pub device_name: Option<String>,
    pub protocol_version: u32,
    pub schema_version: u32,
    pub db_version: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChangePage {
    pub changes: Vec<CrChange>,
    pub next_cursor: i64,
    pub has_more: bool,
    pub server_db_version: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChangeBatch {
    pub changes: Vec<CrChange>,
    pub sender_site_id: String, // hex string
    pub protocol_version: u32,
    pub schema_version: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PushAck {
    pub applied_through: i64,
    pub db_version: i64,
}

pub type FileId = String;
pub type ByteRange = Range<u64>;
pub type FileStream = Pin<Box<dyn Stream<Item = std::result::Result<Bytes, TransportError>> + Send>>;
pub type BoxStream<'a, T> = Pin<Box<dyn Stream<Item = T> + Send + 'a>>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SyncEvent {
    ChangesAvailable { db_version: i64 },
}

#[async_trait]
pub trait Transport: Send + Sync {
    fn kind(&self) -> TransportKind;
    async fn health(&self) -> std::result::Result<PeerHealth, TransportError>;
    async fn pull(&self, since: i64, limit: u32) -> std::result::Result<ChangePage, TransportError>;
    async fn push(&self, batch: ChangeBatch) -> std::result::Result<PushAck, TransportError>;
    async fn missing_files(&self, ids: &[FileId]) -> std::result::Result<Vec<FileId>, TransportError>;
    async fn get_file(&self, id: &FileId, range: Option<ByteRange>) -> std::result::Result<FileStream, TransportError>;
    async fn put_file(&self, id: &FileId, offset: u64, bytes: Bytes) -> std::result::Result<(), TransportError>;
    fn subscribe(&self) -> Option<BoxStream<'static, SyncEvent>>;
}
