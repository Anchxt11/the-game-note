use std::sync::Arc;
use milanote_core::crypto::SyncKeys;
use milanote_core::pairing::{
    decode_pairing_code, encode_pairing_code, export_recovery_code, generate_pairing_qr_svg,
    generate_sync_secret, PairingPayload, PAIRING_VERSION,
};
use milanote_core::sync::config::{KeyStore, SyncConfig};
use milanote_core::sync::coordinator::{EndpointConfig, PeerConfig, SyncStatus};
use milanote_core::sync::engine::SyncStats;
use milanote_core::transport::client::HttpClient;
use milanote_core::transport::{PeerHealth, Transport, TransportKind};
use milanote_core::{
    Board, BoardTreeNode, Database, Element, ElementPositionUpdate, SearchResult,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::sync_state::AppSyncState;

#[tauri::command]
pub async fn list_boards(state: State<'_, Database>, parent_id: Option<Uuid>) -> Result<Vec<Board>, String> {
    state.list_boards(parent_id.as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_board_tree(state: State<'_, Database>) -> Result<Vec<BoardTreeNode>, String> {
    state.get_board_tree().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_board(
    state: State<'_, Database>,
    sync_state: State<'_, AppSyncState>,
    title: String,
    parent_id: Option<Uuid>,
    color_theme: Option<String>,
) -> Result<Board, String> {
    let board = Board {
        id: Uuid::new_v4(),
        parent_board_id: parent_id,
        title,
        color_theme,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };
    state.create_board(&board).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(board)
}

#[tauri::command]
pub async fn delete_board(state: State<'_, Database>, sync_state: State<'_, AppSyncState>, id: Uuid) -> Result<(), String> {
    state.delete_board(&id).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn get_board_elements(state: State<'_, Database>, board_id: Uuid) -> Result<Vec<Element>, String> {
    state.get_board_elements(&board_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_element_positions(
    state: State<'_, Database>,
    sync_state: State<'_, AppSyncState>,
    updates: Vec<ElementPositionUpdate>,
) -> Result<(), String> {
    state.batch_update_positions(&updates).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn create_element(state: State<'_, Database>, sync_state: State<'_, AppSyncState>, element: Element) -> Result<(), String> {
    state.create_element(&element).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn update_element_content(state: State<'_, Database>, sync_state: State<'_, AppSyncState>, id: Uuid, content: serde_json::Value) -> Result<(), String> {
    let elem = state.get_element(&id).map_err(|e| e.to_string())?;
    state.update_element_content(&id, &content, elem.style.as_ref()).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn update_element_style(state: State<'_, Database>, sync_state: State<'_, AppSyncState>, id: Uuid, style: Option<serde_json::Value>) -> Result<(), String> {
    state.update_element_style(&id, style.as_ref()).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn update_element_board_id(state: State<'_, Database>, sync_state: State<'_, AppSyncState>, id: Uuid, board_id: Uuid) -> Result<(), String> {
    state.update_element_board_id(&id, &board_id).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn delete_element(state: State<'_, Database>, sync_state: State<'_, AppSyncState>, id: Uuid) -> Result<(), String> {
    state.delete_element(&id).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn sync_board_state(state: State<'_, Database>, sync_state: State<'_, AppSyncState>, board_id: Uuid, elements: Vec<Element>) -> Result<(), String> {
    let existing_elements = state.get_board_elements(&board_id).map_err(|e| e.to_string())?;
    let new_ids: std::collections::HashSet<Uuid> = elements.iter().map(|e| e.id).collect();
    
    // Delete missing elements
    for old_el in &existing_elements {
        if !new_ids.contains(&old_el.id) {
            let _ = state.delete_element(&old_el.id);
        }
    }
    
    // Update or create
    for el in elements {
        if existing_elements.iter().any(|old| old.id == el.id) {
            let _ = state.update_element_position(&ElementPositionUpdate {
                id: el.id,
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.height,
                z_index: el.z_index,
            });
            let _ = state.update_element_content(&el.id, &el.content, el.style.as_ref());
            let _ = state.update_element_style(&el.id, el.style.as_ref());
        } else {
            let _ = state.create_element(&el);
        }
    }
    sync_state.notify_db_changed();
    Ok(())
}

#[tauri::command]
pub async fn search_boards(state: State<'_, Database>, query: String) -> Result<Vec<SearchResult>, String> {
    state.search_boards(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_board(
    state: State<'_, Database>,
    sync_state: State<'_, AppSyncState>,
    board_id: Uuid,
    new_title: Option<String>,
) -> Result<Board, String> {
    let board = state.duplicate_board(&board_id, None, new_title.as_deref()).map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(board)
}

#[tauri::command]
pub async fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    println!("Opening external URL in system browser: {}", url);
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

// --- Sync Commands ---

#[tauri::command]
pub async fn get_sync_config(sync_state: State<'_, AppSyncState>) -> Result<SyncConfig, String> {
    let mut config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    config.peers = sync_state.coordinator.get_peers().await;
    Ok(config)
}

#[tauri::command]
pub async fn save_sync_config(
    #[allow(unused_variables)] app: AppHandle,
    sync_state: State<'_, AppSyncState>,
    config: SyncConfig,
) -> Result<(), String> {
    config
        .save(&sync_state.app_data_dir)
        .map_err(|e| e.to_string())?;

    sync_state
        .coordinator
        .update_peers(config.peers.clone())
        .await;

    let m_url = if config.mailbox.enabled && !config.mailbox.url.is_empty() {
        Some(config.mailbox.url.clone())
    } else {
        None
    };
    sync_state.coordinator.set_mailbox_url(m_url).await;

    restart_sync_server_internal(&app, &sync_state, &config).await;
    Ok(())
}

pub async fn restart_sync_server_internal(
    app: &AppHandle,
    sync_state: &AppSyncState,
    config: &SyncConfig,
) {
    let mut handle_guard = sync_state.server_handle.lock().await;
    if let Some(old) = handle_guard.take() {
        old.stop();
    }

    if config.server.enabled {
        let token = {
            let k = sync_state.sync_keys.read().await;
            k.as_ref().map(|k| k.auth_token_hex())
        };
        let keys = { sync_state.sync_keys.read().await.clone() };
        let app_handle_for_post = app.clone();
        let server_cfg = milanote_core::transport::ServerConfig {
            host: std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED),
            port: config.server.port,
            auth_token: token,
            device_name: Some(config.device_name.clone()),
            sync_keys: keys,
            on_change_applied: Some(Arc::new(move || {
                let _ = app_handle_for_post.emit("sync-applied", ());
            })),
        };
        match milanote_core::transport::start_sync_server(
            server_cfg,
            sync_state.db.clone(),
            Some(sync_state.storage.clone()),
        )
        .await
        {
            Ok(handle) => {
                let mut rx = handle.event_sender().subscribe();
                let app_handle_for_server = app.clone();
                let coordinator = sync_state.coordinator.clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        match rx.recv().await {
                            Ok(_db_ver) => {
                                let _ = app_handle_for_server.emit("sync-applied", ());
                                let _ = app_handle_for_server.emit(
                                    "sync-status-changed",
                                    &coordinator.get_status().await.ok(),
                                );
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                                let _ = app_handle_for_server.emit("sync-applied", ());
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                                break;
                            }
                        }
                    }
                });
                *handle_guard = Some(handle);
            }
            Err(e) => {
                log::error!("Failed to start sync server: {}", e);
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct StartPairingResponse {
    pub pairing_code: String,
    pub qr_svg: String,
    pub recovery_code: String,
    pub hub_hints: Vec<String>,
}

#[tauri::command]
pub async fn start_pairing(
    sync_state: State<'_, AppSyncState>,
) -> Result<StartPairingResponse, String> {
    let secret = match KeyStore::load_secret(&sync_state.app_data_dir).map_err(|e| e.to_string())? {
        Some(s) => s,
        None => {
            let fresh = generate_sync_secret();
            KeyStore::save_secret(&sync_state.app_data_dir, &fresh)
                .map_err(|e| e.to_string())?;
            fresh
        }
    };

    let keys = Arc::new(SyncKeys::derive_from_secret(&secret));
    sync_state.set_keys(keys).await;

    let config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    let mut hub_hints = Vec::new();
    if config.server.enabled {
        if let Some(ts_ip) = get_tailscale_ip() {
            hub_hints.push(format!("http://{}:{}", ts_ip, config.server.port));
        }
        if let Some(ip) = get_local_outbound_ip() {
            if !ip.is_loopback() {
                hub_hints.push(format!("http://{}:{}", ip, config.server.port));
            }
        }
        hub_hints.push(format!("http://localhost:{}", config.server.port));
    }

    let hub_site_id = hex::encode(sync_state.db.get_site_id().map_err(|e| e.to_string())?);

    let payload = PairingPayload {
        v: PAIRING_VERSION,
        sync_secret: hex::encode(secret),
        hub_hints: hub_hints.clone(),
        mailbox_url: if config.mailbox.enabled && !config.mailbox.url.is_empty() {
            Some(config.mailbox.url.clone())
        } else {
            None
        },
        hub_site_id: Some(hub_site_id),
    };

    let pairing_code = encode_pairing_code(&payload).map_err(|e| e.to_string())?;
    let qr_svg = generate_pairing_qr_svg(&payload).map_err(|e| e.to_string())?;
    let recovery_code = export_recovery_code(&secret);

    Ok(StartPairingResponse {
        pairing_code,
        qr_svg,
        recovery_code,
        hub_hints,
    })
}

fn get_tailscale_ip() -> Option<String> {
    let output = std::process::Command::new("tailscale")
        .args(["ip", "-4"])
        .output()
        .ok()?;
    if output.status.success() {
        let ip_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !ip_str.is_empty() {
            return Some(ip_str);
        }
    }
    None
}

fn get_local_outbound_ip() -> Option<std::net::IpAddr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip())
}

#[tauri::command]
pub async fn complete_pairing(
    app: AppHandle,
    sync_state: State<'_, AppSyncState>,
    code: String,
) -> Result<SyncConfig, String> {
    let payload = decode_pairing_code(&code).map_err(|e| e.to_string())?;
    let secret_bytes = hex::decode(&payload.sync_secret).map_err(|e| e.to_string())?;
    let secret: [u8; 32] = secret_bytes
        .as_slice()
        .try_into()
        .map_err(|_| "Invalid secret length".to_string())?;

    KeyStore::save_secret(&sync_state.app_data_dir, &secret).map_err(|e| e.to_string())?;
    let keys = Arc::new(SyncKeys::derive_from_secret(&secret));
    sync_state.set_keys(keys).await;

    let mut config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    if let Some(m_url) = payload.mailbox_url {
        if !m_url.is_empty() {
            config.mailbox.enabled = true;
            config.mailbox.url = m_url;
        }
    }

    // Add hub endpoints if provided
    if !payload.hub_hints.is_empty() {
        let endpoints: Vec<EndpointConfig> = payload
            .hub_hints
            .into_iter()
            .map(|url| {
                let kind = if url.contains("100.") || url.contains(".ts.net") {
                    TransportKind::Tailscale
                } else {
                    TransportKind::Lan
                };
                EndpointConfig { kind, url }
            })
            .collect();

        let site_id = payload
            .hub_site_id
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "paired-hub".to_string());

        let peer = PeerConfig {
            site_id: site_id.clone(),
            name: "Paired Hub".to_string(),
            endpoints,
        };

        if let Some(pos) = config.peers.iter().position(|p| p.name == "Paired Hub" || p.site_id == site_id) {
            config.peers[pos] = peer;
        } else {
            config.peers.push(peer);
        }
    }

    config.save(&sync_state.app_data_dir).map_err(|e| e.to_string())?;
    sync_state.coordinator.update_peers(config.peers.clone()).await;

    let m_url = if config.mailbox.enabled && !config.mailbox.url.is_empty() {
        Some(config.mailbox.url.clone())
    } else {
        None
    };
    sync_state.coordinator.set_mailbox_url(m_url).await;

    // Restart sync server with the newly paired auth token and sync keys
    restart_sync_server_internal(&app, &sync_state, &config).await;

    // Trigger initial sync in background
    let coordinator = sync_state.coordinator.clone();
    let app_handle = app.clone();
    let app_data_dir = sync_state.app_data_dir.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(results) = coordinator.trigger_sync(None).await {
            let updated_peers = coordinator.get_peers().await;
            let mut config = SyncConfig::load_or_default(&app_data_dir);
            if config.peers != updated_peers {
                config.peers = updated_peers;
                let _ = config.save(&app_data_dir);
            }
            let _ = app_handle.emit("sync-status-changed", &coordinator.get_status().await.ok());
            let pulled_rows: usize = results.iter().map(|(_, s)| s.rows_pulled).sum();
            if pulled_rows > 0 {
                let _ = app_handle.emit("sync-applied", ());
            }
        }
    });

    Ok(config)
}

#[tauri::command]
pub async fn list_peers(sync_state: State<'_, AppSyncState>) -> Result<Vec<PeerConfig>, String> {
    Ok(sync_state.coordinator.get_peers().await)
}

#[tauri::command]
pub async fn add_peer(
    sync_state: State<'_, AppSyncState>,
    peer: PeerConfig,
) -> Result<SyncConfig, String> {
    let mut config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    if let Some(pos) = config.peers.iter().position(|p| p.site_id == peer.site_id) {
        config.peers[pos] = peer;
    } else {
        config.peers.push(peer);
    }
    config.save(&sync_state.app_data_dir).map_err(|e| e.to_string())?;
    sync_state.coordinator.update_peers(config.peers.clone()).await;
    Ok(config)
}

#[tauri::command]
pub async fn remove_peer(
    sync_state: State<'_, AppSyncState>,
    site_id: String,
) -> Result<SyncConfig, String> {
    let mut config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    config.peers.retain(|p| p.site_id != site_id);
    config.save(&sync_state.app_data_dir).map_err(|e| e.to_string())?;
    sync_state.coordinator.update_peers(config.peers.clone()).await;
    Ok(config)
}

#[tauri::command]
pub async fn test_peer(
    sync_state: State<'_, AppSyncState>,
    url: String,
    kind: TransportKind,
) -> Result<PeerHealth, String> {
    let token = {
        let k = sync_state.sync_keys.read().await;
        k.as_ref().map(|k| k.auth_token_hex())
    };
    let keys = { sync_state.sync_keys.read().await.clone() };
    let client = HttpClient::new(url, kind, token, None, None, keys);
    client.health().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_mailbox(
    sync_state: State<'_, AppSyncState>,
    url: String,
) -> Result<milanote_core::MailboxHealth, String> {
    let keys = {
        let k = sync_state.sync_keys.read().await;
        k.clone().ok_or_else(|| "No sync secret configured".to_string())?
    };
    let local_site_id = hex::encode(sync_state.db.get_site_id().map_err(|e| e.to_string())?);
    let client = milanote_core::MailboxClient::new(url, local_site_id, keys);
    client.health().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn trigger_sync(
    app: AppHandle,
    sync_state: State<'_, AppSyncState>,
    peer_id: Option<String>,
) -> Result<Vec<(String, SyncStats)>, String> {
    let results = sync_state
        .coordinator
        .trigger_sync(peer_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let updated_peers = sync_state.coordinator.get_peers().await;
    let mut config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    if config.peers != updated_peers {
        config.peers = updated_peers;
        let _ = config.save(&sync_state.app_data_dir);
    }

    if let Ok(status) = sync_state.coordinator.get_status().await {
        let _ = app.emit("sync-status-changed", &status);
    }

    // Always emit sync-applied so that any pending/merged changes are immediately reflected in the UI
    let _ = app.emit("sync-applied", ());

    Ok(results)
}

#[tauri::command]
pub async fn get_sync_status(sync_state: State<'_, AppSyncState>) -> Result<SyncStatus, String> {
    sync_state.coordinator.get_status().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_sync_log(sync_state: State<'_, AppSyncState>) -> Result<String, String> {
    let status = sync_state.coordinator.get_status().await.map_err(|e| e.to_string())?;
    let config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    let site_id = hex::encode(sync_state.db.get_site_id().map_err(|e| e.to_string())?);
    let log = serde_json::json!({
        "device_name": config.device_name,
        "site_id": site_id,
        "role": config.role,
        "status": status,
        "peers_configured": config.peers.len(),
    });
    Ok(serde_json::to_string_pretty(&log).unwrap_or_default())
}

#[tauri::command]
pub async fn update_board(
    state: State<'_, Database>,
    sync_state: State<'_, AppSyncState>,
    id: Uuid,
    title: Option<String>,
    color_theme: Option<String>,
) -> Result<Board, String> {
    let board = state.update_board(&id, title.as_deref(), color_theme.as_deref().map(Some), None)
        .map_err(|e| e.to_string())?;
    sync_state.notify_db_changed();
    Ok(board)
}

#[tauri::command]
pub async fn sync_forget_peer(
    sync_state: State<'_, AppSyncState>,
    peer_id: String,
) -> Result<(), String> {
    sync_state.coordinator.forget_peer(&peer_id).await.map_err(|e| e.to_string())?;
    let mut config = SyncConfig::load_or_default(&sync_state.app_data_dir);
    config.peers.retain(|p| p.site_id != peer_id);
    let _ = config.save(&sync_state.app_data_dir);
    Ok(())
}

#[tauri::command]
pub async fn sync_clear_inactive_peers(
    sync_state: State<'_, AppSyncState>,
) -> Result<(), String> {
    sync_state.coordinator.clear_inactive_peers().await.map_err(|e| e.to_string())
}

