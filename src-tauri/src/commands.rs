use milanote_core::{
    Board, BoardTreeNode, Database, Element, ElementPositionUpdate, SearchResult,
};
use uuid::Uuid;
use tauri::State;

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
    Ok(board)
}

#[tauri::command]
pub async fn get_board_elements(state: State<'_, Database>, board_id: Uuid) -> Result<Vec<Element>, String> {
    state.get_board_elements(&board_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_element_positions(
    state: State<'_, Database>,
    updates: Vec<ElementPositionUpdate>,
) -> Result<(), String> {
    state.batch_update_positions(&updates).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_element(state: State<'_, Database>, element: Element) -> Result<(), String> {
    state.create_element(&element).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_element_content(state: State<'_, Database>, id: Uuid, content: serde_json::Value) -> Result<(), String> {
    let elem = state.get_element(&id).map_err(|e| e.to_string())?;
    state.update_element_content(&id, &content, elem.style.as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_element_style(state: State<'_, Database>, id: Uuid, style: Option<serde_json::Value>) -> Result<(), String> {
    state.update_element_style(&id, style.as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_element_board_id(state: State<'_, Database>, id: Uuid, board_id: Uuid) -> Result<(), String> {
    state.update_element_board_id(&id, &board_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_element(state: State<'_, Database>, id: Uuid) -> Result<(), String> {
    state.delete_element(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_board_state(state: State<'_, Database>, board_id: Uuid, elements: Vec<Element>) -> Result<(), String> {
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
                id: el.id, x: el.x, y: el.y, width: el.width, height: el.height, z_index: el.z_index,
            });
            let _ = state.update_element_content(&el.id, &el.content, el.style.as_ref());
        } else {
            let _ = state.create_element(&el);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn search_boards(state: State<'_, Database>, query: String) -> Result<Vec<SearchResult>, String> {
    state.search_boards(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_board(
    state: State<'_, Database>,
    board_id: Uuid,
    new_title: Option<String>,
) -> Result<Board, String> {
    state.duplicate_board(&board_id, None, new_title.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    println!("Opening external URL in system browser: {}", url);
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/C", "start", &url]).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&url).spawn();
    Ok(())
}
