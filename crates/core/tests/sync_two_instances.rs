use std::sync::Arc;
use chrono::Utc;
use milanote_core::db::Database;
use milanote_core::models::{Board, Element, ElementPositionUpdate, ElementType};
use milanote_core::sync::cursors::{self, CursorDirection};
use milanote_core::sync::engine::sync_with_peer;
use milanote_core::sync::{apply_changes_conn, CrChange};
use milanote_core::transport::{LocalTransport, Transport};
use serde_json::json;
use uuid::Uuid;

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
async fn test_bidirectional_sync_converges() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let site_a = db_a.get_site_id().unwrap();
    let site_b = db_b.get_site_id().unwrap();
    let site_a_hex = hex::encode(&site_a);
    let site_b_hex = hex::encode(&site_b);

    // Instance A creates Board A and Note A
    let board_a_id = Uuid::new_v4();
    let board_a = create_test_board(board_a_id, "Board Alpha");
    db_a.create_board(&board_a).unwrap();
    let el_a_id = Uuid::new_v4();
    let el_a = create_test_element(el_a_id, board_a_id, "Note on Alpha", 100.0, 100.0);
    db_a.create_element(&el_a).unwrap();

    // Instance B creates Board B and Note B
    let board_b_id = Uuid::new_v4();
    let board_b = create_test_board(board_b_id, "Board Beta");
    db_b.create_board(&board_b).unwrap();
    let el_b_id = Uuid::new_v4();
    let el_b = create_test_element(el_b_id, board_b_id, "Note on Beta", 200.0, 200.0);
    db_b.create_element(&el_b).unwrap();

    // A syncs with B
    let transport_b_for_a = LocalTransport::new(db_b.clone(), Some(site_a.clone()));
    let stats_a = sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();
    assert!(stats_a.rows_pulled > 0);
    assert!(stats_a.rows_pushed > 0);

    // B syncs with A: B pulls A's changes (idempotently advancing B's pull cursor)
    let transport_a_for_b = LocalTransport::new(db_a.clone(), Some(site_b.clone()));
    let stats_b = sync_with_peer(&db_b, &transport_a_for_b, &site_a_hex, 100).await.unwrap();
    assert!(stats_b.pull_cursor > 0);

    // On subsequent sync cycle, both instances are fully in sync: 0 pulled, 0 pushed
    let stats_b_again = sync_with_peer(&db_b, &transport_a_for_b, &site_a_hex, 100).await.unwrap();
    assert_eq!(stats_b_again.rows_pulled, 0);
    assert_eq!(stats_b_again.rows_pushed, 0);

    // Verify convergence on both instances
    let boards_on_a = db_a.list_boards(None).unwrap();
    let boards_on_b = db_b.list_boards(None).unwrap();
    assert_eq!(boards_on_a.len(), 2);
    assert_eq!(boards_on_b.len(), 2);

    let els_on_a = db_a.get_board_elements(&board_b_id).unwrap();
    let els_on_b = db_b.get_board_elements(&board_a_id).unwrap();
    assert_eq!(els_on_a.len(), 1);
    assert_eq!(els_on_b.len(), 1);
    assert_eq!(els_on_a[0].id, el_b_id);
    assert_eq!(els_on_b[0].id, el_a_id);
}

