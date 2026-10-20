use chrono::Utc;
use milanote_core::db::Database;
use milanote_core::models::{Board, Element, ElementPositionUpdate, ElementType, TaskListItem};
use milanote_core::seed::seed_demo_data;
use serde_json::json;
use uuid::Uuid;

#[test]
fn test_board_crud() {
    let db = Database::open_in_memory().expect("Failed to create in-memory db");

    let board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Test Board".to_string(),
        color_theme: Some("dark".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_board(&board).expect("Create board");

    let fetched = db.get_board(&board.id).expect("Get board");
    assert_eq!(fetched.title, "Test Board");
    assert_eq!(fetched.color_theme.as_deref(), Some("dark"));

    let updated = db
        .update_board(&board.id, Some("Updated Title"), None, None)
        .expect("Update board");
    assert_eq!(updated.title, "Updated Title");

    let list = db.list_boards(None).expect("List roots");
    assert_eq!(list.len(), 1);

    db.delete_board(&board.id).expect("Delete board");
    assert!(db.get_board(&board.id).is_err());
}

#[test]
fn test_board_hierarchy_and_cascade_delete() {
    let db = Database::open_in_memory().expect("In-memory db");

    let root = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Root".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_board(&root).unwrap();

    let child = Board {
        id: Uuid::new_v4(),
        parent_board_id: Some(root.id),
        title: "Child".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_board(&child).unwrap();

    let tree = db.get_board_tree().unwrap();
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].children.len(), 1);
    assert_eq!(tree[0].children[0].board.title, "Child");

    // Deleting root should cascade delete child
    db.delete_board(&root.id).unwrap();
    assert!(db.get_board(&child.id).is_err());
}

#[test]
fn test_element_crud_and_batch_position() {
    let db = Database::open_in_memory().unwrap();
    let board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Element Board".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_board(&board).unwrap();

    let elem1 = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::Note,
        x: 10.0,
        y: 20.0,
        width: 200.0,
        height: 150.0,
        z_index: 1,
        content: json!({"text": "Hello note"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    let elem2 = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::Image,
        x: 300.0,
        y: 20.0,
        width: 300.0,
        height: 200.0,
        z_index: 2,
        content: json!({"path": "test.png"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&elem1).unwrap();
    db.create_element(&elem2).unwrap();

    let elems = db.get_board_elements(&board.id).unwrap();
    assert_eq!(elems.len(), 2);

    let updates = vec![
        ElementPositionUpdate {
            id: elem1.id,
            x: 50.0,
            y: 50.0,
            width: 250.0,
            height: 180.0,
            z_index: 3,
        },
        ElementPositionUpdate {
            id: elem2.id,
            x: 350.0,
            y: 50.0,
            width: 300.0,
            height: 200.0,
            z_index: 4,
        },
    ];
    db.batch_update_positions(&updates).unwrap();

    let updated_elem1 = db.get_element(&elem1.id).unwrap();
    assert_eq!(updated_elem1.x, 50.0);
    assert_eq!(updated_elem1.z_index, 3);
}

#[test]
fn test_board_duplication() {
    let db = Database::open_in_memory().unwrap();
    let root = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Original Board".to_string(),
        color_theme: Some("vibrant".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_board(&root).unwrap();

    let task_elem = Element {
        id: Uuid::new_v4(),
        board_id: root.id,
        element_type: ElementType::TaskList,
        x: 100.0,
        y: 100.0,
        width: 250.0,
        height: 200.0,
        z_index: 1,
        content: json!({"title": "Checklist"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&task_elem).unwrap();

    let task_item = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_elem.id,
        text: "Task 1".to_string(),
        is_checked: true,
        order_index: "a0".to_string(),
    };
    db.add_task_item(&task_item).unwrap();

    let dup_board = db.duplicate_board(&root.id, None, Some("Cloned Board")).unwrap();
    assert_ne!(dup_board.id, root.id);
    assert_eq!(dup_board.title, "Cloned Board");

    let orig_elems = db.get_board_elements(&root.id).unwrap();
    let dup_elems = db.get_board_elements(&dup_board.id).unwrap();
    assert_eq!(orig_elems.len(), dup_elems.len());
    assert_ne!(orig_elems[0].id, dup_elems[0].id);

    let dup_tasks = db.get_task_items(&dup_elems[0].id).unwrap();
    assert_eq!(dup_tasks.len(), 1);
    assert_ne!(dup_tasks[0].id, task_item.id);
    assert_eq!(dup_tasks[0].text, "Task 1");
}

#[test]
fn test_seed_and_search() {
    let db = Database::open_in_memory().unwrap();
    let seed_board = seed_demo_data(&db).expect("Seed demo data");

    let elems = db.get_board_elements(&seed_board.id).unwrap();
    assert!(elems.len() >= 6, "Expected multiple element types seeded");

    let results = db.search_boards("infinite canvas").unwrap();
    assert!(!results.is_empty(), "Should find note containing 'infinite canvas'");

    let task_results = db.search_boards("rusqlite").unwrap();
    assert!(!task_results.is_empty(), "Should find task list item containing 'rusqlite'");
}

#[test]
fn test_embedded_crsqlite_extraction_and_load() {
    let temp_dir = tempfile::tempdir().expect("Create tempdir");
    let extracted_so = milanote_core::db::extract_embedded_crsqlite_to(temp_dir.path())
        .expect("Should extract embedded crsqlite to temp dir");

    assert!(extracted_so.exists(), "Extracted library file should exist");
    assert!(extracted_so.metadata().unwrap().len() > 1_000_000, "Extracted library should be valid size");

    let conn = rusqlite::Connection::open_in_memory().expect("Open SQLite conn");
    let _guard = unsafe { rusqlite::LoadExtensionGuard::new(&conn).expect("Extension guard") };
    unsafe {
        conn.load_extension(&extracted_so, Some("sqlite3_crsqlite_init"))
            .expect("Load extracted extension into SQLite");
    }

    let site_id_hex: String = conn
        .query_row("SELECT hex(crsql_site_id())", [], |r| r.get(0))
        .expect("Query crsql_site_id");
    assert!(!site_id_hex.is_empty(), "crsqlite site_id should be accessible from extracted extension");
}
