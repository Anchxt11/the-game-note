use chrono::Utc;
use serde_json::json;
use uuid::Uuid;

use crate::db::Database;
use crate::error::Result;
use crate::models::{Board, Connector, Element, ElementType, TaskListItem};

pub fn seed_demo_data(db: &Database) -> Result<Board> {
    // 1. Create root sample board
    let board = Board {
        id: Uuid::new_v4(),
        parent_board_id: None,
        title: "Welcome to Antigravity Board".to_string(),
        color_theme: Some("dark-cosmic".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_board(&board)?;

    // 2. Add Note Element
    let note = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::Note,
        x: 80.0,
        y: 80.0,
        width: 280.0,
        height: 180.0,
        z_index: 1,
        content: json!({
            "text": "Welcome to your native Linux infinite canvas! Arrange notes, images, to-dos, and sub-boards without any arbitrary V1 free tier limits.",
            "format": "markdown"
        }),
        style: Some(json!({
            "background_color": "#2c2838",
            "text_color": "#eaeaea",
            "border_radius": 8
        })),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&note)?;

    // 3. Add Image Element
    let image_element = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::Image,
        x: 400.0,
        y: 80.0,
        width: 320.0,
        height: 220.0,
        z_index: 2,
        content: json!({
            "path": "demo_cosmic_banner.png",
            "caption": "COSMIC desktop visual styling & native Rust performance"
        }),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&image_element)?;

    // 4. Add Link Card Element
    let link_card = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::Link,
        x: 80.0,
        y: 300.0,
        width: 280.0,
        height: 120.0,
        z_index: 3,
        content: json!({
            "url": "https://rust-lang.org",
            "title": "Rust Programming Language",
            "description": "A language empowering everyone to build reliable and efficient software.",
            "image": "https://www.rust-lang.org/static/images/rust-social-wide.jpg",
            "site_name": "Rust"
        }),
        style: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&link_card)?;

    // 5. Add Task List Element with Checklist Items
    let task_list_el = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::TaskList,
        x: 400.0,
        y: 340.0,
        width: 300.0,
        height: 240.0,
        z_index: 4,
        content: json!({
            "title": "V1 Backend Checklist"
        }),
        style: Some(json!({ "background_color": "#1e2229" })),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&task_list_el)?;

    let task1 = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list_el.id,
        text: "Initialize Rust architecture & rusqlite data layer".to_string(),
        is_checked: true,
        order_index: 0,
    };
    let task2 = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list_el.id,
        text: "Implement recursive board duplicating and FTS5 search".to_string(),
        is_checked: true,
        order_index: 1,
    };
    let task3 = TaskListItem {
        id: Uuid::new_v4(),
        element_id: task_list_el.id,
        text: "Build Tauri IPC commands for Phase 2 webview frontend".to_string(),
        is_checked: false,
        order_index: 2,
    };
    db.add_task_item(&task1)?;
    db.add_task_item(&task2)?;
    db.add_task_item(&task3)?;

    // 6. Add Column Element
    let col_element = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::Column,
        x: 760.0,
        y: 80.0,
        width: 260.0,
        height: 500.0,
        z_index: 5,
        content: json!({
            "title": "Inspirations Column"
        }),
        style: Some(json!({ "background_color": "#16181d" })),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&col_element)?;

    // 7. Add Nested Sub-Board & Sub-Board Element
    let sub_board = Board {
        id: Uuid::new_v4(),
        parent_board_id: Some(board.id),
        title: "Architecture & Wireframes Sub-Board".to_string(),
        color_theme: Some("light-minimal".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_board(&sub_board)?;

    let sub_board_el = Element {
        id: Uuid::new_v4(),
        board_id: board.id,
        element_type: ElementType::NestedBoard,
        x: 80.0,
        y: 460.0,
        width: 280.0,
        height: 100.0,
        z_index: 6,
        content: json!({
            "target_board_id": sub_board.id.to_string(),
            "preview_title": sub_board.title
        }),
        style: Some(json!({ "border_color": "#e05a47" })),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db.create_element(&sub_board_el)?;

    // 8. Add Arrow/Connector between Note and TaskList
    let connector = Connector {
        id: Uuid::new_v4(),
        board_id: board.id,
        from_element_id: note.id,
        to_element_id: task_list_el.id,
        style: Some(json!({
            "line_style": "dashed",
            "color": "#ffb86c",
            "start_arrow": false,
            "end_arrow": true
        })),
    };
    db.create_connector(&connector)?;

    Ok(board)
}