#[tokio::test]
async fn test_concurrent_edits_merge_deterministically() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let site_a = db_a.get_site_id().unwrap();
    let site_b = db_b.get_site_id().unwrap();
    let site_a_hex = hex::encode(&site_a);
    let site_b_hex = hex::encode(&site_b);

    // 1. Initial shared item
    let board_id = Uuid::new_v4();
    let board = create_test_board(board_id, "Shared Project");
    db_a.create_board(&board).unwrap();
    let el_id = Uuid::new_v4();
    let el = create_test_element(el_id, board_id, "Original Content", 10.0, 20.0);
    db_a.create_element(&el).unwrap();

    // Sync A -> B
    let transport_b_for_a = LocalTransport::new(db_b.clone(), Some(site_a.clone()));
    sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();

    // 2. Concurrent edits:
    // Device A updates position
    db_a.batch_update_positions(&[ElementPositionUpdate {
        id: el_id,
        x: 350.0,
        y: 450.0,
        width: 200.0,
        height: 150.0,
        z_index: 2,
    }]).unwrap();

    // Device B updates content
    db_b.update_element_content(&el_id, &json!({ "text": "Concurrent Text Edit" }), None).unwrap();

    // 3. Bidirectional Sync
    sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();
    let transport_a_for_b = LocalTransport::new(db_a.clone(), Some(site_b.clone()));
    sync_with_peer(&db_b, &transport_a_for_b, &site_a_hex, 100).await.unwrap();

    // 4. Verify deterministic merge of distinct columns
    let el_on_a = db_a.get_board_elements(&board_id).unwrap().into_iter().find(|e| e.id == el_id).unwrap();
    let el_on_b = db_b.get_board_elements(&board_id).unwrap().into_iter().find(|e| e.id == el_id).unwrap();

    assert_eq!(el_on_a.x, 350.0);
    assert_eq!(el_on_a.y, 450.0);
    assert_eq!(el_on_a.content, json!({ "text": "Concurrent Text Edit" }));

    assert_eq!(el_on_b.x, 350.0);
    assert_eq!(el_on_b.y, 450.0);
    assert_eq!(el_on_b.content, json!({ "text": "Concurrent Text Edit" }));
}

#[tokio::test]
async fn test_duplicate_page_delivery_is_noop() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let board_id = Uuid::new_v4();
    let board = create_test_board(board_id, "Test Dup");
    db_a.create_board(&board).unwrap();
    for i in 0..3 {
        let el = create_test_element(Uuid::new_v4(), board_id, &format!("Note {}", i), i as f64 * 50.0, 0.0);
        db_a.create_element(&el).unwrap();
    }

    let transport = LocalTransport::new(db_a.clone(), None);

    // Pull page 1
    let page = transport.pull(0, 100).await.unwrap();
    assert!(!page.changes.is_empty());

    // Apply once
    db_b.apply_changes(&page.changes).unwrap();
    let boards_1 = db_b.list_boards(None).unwrap();
    let els_1 = db_b.get_board_elements(&board_id).unwrap();
    assert_eq!(boards_1.len(), 1);
    assert_eq!(els_1.len(), 3);

    // Apply second time (duplicate delivery)
    db_b.apply_changes(&page.changes).unwrap();
    let boards_2 = db_b.list_boards(None).unwrap();
    let els_2 = db_b.get_board_elements(&board_id).unwrap();
    assert_eq!(boards_2.len(), 1);
    assert_eq!(els_2.len(), 3);
}

#[tokio::test]
async fn test_out_of_order_page_delivery_converges() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    // Three distinct transactions on A
    let b1 = create_test_board(Uuid::new_v4(), "First");
    db_a.create_board(&b1).unwrap();
    let b2 = create_test_board(Uuid::new_v4(), "Second");
    db_a.create_board(&b2).unwrap();
    let b3 = create_test_board(Uuid::new_v4(), "Third");
    db_a.create_board(&b3).unwrap();

    let changes = db_a.get_changes_since(0).unwrap();
    assert!(changes.len() >= 3);

    // Group changes by db_version
    let mut versions: Vec<i64> = changes.iter().map(|c| c.db_version).collect();
    versions.sort();
    versions.dedup();
    assert!(versions.len() >= 3);

    let batch_v1: Vec<CrChange> = changes.iter().filter(|c| c.db_version == versions[0]).cloned().collect();
    let batch_v2: Vec<CrChange> = changes.iter().filter(|c| c.db_version == versions[1]).cloned().collect();
    let batch_v3: Vec<CrChange> = changes.iter().filter(|c| c.db_version == versions[2]).cloned().collect();

    // Deliver out of order: v3, then v1, then v2
    db_b.apply_changes(&batch_v3).unwrap();
    db_b.apply_changes(&batch_v1).unwrap();
    db_b.apply_changes(&batch_v2).unwrap();

    // Verify convergence
    let boards = db_b.list_boards(None).unwrap();
    assert_eq!(boards.len(), 3);
}

