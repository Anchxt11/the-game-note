mod commands;

use milanote_core::{seed::seed_demo_data, Database};
use std::env;

fn main() {
    println!("Antigravity Milanote - Linux Native Desktop App");
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--seed" || arg == "seed") {
        println!("Initializing local database and populating seed demo board...");
        match Database::open_default() {
            Ok(db) => match seed_demo_data(&db) {
                Ok(board) => println!("Successfully seeded board '{}' (ID: {}) with demo elements!", board.title, board.id),
                Err(e) => eprintln!("Failed to seed demo data: {}", e),
            },
            Err(e) => eprintln!("Failed to open default database: {}", e),
        }
        return;
    }

    let db = match Database::open_default() {
        Ok(db) => db,
        Err(e) => {
            eprintln!("Fatal error opening database: {}", e);
            std::process::exit(1);
        }
    };

    // Ensure demo seed data exists if the board list is empty on startup
    if let Ok(boards) = db.list_boards(None) {
        if boards.is_empty() {
            println!("No boards found in local database. Generating default Welcome board...");
            let _ = seed_demo_data(&db);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            commands::list_boards,
            commands::get_board_tree,
            commands::create_board,
            commands::get_board_elements,
            commands::update_element_positions,
            commands::create_element,
            commands::delete_element,
            commands::search_boards,
            commands::duplicate_board,
            commands::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
