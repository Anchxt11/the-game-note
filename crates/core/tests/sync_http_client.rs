use std::net::IpAddr;
use std::sync::Arc;
use chrono::Utc;
use serde_json::json;
use tempfile::tempdir;
use uuid::Uuid;

use milanote_core::crypto::SyncKeys;
use milanote_core::db::Database;
use milanote_core::models::{Board, Element, ElementType};
use milanote_core::pairing::generate_sync_secret;
use milanote_core::storage::FileStorage;
use milanote_core::sync::coordinator::{EndpointConfig, PeerConfig, SyncCoordinator};
use milanote_core::sync::engine::sync_with_peer;
use milanote_core::transport::client::HttpClient;
use milanote_core::transport::server::{start_sync_server, ServerConfig};
use milanote_core::transport::{Transport, TransportKind};

fn create_test_board(id: Uuid, title: &str) -> Board {
    Board {
        id,
        parent_board_id: None,
        title: title.to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

fn create_test_element(id: Uuid, board_id: Uuid, text: &str, x: f64, y: f64) -> Element {
    Element {
        id,
        board_id,
        element_type: ElementType::Note,
        x,
        y,
        width: 200.0,
        height: 150.0,
        z_index: 0,
        content: json!({ "text": text }),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

#[tokio::test]
async fn test_http_client_encrypted_sync_with_server() {
    // Shared sync secret & derived keys
    let secret = generate_sync_secret();
    let sync_keys = Arc::new(SyncKeys::derive_from_secret(&secret));
    let token = sync_keys.auth_token_hex();

    // 1. Hub Server (Instance A)
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let temp_dir_a = tempdir().unwrap();
    let storage_a = Arc::new(FileStorage::open_dir(temp_dir_a.path()).unwrap());

    let server_config = ServerConfig {
        host: IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
        port: 0,
        auth_token: Some(token.clone()),
        device_name: Some("Laptop Hub".to_string()),
        sync_keys: Some(sync_keys.clone()),
        on_change_applied: None,
    };

    let server_handle = start_sync_server(server_config, db_a.clone(), Some(storage_a))
        .await
        .unwrap();
    let server_port = server_handle.port();
    let base_url = format!("http://127.0.0.1:{}", server_port);

    let site_a_hex = hex::encode(db_a.get_site_id().unwrap());

    // 2. Client (Instance B)
    let db_b = Arc::new(Database::open_in_memory().unwrap());
    let site_b_hex = hex::encode(db_b.get_site_id().unwrap());

    // Server A creates a board and note
    let board_id = Uuid::new_v4();
    let board = create_test_board(board_id, "Default");
    db_a.create_board(&board).unwrap();

    let note_a_id = Uuid::new_v4();
    let note_a = create_test_element(note_a_id, board_id, "Created on Hub Server A", 100.0, 150.0);
    db_a.create_element(&note_a).unwrap();

    // Client B connects via HttpClient
    let client = HttpClient::new(
        base_url.clone(),
        TransportKind::Lan,
        Some(token.clone()),
        Some(site_a_hex.clone()),
        Some(site_b_hex.clone()),
        Some(sync_keys.clone()),
    );

    // Health check
    let health = client.health().await.unwrap();
    assert_eq!(health.site_id, site_a_hex);
    assert_eq!(health.device_name, Some("Laptop Hub".to_string()));

    // 3. Bidirectional sync via sync_with_peer
    let stats = sync_with_peer(&db_b, &client, &site_a_hex, 1000)
        .await
        .unwrap();
    assert!(stats.rows_pulled > 0);

    // Verify Server A's note is now in Client B
    let fetched_b = db_b.get_element(&note_a_id).unwrap();
    assert_eq!(fetched_b.content["text"], "Created on Hub Server A");

    // 4. Client B creates a note and syncs back to Server A
    let note_b_id = Uuid::new_v4();
    let note_b = create_test_element(note_b_id, board_id, "Created on Client Tablet B", 350.0, 200.0);
    db_b.create_element(&note_b).unwrap();

    let stats2 = sync_with_peer(&db_b, &client, &site_a_hex, 1000)
        .await
        .unwrap();
    assert!(stats2.rows_pushed > 0);

    // Verify Client B's note now exists in Server A
    let fetched_a = db_a.get_element(&note_b_id).unwrap();
    assert_eq!(fetched_a.content["text"], "Created on Client Tablet B");

    server_handle.stop();
}

#[tokio::test]
async fn test_sync_coordinator_failover_and_pause() {
    let secret = generate_sync_secret();
    let sync_keys = Arc::new(SyncKeys::derive_from_secret(&secret));
    let token = sync_keys.auth_token_hex();

    // 1. Hub Server
    let db_hub = Arc::new(Database::open_in_memory().unwrap());
    let temp_dir = tempdir().unwrap();
    let storage = Arc::new(FileStorage::open_dir(temp_dir.path()).unwrap());

    let server_config = ServerConfig {
        host: IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
        port: 0,
        auth_token: Some(token.clone()),
        device_name: Some("Laptop Hub".to_string()),
        sync_keys: Some(sync_keys.clone()),
        on_change_applied: None,
    };

    let server_handle = start_sync_server(server_config, db_hub.clone(), Some(storage))
        .await
        .unwrap();
    let server_port = server_handle.port();
    let valid_url = format!("http://127.0.0.1:{}", server_port);
    let dead_url = "http://127.0.0.1:59999".to_string();

    let hub_site_id = hex::encode(db_hub.get_site_id().unwrap());

    // 2. Client with Coordinator
    let db_client = Arc::new(Database::open_in_memory().unwrap());

    // Candidate endpoints: dead endpoint first (testing failover), then valid
    let peer_cfg = PeerConfig {
        site_id: hub_site_id.clone(),
        name: "Laptop Hub".to_string(),
        endpoints: vec![
            EndpointConfig {
                kind: TransportKind::Lan,
                url: dead_url,
            },
            EndpointConfig {
                kind: TransportKind::Tailscale,
                url: valid_url,
            },
        ],
    };

    let coordinator = SyncCoordinator::new(
        db_client.clone(),
        vec![peer_cfg],
        Some(sync_keys),
        Some(token),
    );

    // Hub creates an element
    let board_id = Uuid::new_v4();
    let board = create_test_board(board_id, "Main Board");
    db_hub.create_board(&board).unwrap();

    let el_id = Uuid::new_v4();
    let el = create_test_element(el_id, board_id, "Important note from hub", 50.0, 50.0);
    db_hub.create_element(&el).unwrap();

    // First: test pause
    coordinator.pause().await;
    assert!(coordinator.is_paused());
    let pause_sync = coordinator.trigger_sync(None).await.unwrap();
    assert!(pause_sync.is_empty(), "Paused coordinator must not run sync");

    // Resume coordinator and sync
    coordinator.resume().await;
    assert!(!coordinator.is_paused());

    // Failover triggers and completes sync with valid endpoint
    let results = coordinator.trigger_sync(None).await.unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].0, hub_site_id);
    assert!(results[0].1.rows_pulled > 0);

    // Verify element synced to client
    let fetched = db_client.get_element(&el_id).unwrap();
    assert_eq!(fetched.content["text"], "Important note from hub");

    // Check status
    let status = coordinator.get_status().await.unwrap();
    assert_eq!(status.peers.len(), 1);
    assert_eq!(status.peers[0].consecutive_failures, 0);
    assert!(status.peers[0].last_synced_at.is_some());

    server_handle.stop();
}

#[tokio::test]
async fn test_sync_coordinator_resolves_placeholder_site_id() {
    let secret = generate_sync_secret();
    let sync_keys = Arc::new(SyncKeys::derive_from_secret(&secret));
    let token = sync_keys.auth_token_hex();

    // 1. Hub Server
    let db_hub = Arc::new(Database::open_in_memory().unwrap());
    let temp_dir = tempdir().unwrap();
    let storage = Arc::new(FileStorage::open_dir(temp_dir.path()).unwrap());

    let server_config = ServerConfig {
        host: IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
        port: 0,
        auth_token: Some(token.clone()),
        device_name: Some("Laptop Hub".to_string()),
        sync_keys: Some(sync_keys.clone()),
        on_change_applied: None,
    };

    let server_handle = start_sync_server(server_config, db_hub.clone(), Some(storage))
        .await
        .unwrap();
    let server_port = server_handle.port();
    let hub_url = format!("http://127.0.0.1:{}", server_port);
    let hub_site_id = hex::encode(db_hub.get_site_id().unwrap());

    // 2. Client with Coordinator initialized with placeholder "paired-hub" site_id
    let db_client = Arc::new(Database::open_in_memory().unwrap());

    let peer_cfg = PeerConfig {
        site_id: "paired-hub".to_string(),
        name: "Paired Hub".to_string(),
        endpoints: vec![EndpointConfig {
            kind: TransportKind::Tailscale,
            url: hub_url,
        }],
    };

    let coordinator = SyncCoordinator::new(
        db_client.clone(),
        vec![peer_cfg],
        Some(sync_keys),
        Some(token),
    );

    // Hub creates an element
    let board_id = Uuid::new_v4();
    let board = create_test_board(board_id, "Test Board");
    db_hub.create_board(&board).unwrap();

    let el_id = Uuid::new_v4();
    let el = create_test_element(el_id, board_id, "Note from Hub Server", 10.0, 20.0);
    db_hub.create_element(&el).unwrap();

    // Coordinator syncs with placeholder peer
    let results = coordinator.trigger_sync(None).await.unwrap();
    assert_eq!(results.len(), 1);
    // Should have adopted the real hub_site_id!
    assert_eq!(results[0].0, hub_site_id);
    assert!(results[0].1.rows_pulled > 0);

    // Verify peers list inside coordinator now has real site_id instead of "paired-hub"
    let current_peers = coordinator.get_peers().await;
    assert_eq!(current_peers.len(), 1);
    assert_eq!(current_peers[0].site_id, hub_site_id);

    // Verify element synced to client
    let fetched = db_client.get_element(&el_id).unwrap();
    assert_eq!(fetched.content["text"], "Note from Hub Server");

    // Status should be clean with no error
    let status = coordinator.get_status().await.unwrap();
    assert_eq!(status.last_error, None);
    assert_eq!(status.peers.len(), 1);
    assert_eq!(status.peers[0].peer_id, hub_site_id);
    assert_eq!(status.peers[0].last_error, None);

    server_handle.stop();
}
