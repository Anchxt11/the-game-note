use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use tempfile::tempdir;
use uuid::Uuid;

use milanote_core::db::Database;
use milanote_core::models::{Board, Element, ElementPositionUpdate, ElementType};
use milanote_core::sync::coordinator::SyncCoordinator;
use milanote_core::transport::discovery::DiscoveredPeer;
use milanote_core::transport::server::{start_sync_server, ServerConfig};

#[tokio::test]
async fn test_lan_discovery_and_live_sync_between_instances() {
    let dir_a = tempdir().unwrap();
    let db_path_a = dir_a.path().join("db_a.db");
    let db_a = Arc::new(Database::open_path(&db_path_a).unwrap());

    let dir_b = tempdir().unwrap();
    let db_path_b = dir_b.path().join("db_b.db");
    let db_b = Arc::new(Database::open_path(&db_path_b).unwrap());

    let site_id_a = hex::encode(db_a.get_site_id().unwrap());
    let site_id_b = hex::encode(db_b.get_site_id().unwrap());
    assert_ne!(site_id_a, site_id_b);

    // 1. Start Server A on 127.0.0.1:8920
    let srv_cfg_a = ServerConfig {
        host: std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
        port: 8920,
        auth_token: None,
        device_name: Some("Device A".to_string()),
        sync_keys: None,
        on_change_applied: None,
    };
    let srv_handle_a = start_sync_server(srv_cfg_a, db_a.clone(), None).await.unwrap();
    let port_a = srv_handle_a.port();

    // 2. Start Server B on 127.0.0.1:8921
    let b_applied = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let b_applied_clone = b_applied.clone();
    let srv_cfg_b = ServerConfig {
        host: std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
        port: 8921,
        auth_token: None,
        device_name: Some("Device B".to_string()),
        sync_keys: None,
        on_change_applied: Some(Arc::new(move || {
            b_applied_clone.store(true, std::sync::atomic::Ordering::SeqCst);
        })),
    };
    let srv_handle_b = start_sync_server(srv_cfg_b, db_b.clone(), None).await.unwrap();
    let port_b = srv_handle_b.port();

    // 3. Coordinators
    let coord_a = Arc::new(SyncCoordinator::new(db_a.clone(), vec![], None, None));
    let coord_b = Arc::new(SyncCoordinator::new(db_b.clone(), vec![], None, None));

    // Connect peers via simulated discovery callback or direct endpoint
    let disc_peer_b = DiscoveredPeer {
        site_id: site_id_b.clone(),
        device_name: "Device B".to_string(),
        ip: "127.0.0.1".to_string(),
        port: port_b,
        endpoint_url: format!("http://127.0.0.1:{}", port_b),
    };
    let disc_peer_a = DiscoveredPeer {
        site_id: site_id_a.clone(),
        device_name: "Device A".to_string(),
        ip: "127.0.0.1".to_string(),
        port: port_a,
        endpoint_url: format!("http://127.0.0.1:{}", port_a),
    };

    coord_a.handle_discovered_peer(disc_peer_b).await;
    coord_b.handle_discovered_peer(disc_peer_a).await;

    // Small delay for initial connection
    tokio::time::sleep(Duration::from_millis(50)).await;

    // 4. Device A creates a board and note element
    let board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Live Sync Board".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db_a.create_board(&board).unwrap();

    let elem = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::Note,
        x: 100.0,
        y: 200.0,
        width: 250.0,
        height: 150.0,
        z_index: 1,
        content: serde_json::json!({"text": "Hello from A"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db_a.create_element(&elem).unwrap();

    // 5. Device A triggers fast push
    coord_a.fast_push_pending_changes().await;

    // Allow fast push and server apply to complete (sub-100ms)
    tokio::time::sleep(Duration::from_millis(150)).await;

    // 6. Verify Device B received the board and element immediately!
    let b_boards = db_b.list_boards(None).unwrap();
    assert!(b_applied.load(std::sync::atomic::Ordering::SeqCst), "Device B should have executed on_change_applied callback");
    assert!(b_boards.iter().any(|b| b.id == board.id && b.title == "Live Sync Board"), "Device B should have received board from Device A");

    let b_elements = db_b.get_board_elements(&board.id).unwrap();
    assert_eq!(b_elements.len(), 1, "Device B should have 1 element on the board");
    assert_eq!(b_elements[0].id, elem.id);
    assert_eq!(b_elements[0].x, 100.0);
    assert_eq!(b_elements[0].y, 200.0);

    // 7. Device B moves the element to (450.0, 600.0)
    let update = ElementPositionUpdate {
        id: elem.id,
        x: 450.0,
        y: 600.0,
        width: 250.0,
        height: 150.0,
        z_index: 2,
    };
    db_b.update_element_position(&update).unwrap();

    // 8. Device B triggers fast push
    coord_b.fast_push_pending_changes().await;
    tokio::time::sleep(Duration::from_millis(150)).await;

    // 9. Verify Device A immediately reflects the moved element!
    let a_elem_updated = db_a.get_element(&elem.id).unwrap();
    assert_eq!(a_elem_updated.x, 450.0, "Device A should have element moved by B");
    assert_eq!(a_elem_updated.y, 600.0);

    srv_handle_a.stop();
    srv_handle_b.stop();
}