#[tokio::test]
async fn test_no_echo_back_to_origin() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let site_a = db_a.get_site_id().unwrap();
    let site_b = db_b.get_site_id().unwrap();
    let _site_a_hex = hex::encode(&site_a);
    let site_b_hex = hex::encode(&site_b);

    // Device B creates an item
    let board_b = create_test_board(Uuid::new_v4(), "Originated on B");
    db_b.create_board(&board_b).unwrap();

    // A syncs with B: A pulls board-b-origin from B
    let transport_b_for_a = LocalTransport::new(db_b.clone(), Some(site_a.clone()));
    let stats_1 = sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();
    assert!(stats_1.rows_pulled > 0);
    assert_eq!(stats_1.rows_pushed, 0); // A had nothing to push

    // Now A syncs with B again: A must NOT push board-b-origin back to B
    let stats_2 = sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();
    assert_eq!(stats_2.rows_pulled, 0);
    assert_eq!(stats_2.rows_pushed, 0); // No echo!
}

#[tokio::test]
async fn test_three_device_relay() {
    let db_client_a = Arc::new(Database::open_in_memory().unwrap());
    let db_hub_b = Arc::new(Database::open_in_memory().unwrap());
    let db_client_c = Arc::new(Database::open_in_memory().unwrap());

    let site_a = db_client_a.get_site_id().unwrap();
    let site_b = db_hub_b.get_site_id().unwrap();
    let site_c = db_client_c.get_site_id().unwrap();

    let site_b_hex = hex::encode(&site_b);

    // Client A creates a board
    let board_id = Uuid::new_v4();
    let board_a = create_test_board(board_id, "Authored by A");
    db_client_a.create_board(&board_a).unwrap();

    // Step 1: Client A syncs to Hub B (push)
    let transport_hub_for_a = LocalTransport::new(db_hub_b.clone(), Some(site_a.clone()));
    let stats_a_to_b = sync_with_peer(&db_client_a, &transport_hub_for_a, &site_b_hex, 100).await.unwrap();
    assert!(stats_a_to_b.rows_pushed > 0);

    // Verify Hub B has the board
    assert_eq!(db_hub_b.get_board(&board_id).unwrap().id, board_id);

    // Step 2: Client C syncs with Hub B (pulls A's board from Hub B)
    let transport_hub_for_c = LocalTransport::new(db_hub_b.clone(), Some(site_c.clone()));
    let stats_c_to_b = sync_with_peer(&db_client_c, &transport_hub_for_c, &site_b_hex, 100).await.unwrap();
    assert!(stats_c_to_b.rows_pulled > 0);

    // Client C now has the board authored by A
    assert_eq!(db_client_c.get_board(&board_id).unwrap().id, board_id);

    // Step 3: Client C syncs with Hub B again -> C does NOT echo A's board back to Hub B
    let stats_c_repeat = sync_with_peer(&db_client_c, &transport_hub_for_c, &site_b_hex, 100).await.unwrap();
    assert_eq!(stats_c_repeat.rows_pushed, 0);
}

