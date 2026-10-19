use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

use milanote_core::crypto::SyncKeys;
use milanote_core::db::Database;
use milanote_core::storage::FileStorage;
use milanote_core::sync::coordinator::SyncCoordinator;
use milanote_core::transport::discovery::LanDiscoveryHandle;
use milanote_core::transport::server::ServerHandle;

pub struct AppSyncState {
    pub db: Arc<Database>,
    #[allow(dead_code)]
    pub storage: Arc<FileStorage>,
    pub coordinator: Arc<SyncCoordinator>,
    pub server_handle: Mutex<Option<ServerHandle>>,
    #[allow(dead_code)]
    pub discovery_handle: Mutex<Option<LanDiscoveryHandle>>,
    pub app_data_dir: PathBuf,
    pub sync_keys: Arc<RwLock<Option<Arc<SyncKeys>>>>,
}

impl AppSyncState {
    pub async fn set_keys(&self, keys: Arc<SyncKeys>) {
        let auth_token = keys.auth_token_hex();
        {
            let mut k = self.sync_keys.write().await;
            *k = Some(keys.clone());
        }
        self.coordinator.set_sync_keys(Some(keys)).await;
        self.coordinator.set_auth_token(Some(auth_token)).await;
    }

    pub fn notify_db_changed(&self) {
        if let Ok(guard) = self.server_handle.try_lock() {
            if let Some(ref handle) = *guard {
                if let Ok(ver) = self.db.get_db_version() {
                    let _ = handle.event_sender().send(ver);
                }
            }
        }
        let coord = self.coordinator.clone();
        tauri::async_runtime::spawn(async move {
            coord.fast_push_pending_changes().await;
        });
    }
}
