use chrono::Utc;
use milanote_core::db::Database;
use milanote_core::fractional_index::generate_key_between;
use milanote_core::models::{Board, Element, ElementPositionUpdate, ElementType, TaskListItem};
use serde_json::json;
use uuid::Uuid;

fn helper_sync_all(db1: &Database, db2: &Database, v1: i64, v2: i64) -> (i64, i64) {
    let c1 = db1.get_changes_since(v1).expect("get changes db1");
    let c2 = db2.get_changes_since(v2).expect("get changes db2");

    db2.apply_changes(&c1).expect("apply c1 to db2");
    db1.apply_changes(&c2).expect("apply c2 to db1");

    let new_v1 = db1.get_db_version().expect("v1");
    let new_v2 = db2.get_db_version().expect("v2");
    (new_v1, new_v2)
}

#[test]
fn test_sync_independent_inserts_merge() {
    let db1 = Database::open_in_memory().unwrap();
    let db2 = Database::open_in_memory().unwrap();

    let root_board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Shared Canvas".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_board(&root_board).unwrap();

    // Initial sync
    let (v1, v2) = helper_sync_all(&db1, &db2, 0, 0);

    // db1 inserts note 1
    let note1 = Element {
        id: Uuid::new_v4(),
        board_id: root_board.id,
        element_type: ElementType::Note,
        x: 100.0,
        y: 100.0,
        width: 200.0,
        height: 150.0,
        z_index: 1,
        content: json!({"text": "Created on db1"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_element(&note1).unwrap();

    // db2 inserts note 2
    let note2 = Element {
        id: Uuid::new_v4(),
        board_id: root_board.id,
        element_type: ElementType::Note,
        x: 400.0,
        y: 100.0,
        width: 200.0,
        height: 150.0,
        z_index: 2,
        content: json!({"text": "Created on db2"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db2.create_element(&note2).unwrap();

    // Sync between peers
    helper_sync_all(&db1, &db2, v1, v2);

    // Both databases must now have both note1 and note2
    let db1_elems = db1.get_board_elements(&root_board.id).unwrap();
    let db2_elems = db2.get_board_elements(&root_board.id).unwrap();

    assert_eq!(db1_elems.len(), 2);
    assert_eq!(db2_elems.len(), 2);

    assert!(db1.get_element(&note1.id).is_ok());
    assert!(db1.get_element(&note2.id).is_ok());
    assert!(db2.get_element(&note1.id).is_ok());
    assert!(db2.get_element(&note2.id).is_ok());
}

#[test]
fn test_sync_concurrent_different_columns_update() {
    let db1 = Database::open_in_memory().unwrap();
    let db2 = Database::open_in_memory().unwrap();

    let root_board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Shared Canvas".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_board(&root_board).unwrap();

    let elem = Element {
        id: Uuid::new_v4(),
        board_id: root_board.id,
        element_type: ElementType::Note,
        x: 50.0,
        y: 50.0,
        width: 200.0,
        height: 150.0,
        z_index: 1,
        content: json!({"text": "Initial text"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_element(&elem).unwrap();

    // Initial sync
    let (v1, v2) = helper_sync_all(&db1, &db2, 0, 0);

    // db1 moves the element: updates x, y, width, height, z_index
    let pos_update = ElementPositionUpdate {
        id: elem.id,
        x: 350.0,
        y: 420.0,
        width: 280.0,
        height: 200.0,
        z_index: 5,
    };
    db1.update_element_position(&pos_update).unwrap();

    // db2 updates the content text
    let new_content = json!({"text": "Updated text from db2"});
    db2.update_element_content(&elem.id, &new_content, None).unwrap();

    // Sync
    helper_sync_all(&db1, &db2, v1, v2);

    // Both databases should have both updates: moved coordinates AND updated text
    let elem_in_db1 = db1.get_element(&elem.id).unwrap();
    let elem_in_db2 = db2.get_element(&elem.id).unwrap();

    assert_eq!(elem_in_db1.x, 350.0);
    assert_eq!(elem_in_db1.y, 420.0);
    assert_eq!(elem_in_db1.content, new_content);

    assert_eq!(elem_in_db2.x, 350.0);
    assert_eq!(elem_in_db2.y, 420.0);
    assert_eq!(elem_in_db2.content, new_content);
}

#[test]
fn test_sync_same_column_lww_resolution() {
    let db1 = Database::open_in_memory().unwrap();
    let db2 = Database::open_in_memory().unwrap();

    let root_board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Initial Title".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_board(&root_board).unwrap();

    let (v1, v2) = helper_sync_all(&db1, &db2, 0, 0);

    // Both update the same column `title` concurrently
    db1.update_board(&root_board.id, Some("Title from db1"), None, None).unwrap();
    db2.update_board(&root_board.id, Some("Title from db2"), None, None).unwrap();

    helper_sync_all(&db1, &db2, v1, v2);

    let b1 = db1.get_board(&root_board.id).unwrap();
    let b2 = db2.get_board(&root_board.id).unwrap();

    // Both must converge deterministically to the same title
    assert_eq!(b1.title, b2.title);
    assert!(b1.title == "Title from db1" || b1.title == "Title from db2");
}

#[test]
fn test_sync_delete_wins_over_update() {
    let db1 = Database::open_in_memory().unwrap();
    let db2 = Database::open_in_memory().unwrap();

    let root_board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Canvas".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_board(&root_board).unwrap();

    let note = Element {
        id: Uuid::new_v4(),
        board_id: root_board.id,
        element_type: ElementType::Note,
        x: 100.0,
        y: 100.0,
        width: 200.0,
        height: 150.0,
        z_index: 1,
        content: json!({"text": "Will be deleted"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_element(&note).unwrap();

    let (v1, v2) = helper_sync_all(&db1, &db2, 0, 0);

    // db1 deletes the element
    db1.delete_element(&note.id).unwrap();

    // db2 updates the deleted element concurrently
    db2.update_element_content(&note.id, &json!({"text": "Concurrent edit"}), None).unwrap();

    helper_sync_all(&db1, &db2, v1, v2);

    // In cr-sqlite CRDT, deletion causal length increment wins
    assert!(db1.get_element(&note.id).is_err(), "Must be deleted on db1");
    assert!(db2.get_element(&note.id).is_err(), "Must be deleted on db2");
}

#[test]
fn test_sync_fractional_indexing_merge() {
    let db1 = Database::open_in_memory().unwrap();
    let db2 = Database::open_in_memory().unwrap();

    let root_board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Task Board".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_board(&root_board).unwrap();

    let task_list = Element {
        id: Uuid::new_v4(),
        board_id: root_board.id,
        element_type: ElementType::TaskList,
        x: 50.0,
        y: 50.0,
        width: 300.0,
        height: 400.0,
        z_index: 1,
        content: json!({"title": "Checklist"}),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_element(&task_list).unwrap();

    // Initial items: A ("a0"), B ("a1"), C ("a2")
    let item_a = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list.id,
        text: "Item A".to_string(),
        is_checked: false,
        order_index: "a0".to_string(),
    };
    let item_b = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list.id,
        text: "Item B".to_string(),
        is_checked: false,
        order_index: "a1".to_string(),
    };
    let item_c = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list.id,
        text: "Item C".to_string(),
        is_checked: false,
        order_index: "a2".to_string(),
    };
    db1.add_task_item(&item_a).unwrap();
    db1.add_task_item(&item_b).unwrap();
    db1.add_task_item(&item_c).unwrap();

    let (v1, v2) = helper_sync_all(&db1, &db2, 0, 0);

    // db1 inserts D between A ("a0") and B ("a1")
    let key_d = generate_key_between(Some("a0"), Some("a1")).unwrap();
    let item_d = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list.id,
        text: "Item D (between A and B)".to_string(),
        is_checked: false,
        order_index: key_d,
    };
    db1.add_task_item(&item_d).unwrap();

    // db2 inserts E between B ("a1") and C ("a2")
    let key_e = generate_key_between(Some("a1"), Some("a2")).unwrap();
    let item_e = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list.id,
        text: "Item E (between B and C)".to_string(),
        is_checked: false,
        order_index: key_e,
    };
    db2.add_task_item(&item_e).unwrap();

    // Merge
    helper_sync_all(&db1, &db2, v1, v2);

    let db1_tasks = db1.get_task_items(&task_list.id).unwrap();
    let db2_tasks = db2.get_task_items(&task_list.id).unwrap();

    assert_eq!(db1_tasks.len(), 5);
    assert_eq!(db2_tasks.len(), 5);

    // Verify ordering is A, D, B, E, C on both
    let texts1: Vec<String> = db1_tasks.iter().map(|t| t.text.clone()).collect();
    let texts2: Vec<String> = db2_tasks.iter().map(|t| t.text.clone()).collect();

    let expected = vec![
        "Item A".to_string(),
        "Item D (between A and B)".to_string(),
        "Item B".to_string(),
        "Item E (between B and C)".to_string(),
        "Item C".to_string(),
    ];

    assert_eq!(texts1, expected);
    assert_eq!(texts2, expected);
}

#[test]
fn test_sync_board_hierarchy_merge() {
    let db1 = Database::open_in_memory().unwrap();
    let db2 = Database::open_in_memory().unwrap();

    let root_board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Root Board".to_string(),
        color_theme: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_board(&root_board).unwrap();

    let (v1, v2) = helper_sync_all(&db1, &db2, 0, 0);

    // db1 creates sub-board 1
    let sub1 = Board {
        id: Uuid::new_v4(),
        parent_board_id: Some(root_board.id),
        title: "Sub Board 1 from db1".to_string(),
        color_theme: Some("ocean".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db1.create_board(&sub1).unwrap();

    // db2 creates sub-board 2
    let sub2 = Board {
        id: Uuid::new_v4(),
        parent_board_id: Some(root_board.id),
        title: "Sub Board 2 from db2".to_string(),
        color_theme: Some("forest".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db2.create_board(&sub2).unwrap();

    helper_sync_all(&db1, &db2, v1, v2);

    let tree1 = db1.get_board_tree().unwrap();
    let tree2 = db2.get_board_tree().unwrap();

    assert_eq!(tree1.len(), 1);
    assert_eq!(tree2.len(), 1);

    // Under root, both sub1 and sub2 exist
    assert_eq!(tree1[0].children.len(), 2);
    assert_eq!(tree2[0].children.len(), 2);

    let titles1: Vec<String> = tree1[0].children.iter().map(|c| c.board.title.clone()).collect();
    let titles2: Vec<String> = tree2[0].children.iter().map(|c| c.board.title.clone()).collect();

    assert!(titles1.contains(&"Sub Board 1 from db1".to_string()));
    assert!(titles1.contains(&"Sub Board 2 from db2".to_string()));
    assert_eq!(titles1, titles2);
}