#[tokio::test]
async fn test_crash_simulation_rollback_and_resume() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let site_b = db_b.get_site_id().unwrap();
    let site_b_hex = hex::encode(&site_b);

    let board = create_test_board(Uuid::new_v4(), "Crash Test Board");
    db_a.create_board(&board).unwrap();

    // Initial cursor on B is 0
    let cursor_before = {
        let conn = db_b.conn();
        cursors::get_cursor(&conn, &site_b_hex, CursorDirection::Pull).unwrap()
    };
    assert_eq!(cursor_before, 0);

    // Simulate an aborted/failed transaction on B
    {
        let mut conn = db_b.conn();
        let tx = conn.transaction().unwrap();
        // Insert bogus or abort deliberately
        cursors::set_cursor(&tx, &site_b_hex, CursorDirection::Pull, 999).unwrap();
        // Rollback explicitly instead of committing
        drop(tx);
    }

    // Verify cursor did not commit
    let cursor_after_abort = {
        let conn = db_b.conn();
        cursors::get_cursor(&conn, &site_b_hex, CursorDirection::Pull).unwrap()
    };
    assert_eq!(cursor_after_abort, 0);

    // Now perform real sync -> succeeds and commits cursor
    let transport_a_for_b = LocalTransport::new(db_a.clone(), Some(site_b.clone()));
    let site_a = db_a.get_site_id().unwrap();
    let site_a_hex = hex::encode(&site_a);
    let stats = sync_with_peer(&db_b, &transport_a_for_b, &site_a_hex, 100).await.unwrap();
    assert!(stats.rows_pulled > 0);

    let cursor_final = {
        let conn = db_b.conn();
        cursors::get_cursor(&conn, &site_a_hex, CursorDirection::Pull).unwrap()
    };
    assert!(cursor_final > 0);
}

#[tokio::test]
async fn test_interrupted_sync_resumes_from_cursor() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let site_b = db_b.get_site_id().unwrap();
    let site_a = db_a.get_site_id().unwrap();
    let site_a_hex = hex::encode(&site_a);

    // Create 6 distinct boards in separate transactions
    for i in 1..=6 {
        let b = create_test_board(Uuid::new_v4(), &format!("Board {}", i));
        db_a.create_board(&b).unwrap();
    }

    let transport_a_for_b = LocalTransport::new(db_a.clone(), Some(site_b.clone()));

    // 1. Partial sync: fetch only 1 page with limit = 2
    let page1 = transport_a_for_b.pull(0, 2).await.unwrap();
    assert!(!page1.changes.is_empty());
    assert!(page1.has_more);

    // Apply page 1 and advance cursor on B
    {
        let mut conn = db_b.conn();
        let tx = conn.transaction().unwrap();
        apply_changes_conn(&tx, &page1.changes).unwrap();
        cursors::set_cursor(&tx, &site_a_hex, CursorDirection::Pull, page1.next_cursor).unwrap();
        tx.commit().unwrap();
    }

    let cursor_after_p1 = {
        let conn = db_b.conn();
        cursors::get_cursor(&conn, &site_a_hex, CursorDirection::Pull).unwrap()
    };
    assert_eq!(cursor_after_p1, page1.next_cursor);

    // 2. Resume sync with full coordinator loop: should pull remaining items starting from cursor
    let stats = sync_with_peer(&db_b, &transport_a_for_b, &site_a_hex, 2).await.unwrap();
    assert!(stats.rows_pulled > 0);

    // Verify all 6 boards now exist on B
    let boards = db_b.list_boards(None).unwrap();
    assert_eq!(boards.len(), 6);
}

#[tokio::test]
async fn test_delete_tombstone_propagation() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let site_a = db_a.get_site_id().unwrap();
    let site_b = db_b.get_site_id().unwrap();
    let _site_a_hex = hex::encode(&site_a);
    let site_b_hex = hex::encode(&site_b);

    // Initial creation
    let board_id = Uuid::new_v4();
    let board = create_test_board(board_id, "Tombstone Board");
    db_a.create_board(&board).unwrap();
    let el_id = Uuid::new_v4();
    let el = create_test_element(el_id, board_id, "To Be Deleted", 50.0, 50.0);
    db_a.create_element(&el).unwrap();

    let transport_b_for_a = LocalTransport::new(db_b.clone(), Some(site_a.clone()));
    sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();

    // Verify element on B
    assert_eq!(db_b.get_board_elements(&board_id).unwrap().len(), 1);

    // A deletes element
    db_a.delete_element(&el_id).unwrap();
    assert_eq!(db_a.get_board_elements(&board_id).unwrap().len(), 0);

    // Sync A -> B
    sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();

    // Element must be deleted on B as well
    assert_eq!(db_b.get_board_elements(&board_id).unwrap().len(), 0);

    // Re-create a new element
    let el2_id = Uuid::new_v4();
    let el2 = create_test_element(el2_id, board_id, "Brand New Note", 100.0, 100.0);
    db_a.create_element(&el2).unwrap();
    sync_with_peer(&db_a, &transport_b_for_a, &site_b_hex, 100).await.unwrap();

    let b_elements = db_b.get_board_elements(&board_id).unwrap();
    assert_eq!(b_elements.len(), 1);
    assert_eq!(b_elements[0].id, el2_id);
}

