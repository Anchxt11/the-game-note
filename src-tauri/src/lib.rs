mod commands;

use milanote_core::{seed::seed_demo_data, Database, FileStorage};
use tauri::Manager;

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

            app.manage(db);
            app.manage(storage);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_boards,
            commands::get_board_tree,
            commands::create_board,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
