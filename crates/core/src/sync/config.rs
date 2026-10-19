use std::path::Path;
use serde::{Deserialize, Serialize};

use crate::crypto::KEY_SIZE;
use crate::error::{AppError, Result};
use crate::sync::coordinator::PeerConfig;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServerSettings {
    pub enabled: bool,
    pub port: u16,
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 8765,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailboxSettings {
    pub enabled: bool,
    pub url: String,
    pub push_scope: String, // "own" | "all"
}

impl Default for MailboxSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            url: "https://gamenote-mailbox.anchit-note.workers.dev".to_string(),
            push_scope: "own".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LimitSettings {
    pub max_file_mib: usize,
    pub page_rows: u32,
}

impl Default for LimitSettings {
    fn default() -> Self {
        Self {
            max_file_mib: 25,
            page_rows: 2000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncConfig {
    pub device_name: String,
    pub role: String, // "hub" | "client"
    pub server: ServerSettings,
    pub peers: Vec<PeerConfig>,
    pub mailbox: MailboxSettings,
    pub limits: LimitSettings,
}

impl Default for SyncConfig {
    fn default() -> Self {
        #[cfg(target_os = "android")]
        let (device_name, role, server_enabled) = ("Android Device".to_string(), "client".to_string(), false);
        #[cfg(not(target_os = "android"))]
        let (device_name, role, server_enabled) = ("Desktop Host".to_string(), "hub".to_string(), true);

        Self {
            device_name,
            role,
            server: ServerSettings {
                enabled: server_enabled,
                port: 8765,
            },
            peers: Vec::new(),
            mailbox: MailboxSettings::default(),
            limits: LimitSettings::default(),
        }
    }
}

impl SyncConfig {
    pub fn load_or_default(data_dir: &Path) -> Self {
        let config_path = data_dir.join("sync_config.json");
        if config_path.exists() {
            if let Ok(bytes) = std::fs::read(&config_path) {
                if let Ok(mut cfg) = serde_json::from_slice::<Self>(&bytes) {
                    let mut modified = false;
                    if cfg.mailbox.url.trim().is_empty() {
                        cfg.mailbox.url = "https://gamenote-mailbox.anchit-note.workers.dev".to_string();
                        cfg.mailbox.enabled = true;
                        modified = true;
                    }

                    #[cfg(not(target_os = "android"))]
                    {
                        if cfg.device_name == "My Device" && cfg.role == "client" {
                            cfg.device_name = "Desktop Host".to_string();
                            cfg.role = "hub".to_string();
                            modified = true;
                        }
                    }

                    #[cfg(target_os = "android")]
                    {
                        if cfg.device_name == "My Device" {
                            cfg.device_name = "Android Device".to_string();
                            cfg.role = "client".to_string();
                            cfg.server.enabled = false;
                            modified = true;
                        }
                    }

                    // Deduplicate peers by endpoint URL
                    let mut seen_endpoints = std::collections::HashSet::new();
                    let mut deduped_peers = Vec::new();
                    for peer in std::mem::take(&mut cfg.peers) {
                        let primary_url = peer.endpoints.first().map(|e| e.url.clone()).unwrap_or_default();
                        if !primary_url.is_empty() {
                            if seen_endpoints.contains(&primary_url) {
                                modified = true;
                                continue;
                            }
                            seen_endpoints.insert(primary_url);
                        }
                        deduped_peers.push(peer);
                    }
                    cfg.peers = deduped_peers;

                    if modified {
                        let _ = cfg.save(data_dir);
                    }
                    return cfg;
                }
            }
        }
        let default_cfg = Self::default();
        let _ = default_cfg.save(data_dir);
        default_cfg
    }

    pub fn save(&self, data_dir: &Path) -> Result<()> {
        let config_path = data_dir.join("sync_config.json");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&config_path, json)?;
        Ok(())
    }
}

/// Helper for reading and writing the 32-byte sync secret.
/// Kept strictly separate from `sync_config.json` to prevent secrets from being exposed.
pub struct KeyStore;

impl KeyStore {
    pub fn load_secret(data_dir: &Path) -> Result<Option<[u8; KEY_SIZE]>> {
        let key_file = data_dir.join("sync_secret.key");
        if !key_file.exists() {
            return Ok(None);
        }
        let bytes = std::fs::read(&key_file)?;
        if bytes.len() != KEY_SIZE {
            return Err(AppError::InvalidOperation("Invalid key file length".to_string()));
        }
        let mut secret = [0u8; KEY_SIZE];
        secret.copy_from_slice(&bytes);
        Ok(Some(secret))
    }

    pub fn save_secret(data_dir: &Path, secret: &[u8; KEY_SIZE]) -> Result<()> {
        let key_file = data_dir.join("sync_secret.key");
        std::fs::write(&key_file, secret)?;
        Ok(())
    }

    pub fn delete_secret(data_dir: &Path) -> Result<()> {
        let key_file = data_dir.join("sync_secret.key");
        if key_file.exists() {
            std::fs::remove_file(&key_file)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_sync_config_load_and_save_roundtrip() {
        let dir = tempdir().unwrap();
        let path = dir.path();

        let mut config = SyncConfig::load_or_default(path);
        #[cfg(not(target_os = "android"))]
        assert_eq!(config.device_name, "Desktop Host");
        #[cfg(target_os = "android")]
        assert_eq!(config.device_name, "Android Device");
        assert_eq!(config.server.port, 8765);

        config.device_name = "Desktop Studio".to_string();
        config.server.enabled = true;
        config.save(path).unwrap();

        let reloaded = SyncConfig::load_or_default(path);
        assert_eq!(reloaded.device_name, "Desktop Studio");
        assert!(reloaded.server.enabled);

        // Verify secret roundtrip
        let secret = [42u8; KEY_SIZE];
        KeyStore::save_secret(path, &secret).unwrap();
        let loaded_secret = KeyStore::load_secret(path).unwrap().unwrap();
        assert_eq!(loaded_secret, secret);

        // Verify secret file is separate and not in sync_config.json
        let config_str = std::fs::read_to_string(path.join("sync_config.json")).unwrap();
        assert!(!config_str.contains("42"));
    }
}