#[tokio::test]
async fn test_new_device_bootstraps_with_since_zero() {
    let db_old = Arc::new(Database::open_in_memory().unwrap());
    let db_new = Arc::new(Database::open_in_memory().unwrap());

    // Populate old device with rich data
    let root_id = Uuid::new_v4();
    let board1 = create_test_board(root_id, "Root Board");
    db_old.create_board(&board1).unwrap();

    let child_id = Uuid::new_v4();
    let board2 = Board {
        id: child_id,
        parent_board_id: Some(root_id),
        title: "Child Board".to_string(),
        color_theme: Some("blue".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db_old.create_board(&board2).unwrap();

    let el1 = create_test_element(Uuid::new_v4(), root_id, "Task card", 0.0, 0.0);
    db_old.create_element(&el1).unwrap();
    let el2 = create_test_element(Uuid::new_v4(), child_id, "Notes inside child", 100.0, 200.0);
    db_old.create_element(&el2).unwrap();

    let site_old = db_old.get_site_id().unwrap();
    let site_new = db_new.get_site_id().unwrap();
    let site_old_hex = hex::encode(&site_old);

    // New device has 0 boards and 0 elements
    assert_eq!(db_new.list_boards(None).unwrap().len(), 0);

    // New device syncs from old device starting with empty cursors (since = 0)
    let transport_old = LocalTransport::new(db_old.clone(), Some(site_new.clone()));
    let stats = sync_with_peer(&db_new, &transport_old, &site_old_hex, 100).await.unwrap();

    assert!(stats.rows_pulled > 0);
    // list_boards(None) lists root boards; let's check root board and all boards
    let root_boards = db_new.list_boards(None).unwrap();
    assert_eq!(root_boards.len(), 1);
    assert_eq!(root_boards[0].id, root_id);

    let child_boards = db_new.list_boards(Some(&root_id)).unwrap();
    assert_eq!(child_boards.len(), 1);
    assert_eq!(child_boards[0].id, child_id);

    assert_eq!(db_new.get_board_elements(&root_id).unwrap().len(), 1);
    assert_eq!(db_new.get_board_elements(&child_id).unwrap().len(), 1);
}

#[tokio::test]
async fn test_protocol_and_schema_version_mismatches_rejected() {
    let db_a = Arc::new(Database::open_in_memory().unwrap());
    let db_b = Arc::new(Database::open_in_memory().unwrap());

    let site_b = db_b.get_site_id().unwrap();
    let site_b_hex = hex::encode(&site_b);

    // 1. Protocol mismatch
    let transport_mismatch_proto = LocalTransport::new(db_b.clone(), None)
        .with_protocol_version(99);

    let err = sync_with_peer(&db_a, &transport_mismatch_proto, &site_b_hex, 100).await.unwrap_err();
    assert!(err.to_string().contains("Protocol mismatch"));

    // 2. Schema mismatch
    let transport_mismatch_schema = LocalTransport::new(db_b.clone(), None)
        .with_schema_version(99);

    let err2 = sync_with_peer(&db_a, &transport_mismatch_schema, &site_b_hex, 100).await.unwrap_err();
    assert!(err2.to_string().contains("Schema mismatch"));
}
