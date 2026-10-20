mod commands;
mod sync_state;

use std::sync::Arc;
use milanote_core::crypto::SyncKeys;
use milanote_core::seed::seed_demo_data;
use milanote_core::sync::config::{KeyStore, SyncConfig};
use milanote_core::sync::coordinator::SyncCoordinator;
use milanote_core::{Database, FileStorage};
use sync_state::AppSyncState;
use tauri::{Emitter, Manager};
use tokio::sync::{Mutex, RwLock};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Use Tauri's own path resolver so the DB and files land inside
            // the platform-appropriate app data directory (e.g. ~/.local/share/com.anchit.gameNote/
            // on Linux or the internal app sandbox on Android).
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");

            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            std::env::set_var("CRSQLITE_DATA_DIR", &app_data_dir);

            let db_path = app_data_dir.join("milanote.db");
            println!("Opening database at: {}", db_path.display());

            let db = Database::open_path(&db_path)
                .expect("Fatal: failed to open SQLite database");

            let files_dir = app_data_dir.join("files");
            let storage = FileStorage::open_dir(&files_dir)
                .expect("Fatal: failed to open file storage");

            // Seed demo data on first launch (empty database).
            if let Ok(boards) = db.list_boards(None) {
                if boards.is_empty() {
                    println!("No boards found — seeding demo data...");
                    let _ = seed_demo_data(&db);
                }
            }

            // Phase 5 Sync Initialization
            let sync_secret = KeyStore::load_secret(&app_data_dir).unwrap_or(None);
            let (_sync_secret, sync_keys) = match sync_secret {
                Some(s) => {
                    let k = Arc::new(SyncKeys::derive_from_secret(&s));
                    (s, Some(k))
                }
                None => {
                    let fresh = milanote_core::pairing::generate_sync_secret();
                    let _ = KeyStore::save_secret(&app_data_dir, &fresh);
                    let k = Arc::new(SyncKeys::derive_from_secret(&fresh));
                    (fresh, Some(k))
                }
            };
            let auth_token = sync_keys.as_ref().map(|k| k.auth_token_hex());

            let sync_config = SyncConfig::load_or_default(&app_data_dir);
            let db_arc = Arc::new(db.clone());
            let storage_arc = Arc::new(storage.clone());

            let mailbox_url = if sync_config.mailbox.enabled && !sync_config.mailbox.url.is_empty() {
                Some(sync_config.mailbox.url.clone())
            } else {
                None
            };

            let coordinator = Arc::new(SyncCoordinator::with_options(
                db_arc.clone(),
                sync_config.peers.clone(),
                sync_keys.clone(),
                auth_token.clone(),
                mailbox_url,
                Some(storage_arc.clone()),
            ));

            // Automated rolling daily backup on startup (Task 5.11)
            let backup_dir = app_data_dir.join("backups");
            let _ = milanote_core::BackupManager::create_backup(&db.conn(), &backup_dir, "daily");
            let _ = milanote_core::BackupManager::rotate_backups(&backup_dir, 7, 1);

            // Automated content-addressed migration of legacy/embedded images (Task 5.7)
            if let Some(ref keys) = sync_keys {
                let _ = milanote_core::migrate_embedded_images(&db.conn(), &storage, &keys.file_key);
            }

            let mut server_handle = None;

            if sync_config.server.enabled {
                let app_handle_for_post = app.handle().clone();
                let server_cfg = milanote_core::transport::ServerConfig {
                    host: std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED),
                    port: sync_config.server.port,
                    auth_token,
                    device_name: Some(sync_config.device_name.clone()),
                    sync_keys: sync_keys.clone(),
                    on_change_applied: Some(Arc::new(move || {
                        let _ = app_handle_for_post.emit("sync-applied", ());
                    })),
                };
                let db_for_srv = db_arc.clone();
                let storage_for_srv = storage_arc.clone();
                tauri::async_runtime::block_on(async {
                    match milanote_core::transport::start_sync_server(
                        server_cfg,
                        db_for_srv,
                        Some(storage_for_srv),
                    )
                    .await
                    {
                        Ok(handle) => {
                            let mut rx = handle.event_sender().subscribe();
                            let app_handle_for_server = app.handle().clone();
                            let coordinator_for_server = coordinator.clone();
                            tauri::async_runtime::spawn(async move {
                                loop {
                                    match rx.recv().await {
                                        Ok(_db_ver) => {
                                            let _ = app_handle_for_server.emit("sync-applied", ());
                                            let _ = app_handle_for_server.emit(
                                                "sync-status-changed",
                                                &coordinator_for_server.get_status().await.ok(),
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
                            server_handle = Some(handle);
                        }
                        Err(e) => {
                            log::warn!("Warning: Failed to auto-start sync server: {}", e);
                        }
                    }
                });
            }

            // Wire instant change notification callback
            let app_handle_for_cb = app.handle().clone();
            tauri::async_runtime::block_on(async {
                coordinator.set_on_change_applied(move || {
                    let _ = app_handle_for_cb.emit("sync-applied", ());
                }).await;
            });

            // Start LAN auto-discovery
            let my_site_id = hex::encode(db.get_site_id().unwrap_or_default());
            let my_device_name = sync_config.device_name.clone();
            let my_port = server_handle.as_ref().map(|h| h.port()).unwrap_or(sync_config.server.port);

            let coord_discovery = coordinator.clone();
            let app_discovery = app.handle().clone();
            let app_data_dir_discovery = app_data_dir.clone();
            let is_server_enabled = server_handle.is_some() && sync_config.server.enabled;
            let discovery_handle = milanote_core::transport::start_lan_discovery(
                my_site_id,
                my_device_name,
                my_port,
                is_server_enabled,
                move |peer| {
                    let coord = coord_discovery.clone();
                    let app_handle = app_discovery.clone();
                    let app_data_dir = app_data_dir_discovery.clone();
                    tauri::async_runtime::spawn(async move {
                        coord.handle_discovered_peer(peer).await;
                        let updated_peers = coord.get_peers().await;
                        let mut config = SyncConfig::load_or_default(&app_data_dir);
                        if config.peers != updated_peers {
                            config.peers = updated_peers;
                            let _ = config.save(&app_data_dir);
                        }
                        let _ = app_handle.emit("sync-status-changed", &coord.get_status().await.ok());
                    });
                },
            );

            // Real-time SSE push listener: connects to peers and triggers immediate sync on change
            let coord_sse = coordinator.clone();
            let app_sse = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use milanote_core::{StreamExt, Transport};
                let active_listeners = Arc::new(tokio::sync::Mutex::new(std::collections::HashSet::<String>::new()));

                loop {
                    let peers = coord_sse.get_peers().await;
                    for peer in peers {
                        let is_active = {
                            let guard = active_listeners.lock().await;
                            guard.contains(&peer.site_id)
                        };
                        if is_active {
                            continue;
                        }

                        if let Some(client) = coord_sse.get_working_client_for_peer(&peer).await {
                            if let Some(mut stream) = client.subscribe() {
                                {
                                    let mut guard = active_listeners.lock().await;
                                    guard.insert(peer.site_id.clone());
                                }
                                let site_id = peer.site_id.clone();
                                let peer_name = peer.name.clone();
                                let coord_inner = coord_sse.clone();
                                let app_inner = app_sse.clone();
                                let active_listeners_inner = active_listeners.clone();

                                tauri::async_runtime::spawn(async move {
                                    log::info!("Started real-time SSE listener for peer {} ({})", peer_name, site_id);
                                    while let Some(event) = stream.next().await {
                                        match event {
                                            milanote_core::transport::SyncEvent::ChangesAvailable { db_version } => {
                                                log::info!("SSE notification from peer {}: new db_version {}", site_id, db_version);
                                                let _ = coord_inner.trigger_sync(None).await;
                                                let _ = app_inner.emit("sync-applied", ());
                                                if let Ok(status) = coord_inner.get_status().await {
                                                    let _ = app_inner.emit("sync-status-changed", &status);
                                                }
                                            }
                                        }
                                    }
                                    log::warn!("SSE stream ended for peer {} ({})", peer_name, site_id);
                                    let mut guard = active_listeners_inner.lock().await;
                                    guard.remove(&site_id);
                                });
                            }
                        }
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                }
            });

            // Real-time SSE push listener for Cloudflare Mailbox:
            // Listens for instant notifications pushed from Cloudflare Durable Object (~30-50ms latency)
            let coord_mailbox_sse = coordinator.clone();
            let app_mailbox_sse = app.handle().clone();
            let db_mailbox_sse = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                use milanote_core::transport::MailboxClient;
                use milanote_core::StreamExt;
                loop {
                    let m_url = coord_mailbox_sse.get_mailbox_url().await;
                    let keys = coord_mailbox_sse.get_sync_keys().await;

                    if let (Some(url), Some(keys)) = (m_url, keys) {
                        if !url.is_empty() {
                            let local_site_id = hex::encode(db_mailbox_sse.get_site_id().unwrap_or_default());
                            let client = MailboxClient::new(url, local_site_id, keys);
                            if let Some(mut stream) = client.subscribe() {
                                log::info!("Subscribed to real-time Cloudflare Mailbox SSE events");
                                while let Some(seq) = stream.next().await {
                                    log::info!("Live Mailbox event received: seq {}", seq);
                                    if let Ok(stats) = coord_mailbox_sse.sync_mailbox_cycle().await {
                                        if stats.rows_pulled > 0 {
                                            let _ = app_mailbox_sse.emit("sync-applied", ());
                                        }
                                        if let Ok(status) = coord_mailbox_sse.get_status().await {
                                            let _ = app_mailbox_sse.emit("sync-status-changed", &status);
                                        }
                                    }
                                }
                                log::warn!("Mailbox SSE stream ended, will retry in 2s...");
                            }
                        }
                    }

                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                }
            });

            // Continuous background sync fallback loop (every 2 seconds) for auto-updates across devices
            let coord_periodic = coordinator.clone();
            let app_periodic = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));
                loop {
                    interval.tick().await;
                    if let Ok(results) = coord_periodic.trigger_sync(None).await {
                        let pulled: usize = results.iter().map(|(_, s)| s.rows_pulled).sum();
                        let pushed: usize = results.iter().map(|(_, s)| s.rows_pushed).sum();
                        if pulled > 0 || pushed > 0 {
                            let _ = app_periodic.emit("sync-applied", ());
                        }
                        if let Ok(status) = coord_periodic.get_status().await {
                            let _ = app_periodic.emit("sync-status-changed", &status);
                        }
                    }
                }
            });

            let app_sync_state = AppSyncState {
                db: db_arc,
                storage: storage_arc,
                coordinator: coordinator.clone(),
                server_handle: Mutex::new(server_handle),
                discovery_handle: Mutex::new(Some(discovery_handle)),
                app_data_dir: app_data_dir.clone(),
                sync_keys: Arc::new(RwLock::new(sync_keys)),
            };

            app.manage(db);
            app.manage(storage);
            app.manage(app_sync_state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if *focused {
                    if let Some(sync_state) = window.try_state::<AppSyncState>() {
                        let coordinator = sync_state.coordinator.clone();
                        let app_handle = window.app_handle().clone();
                        let app_data_dir = sync_state.app_data_dir.clone();
                        tauri::async_runtime::spawn(async move {
                            coordinator.resume().await;
                            if let Ok(results) = coordinator.trigger_sync(None).await {
                                let updated_peers = coordinator.get_peers().await;
                                let mut config = SyncConfig::load_or_default(&app_data_dir);
                                if config.peers != updated_peers {
                                    config.peers = updated_peers;
                                    let _ = config.save(&app_data_dir);
                                }
                                let _ = app_handle.emit("sync-status-changed", &coordinator.get_status().await.ok());
                                let pulled: usize = results.iter().map(|(_, s)| s.rows_pulled).sum();
                                let pushed: usize = results.iter().map(|(_, s)| s.rows_pushed).sum();
                                if pulled > 0 || pushed > 0 {
                                    let _ = app_handle.emit("sync-applied", ());
                                }
                            }
                        });
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_boards,
            commands::get_board_tree,
            commands::create_board,
            commands::delete_board,
            commands::get_board_elements,
            commands::update_element_positions,
            commands::create_element,
            commands::update_element_content,
            commands::update_element_style,
            commands::update_element_board_id,
            commands::delete_element,
            commands::sync_board_state,
            commands::search_boards,
            commands::duplicate_board,
            commands::open_external_url,
            // Phase 5 Sync Commands
            commands::get_sync_config,
            commands::save_sync_config,
            commands::start_pairing,
            commands::complete_pairing,
            commands::list_peers,
            commands::add_peer,
            commands::remove_peer,
            commands::test_peer,
            commands::test_mailbox,
            commands::trigger_sync,
            commands::get_sync_status,
            commands::export_sync_log,
            commands::update_board,
            commands::sync_forget_peer,
            commands::sync_clear_inactive_peers,
            // Phase 5 Image and Backup Commands (Task 5.7 & Task 5.11)
            commands::store_image_file,
            commands::get_image_file,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::export_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
