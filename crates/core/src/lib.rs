pub mod error;
pub mod models;
pub mod db;
pub mod storage;
pub mod opengraph;
pub mod seed;
pub mod fractional_index;
pub mod sync;
pub mod transport;
pub mod crypto;
pub mod pairing;
pub mod backup;

pub use backup::{BackupInfo, BackupManager};
pub use error::{AppError, Result};
pub use models::*;
pub use db::Database;
pub use storage::{is_valid_file_id, migrate_embedded_images, FileStorage};
pub use crypto::{
    compute_aad, compute_file_id, decrypt_payload, encrypt_payload, verify_file_id,
    verify_token_constant_time, SyncKeys,
};
pub use pairing::{
    decode_pairing_code, encode_pairing_code, export_recovery_code, generate_pairing_qr_svg,
    generate_sync_secret, import_recovery_code, PairingPayload,
};
pub use sync::{
    apply_changes, compress_payload, decompress_payload, get_changes_since, get_db_version,
    get_paged_changes, get_site_id, validate_wire_batch, CrChange, CrValue, EndpointConfig,
    KeyStore, LimitSettings, MailboxSettings, PeerConfig, PeerSyncStatus, ProtocolError,
    ServerSettings, SyncConfig, SyncCoordinator, SyncEnvelope, SyncStatus, WireChange,
    WireChangesetPayload, WireValue, CURRENT_SCHEMA_VERSION, PROTOCOL_VERSION,
};
pub use transport::{
    start_lan_discovery, sync_with_mailbox, ChangeBatch, ChangePage, DiscoveredPeer, HttpClient,
    LanDiscoveryHandle, LocalTransport, MailboxBatchItem, MailboxClient, MailboxHealth,
    MailboxSyncStats, PeerHealth, PushAck, Transport, TransportError, TransportKind,
};
pub use futures_util::StreamExt;


