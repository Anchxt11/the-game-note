use std::sync::{Arc, Mutex};
use chrono::Utc;
use directories::ProjectDirs;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{
    Board, BoardTreeNode, Connector, Element, ElementPositionUpdate, ElementType, SearchResult,
    TaskListItem,
};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

pub fn find_crsqlite_path() -> std::path::PathBuf {
    #[cfg(target_os = "android")]
    {
        return std::path::PathBuf::from("libcrsqlite.so");
    }

    #[cfg(not(target_os = "android"))]
    {
        if let Ok(path_str) = std::env::var("CRSQLITE_PATH") {
            let p = std::path::PathBuf::from(path_str);
            if p.exists() {
                return p;
            }
        }

        let arch = if cfg!(target_arch = "aarch64") {
            "arm64-v8a"
        } else {
            "x86_64"
        };

        // Relative to compile-time manifest dir (cargo tests and development)
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let manifest_p1 = std::path::Path::new(manifest_dir)
            .join("libs")
            .join(arch)
            .join("libcrsqlite.so");
        if manifest_p1.exists() {
            return manifest_p1;
        }
        let manifest_p2 = std::path::Path::new(manifest_dir)
            .join("libs")
            .join(arch)
            .join("crsqlite.so");
        if manifest_p2.exists() {
            return manifest_p2;
        }

        // Executable parent directory
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let p1 = parent.join("libcrsqlite.so");
                if p1.exists() {
                    return p1;
                }
                let p2 = parent.join("crsqlite.so");
                if p2.exists() {
                    return p2;
                }
            }
        }

        // Relative to current working dir
        let cwd_p1 = std::path::Path::new("crates/core/libs")
            .join(arch)
            .join("libcrsqlite.so");
        if cwd_p1.exists() {
            return cwd_p1;
        }

        std::path::PathBuf::from("libcrsqlite.so")
    }
}

pub fn load_crsqlite(conn: &Connection) -> Result<()> {
    let path = find_crsqlite_path();
    let _guard = unsafe { rusqlite::LoadExtensionGuard::new(conn)? };
    unsafe {
        conn.load_extension(&path, Some("sqlite3_crsqlite_init"))?;
    }
    Ok(())
}

fn needs_schema_migration(conn: &Connection) -> Result<bool> {
    for table in &["boards", "elements", "task_list_items", "connectors"] {
        let table_exists: bool = conn.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
            params![table],
            |r| Ok(r.get::<_, i64>(0)? > 0),
        )?;
        if table_exists {
            let fk_count: i64 = conn.query_row(
                &format!("SELECT count(*) FROM pragma_foreign_key_list('{}')", table),
                [],
                |r| r.get(0),
            )?;
            if fk_count > 0 {
                return Ok(true);
            }

            let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
            let mut id_notnull = false;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                let notnull: i32 = row.get(3)?;
                let dflt_value: Option<String> = row.get(4)?;
                let pk: i32 = row.get(5)?;
                if name == "id" {
                    id_notnull = notnull == 1;
                }
                if notnull == 1 && dflt_value.is_none() && pk == 0 {
                    return Ok(true);
                }
                if *table == "task_list_items" && name == "order_index" {
                    let col_type: String = row.get(2)?;
                    if col_type.to_uppercase().contains("INT") {
                        return Ok(true);
                    }
                }
            }
            if !id_notnull {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn migrate_legacy_tables(conn: &Connection) -> Result<()> {
    conn.execute("PRAGMA foreign_keys = OFF;", [])?;

    // 1. Boards
    let boards_exists: bool = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='boards'",
        [],
        |r| Ok(r.get::<_, i64>(0)? > 0),
    )?;
    if boards_exists {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS boards_v2 (
                id TEXT NOT NULL PRIMARY KEY,
                parent_board_id TEXT,
                title TEXT NOT NULL DEFAULT '',
                color_theme TEXT,
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );
            INSERT OR IGNORE INTO boards_v2 SELECT id, parent_board_id, title, color_theme, created_at, updated_at FROM boards;
            DROP TABLE boards;
            ALTER TABLE boards_v2 RENAME TO boards;
            CREATE INDEX IF NOT EXISTS idx_boards_parent ON boards(parent_board_id);
            "#,
        )?;
    }

    // 2. Elements
    let elements_exists: bool = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='elements'",
        [],
        |r| Ok(r.get::<_, i64>(0)? > 0),
    )?;
    if elements_exists {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS elements_v2 (
                id TEXT NOT NULL PRIMARY KEY,
                board_id TEXT NOT NULL DEFAULT '',
                element_type TEXT NOT NULL DEFAULT 'note',
                x REAL NOT NULL DEFAULT 0,
                y REAL NOT NULL DEFAULT 0,
                width REAL NOT NULL DEFAULT 0,
                height REAL NOT NULL DEFAULT 0,
                z_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL DEFAULT '{}',
                style TEXT,
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );
            INSERT OR IGNORE INTO elements_v2 SELECT id, board_id, element_type, x, y, width, height, z_index, content, style, created_at, updated_at FROM elements;
            DROP TABLE elements;
            ALTER TABLE elements_v2 RENAME TO elements;
            CREATE INDEX IF NOT EXISTS idx_elements_board ON elements(board_id);
            "#,
        )?;
    }

    // 3. Task List Items
    let tasks_exists: bool = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='task_list_items'",
        [],
        |r| Ok(r.get::<_, i64>(0)? > 0),
    )?;
    if tasks_exists {
        let mut stmt = conn.prepare("SELECT id, element_id, text, is_checked, order_index FROM task_list_items ORDER BY element_id, order_index ASC")?;
        struct OldTask {
            id: String,
            element_id: String,
            text: String,
            is_checked: i32,
        }
        let rows = stmt.query_map([], |row| {
            Ok(OldTask {
                id: row.get(0)?,
                element_id: row.get(1)?,
                text: row.get(2)?,
                is_checked: row.get(3)?,
            })
        })?;

        let mut old_tasks_by_element: std::collections::HashMap<String, Vec<OldTask>> = std::collections::HashMap::new();
        for r in rows {
            let task = r?;
            old_tasks_by_element.entry(task.element_id.clone()).or_default().push(task);
        }

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS task_list_items_v2 (
                id TEXT NOT NULL PRIMARY KEY,
                element_id TEXT NOT NULL DEFAULT '',
                text TEXT NOT NULL DEFAULT '',
                is_checked INTEGER NOT NULL DEFAULT 0,
                order_index TEXT NOT NULL DEFAULT 'a0'
            );
            "#,
        )?;

        let mut insert_stmt = conn.prepare(
            "INSERT INTO task_list_items_v2 (id, element_id, text, is_checked, order_index) VALUES (?1, ?2, ?3, ?4, ?5)"
        )?;

        for (_el_id, tasks) in old_tasks_by_element {
            let count = tasks.len();
            let keys = crate::fractional_index::generate_n_keys_between(None, None, count)
                .unwrap_or_else(|_| (0..count).map(|i| format!("a{}", i)).collect());
            for (idx, task) in tasks.into_iter().enumerate() {
                let frac_key = keys.get(idx).cloned().unwrap_or_else(|| format!("a{}", idx));
                insert_stmt.execute(params![task.id, task.element_id, task.text, task.is_checked, frac_key])?;
            }
        }

        conn.execute_batch(
            r#"
            DROP TABLE task_list_items;
            ALTER TABLE task_list_items_v2 RENAME TO task_list_items;
            CREATE INDEX IF NOT EXISTS idx_tasks_element ON task_list_items(element_id, order_index);
            "#,
        )?;
    }

    // 4. Connectors
    let connectors_exists: bool = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='connectors'",
        [],
        |r| Ok(r.get::<_, i64>(0)? > 0),
    )?;
    if connectors_exists {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS connectors_v2 (
                id TEXT NOT NULL PRIMARY KEY,
                board_id TEXT NOT NULL DEFAULT '',
                from_element_id TEXT NOT NULL DEFAULT '',
                to_element_id TEXT NOT NULL DEFAULT '',
                style TEXT
            );
            INSERT OR IGNORE INTO connectors_v2 SELECT id, board_id, from_element_id, to_element_id, style FROM connectors;
            DROP TABLE connectors;
            ALTER TABLE connectors_v2 RENAME TO connectors;
            CREATE INDEX IF NOT EXISTS idx_connectors_board ON connectors(board_id);
            "#,
        )?;
    }

    conn.execute("PRAGMA foreign_keys = ON;", [])?;
    Ok(())
}

impl Database {
    /// Opens the database at the default desktop location using `directories::ProjectDirs`.
    ///
    /// NOTE: Do not call this on mobile/Android as `ProjectDirs` cannot resolve the
    /// application directory. Mobile/Tauri hosts should resolve the directory via Tauri's
    /// path API (`app.path().app_data_dir()`) and call [`Database::open_path`] instead.
    pub fn open_default() -> Result<Self> {
        let proj_dirs = ProjectDirs::from("com", "anchit", "gameNote")
            .ok_or_else(|| AppError::InvalidOperation("Failed to determine project data directory".into()))?;
        
        let data_dir = proj_dirs.data_dir();
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("milanote.db");
        Self::open_path(db_path)
    }

    pub fn open_path<P: AsRef<std::path::Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        load_crsqlite(&conn)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        load_crsqlite(&conn)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        if needs_schema_migration(&conn)? {
            migrate_legacy_tables(&conn)?;
        }
        
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS boards (
                id TEXT NOT NULL PRIMARY KEY,
                parent_board_id TEXT,
                title TEXT NOT NULL DEFAULT '',
                color_theme TEXT,
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_boards_parent ON boards(parent_board_id);

            CREATE TABLE IF NOT EXISTS elements (
                id TEXT NOT NULL PRIMARY KEY,
                board_id TEXT NOT NULL DEFAULT '',
                element_type TEXT NOT NULL DEFAULT 'note',
                x REAL NOT NULL DEFAULT 0,
                y REAL NOT NULL DEFAULT 0,
                width REAL NOT NULL DEFAULT 0,
                height REAL NOT NULL DEFAULT 0,
                z_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL DEFAULT '{}',
                style TEXT,
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_elements_board ON elements(board_id);

            CREATE TABLE IF NOT EXISTS task_list_items (
                id TEXT NOT NULL PRIMARY KEY,
                element_id TEXT NOT NULL DEFAULT '',
                text TEXT NOT NULL DEFAULT '',
                is_checked INTEGER NOT NULL DEFAULT 0,
                order_index TEXT NOT NULL DEFAULT 'a0'
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_element ON task_list_items(element_id, order_index);

            CREATE TABLE IF NOT EXISTS connectors (
                id TEXT NOT NULL PRIMARY KEY,
                board_id TEXT NOT NULL DEFAULT '',
                from_element_id TEXT NOT NULL DEFAULT '',
                to_element_id TEXT NOT NULL DEFAULT '',
                style TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_connectors_board ON connectors(board_id);
            "#,
        )?;

        // Register core tables as Conflict-Free Replicated Relations (CRRs).
        // crsql_as_crr is idempotent and safe to execute on existing CRR tables.
        conn.execute_batch(
            r#"
            SELECT crsql_as_crr('boards');
            SELECT crsql_as_crr('elements');
            SELECT crsql_as_crr('task_list_items');
            SELECT crsql_as_crr('connectors');
            "#,
        )?;

        crate::sync::cursors::init_cursor_tables(&conn)?;

        // Ensure legacy root boards default to 'Home' across all platforms
        let _ = conn.execute(
            "UPDATE boards SET title = 'Home' WHERE (parent_board_id IS NULL OR parent_board_id = '') AND (title = 'Welcome to Antigravity Board' OR title = '' OR title IS NULL)",
            [],
        );

        // Migrate any elements from old seed board (00000000-0000-0000-0000-000000000001) to canonical root board (37da11b3-458d-489d-904d-d5f83b0d1380)
        let canonical_root_id = uuid::Uuid::from_u128(0x37da11b3458d489d904dd5f83b0d1380);
        let legacy_seed_id = uuid::Uuid::from_u128(1);
        let canonical_root_str = canonical_root_id.to_string();
        let legacy_seed_str = legacy_seed_id.to_string();
        let _ = conn.execute(
            "UPDATE elements SET board_id = ?1 WHERE board_id = ?2 OR board_id = ?3",
            rusqlite::params![canonical_root_id, legacy_seed_id, legacy_seed_str],
        );
        let _ = conn.execute(
            "UPDATE elements SET board_id = ?1 WHERE board_id = ?2",
            rusqlite::params![canonical_root_str, legacy_seed_str],
        );
        let _ = conn.execute(
            "DELETE FROM boards WHERE id = ?1 OR id = ?2",
            rusqlite::params![legacy_seed_id, legacy_seed_str],
        );

        Ok(())
    }

    // --- Board Operations ---

    pub fn create_board(&self, board: &Board) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO boards (id, parent_board_id, title, color_theme, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                board.id,
                board.parent_board_id,
                board.title,
                board.color_theme,
                board.created_at,
                board.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_board(&self, id: &Uuid) -> Result<Board> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, parent_board_id, title, color_theme, created_at, updated_at
             FROM boards WHERE id = ?1 OR id = ?2",
        )?;
        let id_str = id.to_string();
        let board = stmt
            .query_row(params![id, id_str], |row| {
                Ok(Board {
                    id: row.get(0)?,
                    parent_board_id: row.get(1)?,
                    title: row.get(2)?,
                    color_theme: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Board not found: {}", id)))?;
        Ok(board)
    }

    pub fn list_boards(&self, parent_board_id: Option<&Uuid>) -> Result<Vec<Board>> {
        let conn = self.conn.lock().unwrap();
        let mut boards = Vec::new();
        if let Some(parent_id) = parent_board_id {
            let mut stmt = conn.prepare(
                "SELECT id, parent_board_id, title, color_theme, created_at, updated_at
                 FROM boards WHERE parent_board_id = ?1 OR parent_board_id = ?2 ORDER BY title ASC",
            )?;
            let parent_id_str = parent_id.to_string();
            let rows = stmt.query_map(params![parent_id, parent_id_str], Self::map_board_row)?;
            for b in rows {
                boards.push(b?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, parent_board_id, title, color_theme, created_at, updated_at
                 FROM boards WHERE parent_board_id IS NULL OR parent_board_id = '' ORDER BY title ASC",
            )?;
            let rows = stmt.query_map([], Self::map_board_row)?;
            for b in rows {
                boards.push(b?);
            }
        }
        Ok(boards)
    }

    pub fn get_board_tree(&self) -> Result<Vec<BoardTreeNode>> {
        let root_boards = self.list_boards(None)?;
        let mut tree = Vec::new();
        for board in root_boards {
            let node = self.build_tree_node(board)?;
            tree.push(node);
        }
        Ok(tree)
    }

    fn build_tree_node(&self, board: Board) -> Result<BoardTreeNode> {
        let child_boards = self.list_boards(Some(&board.id))?;
        let mut children = Vec::new();
        for child in child_boards {
            children.push(self.build_tree_node(child)?);
        }
        Ok(BoardTreeNode { board, children })
    }

    pub fn update_board(
        &self,
        id: &Uuid,
        title: Option<&str>,
        color_theme: Option<Option<&str>>,
        parent_board_id: Option<Option<&Uuid>>,
    ) -> Result<Board> {
        let mut board = self.get_board(id)?;
        if let Some(t) = title {
            board.title = t.to_string();
        }
        if let Some(ct) = color_theme {
            board.color_theme = ct.map(|s| s.to_string());
        }
        if let Some(pid) = parent_board_id {
            board.parent_board_id = pid.copied();
        }
        board.updated_at = Utc::now();

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE boards SET title = ?1, color_theme = ?2, parent_board_id = ?3, updated_at = ?4 WHERE id = ?5",
            params![board.title, board.color_theme, board.parent_board_id, board.updated_at, board.id],
        )?;
        Ok(board)
    }

    pub fn delete_board(&self, id: &Uuid) -> Result<()> {
        let id_str = id.to_string();
        let child_ids: Vec<Uuid> = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id FROM boards WHERE parent_board_id = ?1 OR parent_board_id = ?2")?;
            let rows = stmt.query_map(params![id, id_str], |r| r.get(0))?;
            let mut ids = Vec::new();
            for r in rows {
                ids.push(r?);
            }
            ids
        };
        for child_id in child_ids {
            self.delete_board(&child_id)?;
        }

        let elem_ids: Vec<Uuid> = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id FROM elements WHERE board_id = ?1 OR board_id = ?2")?;
            let rows = stmt.query_map(params![id, id_str], |r| r.get(0))?;
            let mut ids = Vec::new();
            for r in rows {
                ids.push(r?);
            }
            ids
        };
        for elem_id in elem_ids {
            self.delete_element(&elem_id)?;
        }

        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM connectors WHERE board_id = ?1 OR board_id = ?2", params![id, id_str])?;
        let rows_affected = conn.execute("DELETE FROM boards WHERE id = ?1 OR id = ?2", params![id, id_str])?;
        if rows_affected == 0 {
            return Err(AppError::NotFound(format!("Board not found: {}", id)));
        }
        Ok(())
    }

    pub fn duplicate_board(
        &self,
        id: &Uuid,
        new_parent_id: Option<Uuid>,
        new_title: Option<&str>,
    ) -> Result<Board> {
        let orig_board = self.get_board(id)?;
        let new_board = Board {
            id: Uuid::new_v4(),
            parent_board_id: new_parent_id.or(orig_board.parent_board_id),
            title: new_title
                .map(|t| t.to_string())
                .unwrap_or_else(|| format!("Copy of {}", orig_board.title)),
            color_theme: orig_board.color_theme.clone(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        self.create_board(&new_board)?;

        let mut elem_id_map = std::collections::HashMap::new();
        let elements = self.get_board_elements(&orig_board.id)?;
        for mut elem in elements {
            let old_id = elem.id;
            let new_id = Uuid::new_v4();
            elem.id = new_id;
            elem.board_id = new_board.id;
            elem.created_at = Utc::now();
            elem.updated_at = Utc::now();
            self.create_element(&elem)?;
            elem_id_map.insert(old_id, new_id);

            let tasks = self.get_task_items(&old_id)?;
            for mut t in tasks {
                t.id = Uuid::new_v4();
                t.element_id = new_id;
                self.add_task_item(&t)?;
            }
        }

        let connectors = self.get_board_connectors(&orig_board.id)?;
        for mut c in connectors {
            if let (Some(&new_from), Some(&new_to)) = (
                elem_id_map.get(&c.from_element_id),
                elem_id_map.get(&c.to_element_id),
            ) {
                c.id = Uuid::new_v4();
                c.board_id = new_board.id;
                c.from_element_id = new_from;
                c.to_element_id = new_to;
                self.create_connector(&c)?;
            }
        }

        let child_boards = self.list_boards(Some(&orig_board.id))?;
        for child in child_boards {
            self.duplicate_board(&child.id, Some(new_board.id), None)?;
        }

        Ok(new_board)
    }

    // --- Element Operations ---

    pub fn create_element(&self, element: &Element) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO elements (id, board_id, element_type, x, y, width, height, z_index, content, style, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                element.id,
                element.board_id,
                element.element_type.as_str(),
                element.x,
                element.y,
                element.width,
                element.height,
                element.z_index,
                element.content,
                element.style,
                element.created_at,
                element.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_element(&self, id: &Uuid) -> Result<Element> {
        let conn = self.conn.lock().unwrap();
        let id_str = id.to_string();
        let mut stmt = conn.prepare(
            "SELECT id, board_id, element_type, x, y, width, height, z_index, content, style, created_at, updated_at
             FROM elements WHERE id = ?1 OR id = ?2",
        )?;
        let element = stmt
            .query_row(params![id, id_str], Self::map_element_row)
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Element not found: {}", id)))?;
        Ok(element)
    }

    pub fn get_board_elements(&self, board_id: &Uuid) -> Result<Vec<Element>> {
        let conn = self.conn.lock().unwrap();
        let board_id_str = board_id.to_string();
        let mut stmt = conn.prepare(
            "SELECT id, board_id, element_type, x, y, width, height, z_index, content, style, created_at, updated_at
             FROM elements WHERE board_id = ?1 OR board_id = ?2 ORDER BY z_index ASC",
        )?;
        let rows = stmt.query_map(params![board_id, board_id_str], Self::map_element_row)?;
        let mut elements = Vec::new();
        for el in rows {
            elements.push(el?);
        }
        Ok(elements)
    }

    pub fn update_element_position(&self, update: &ElementPositionUpdate) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now();
        let id_str = update.id.to_string();
        conn.execute(
            "UPDATE elements SET x = ?1, y = ?2, width = ?3, height = ?4, z_index = ?5, updated_at = ?6 WHERE id = ?7 OR id = ?8",
            params![update.x, update.y, update.width, update.height, update.z_index, now, update.id, id_str],
        )?;
        Ok(())
    }

    pub fn batch_update_positions(&self, updates: &[ElementPositionUpdate]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let now = Utc::now();
        for update in updates {
            let id_str = update.id.to_string();
            tx.execute(
                "UPDATE elements SET x = ?1, y = ?2, width = ?3, height = ?4, z_index = ?5, updated_at = ?6 WHERE id = ?7 OR id = ?8",
                params![update.x, update.y, update.width, update.height, update.z_index, now, update.id, id_str],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn update_element_content(
        &self,
        id: &Uuid,
        content: &JsonValue,
        style: Option<&JsonValue>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now();
        let id_str = id.to_string();
        conn.execute(
            "UPDATE elements SET content = ?1, style = ?2, updated_at = ?3 WHERE id = ?4 OR id = ?5",
            params![content, style, now, id, id_str],
        )?;
        Ok(())
    }

    pub fn update_element_style(
        &self,
        id: &Uuid,
        style: Option<&JsonValue>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now();
        let id_str = id.to_string();
        conn.execute(
            "UPDATE elements SET style = ?1, updated_at = ?2 WHERE id = ?3 OR id = ?4",
            params![style, now, id, id_str],
        )?;
        Ok(())
    }

    pub fn update_element_board_id(
        &self,
        id: &Uuid,
        board_id: &Uuid,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now();
        let id_str = id.to_string();
        conn.execute(
            "UPDATE elements SET board_id = ?1, updated_at = ?2 WHERE id = ?3 OR id = ?4",
            params![board_id, now, id, id_str],
        )?;
        Ok(())
    }

    pub fn delete_element(&self, id: &Uuid) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let id_str = id.to_string();
        conn.execute("DELETE FROM task_list_items WHERE element_id = ?1 OR element_id = ?2", params![id, id_str])?;
        conn.execute("DELETE FROM connectors WHERE from_element_id = ?1 OR from_element_id = ?2 OR to_element_id = ?1 OR to_element_id = ?2", params![id, id_str])?;
        let affected = conn.execute("DELETE FROM elements WHERE id = ?1 OR id = ?2", params![id, id_str])?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("Element not found: {}", id)));
        }
        Ok(())
    }

    pub fn duplicate_element(
        &self,
        id: &Uuid,
        target_board_id: Option<Uuid>,
        offset_xy: (f64, f64),
    ) -> Result<Element> {
        let mut elem = self.get_element(id)?;
        let old_id = elem.id;
        elem.id = Uuid::new_v4();
        if let Some(target_id) = target_board_id {
            elem.board_id = target_id;
        }
        elem.x += offset_xy.0;
        elem.y += offset_xy.1;
        elem.created_at = Utc::now();
        elem.updated_at = Utc::now();
        self.create_element(&elem)?;

        let tasks = self.get_task_items(&old_id)?;
        for mut t in tasks {
            t.id = Uuid::new_v4();
            t.element_id = elem.id;
            self.add_task_item(&t)?;
        }

        Ok(elem)
    }

    // --- TaskListItem Operations ---

    pub fn add_task_item(&self, item: &TaskListItem) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO task_list_items (id, element_id, text, is_checked, order_index)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                item.id,
                item.element_id,
                item.text,
                if item.is_checked { 1 } else { 0 },
                item.order_index,
            ],
        )?;
        Ok(())
    }

    pub fn get_task_items(&self, element_id: &Uuid) -> Result<Vec<TaskListItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, element_id, text, is_checked, order_index
             FROM task_list_items WHERE element_id = ?1 ORDER BY order_index ASC",
        )?;
        let rows = stmt.query_map(params![element_id], |row| {
            Ok(TaskListItem {
                id: row.get(0)?,
                element_id: row.get(1)?,
                text: row.get(2)?,
                is_checked: row.get::<_, i32>(3)? == 1,
                order_index: row.get(4)?,
            })
        })?;
        let mut items = Vec::new();
        for item in rows {
            items.push(item?);
        }
        Ok(items)
    }

    pub fn toggle_task_item(&self, id: &Uuid, is_checked: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE task_list_items SET is_checked = ?1 WHERE id = ?2",
            params![if is_checked { 1 } else { 0 }, id],
        )?;
        Ok(())
    }

    pub fn update_task_item_text(&self, id: &Uuid, text: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE task_list_items SET text = ?1 WHERE id = ?2",
            params![text, id],
        )?;
        Ok(())
    }

    pub fn delete_task_item(&self, id: &Uuid) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM task_list_items WHERE id = ?1", params![id])?;
        Ok(())
    }

    // --- Connector Operations ---

    pub fn create_connector(&self, connector: &Connector) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO connectors (id, board_id, from_element_id, to_element_id, style)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                connector.id,
                connector.board_id,
                connector.from_element_id,
                connector.to_element_id,
                connector.style,
            ],
        )?;
        Ok(())
    }

    pub fn get_board_connectors(&self, board_id: &Uuid) -> Result<Vec<Connector>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, board_id, from_element_id, to_element_id, style
             FROM connectors WHERE board_id = ?1",
        )?;
        let rows = stmt.query_map(params![board_id], |row| {
            Ok(Connector {
                id: row.get(0)?,
                board_id: row.get(1)?,
                from_element_id: row.get(2)?,
                to_element_id: row.get(3)?,
                style: row.get(4)?,
            })
        })?;
        let mut connectors = Vec::new();
        for c in rows {
            connectors.push(c?);
        }
        Ok(connectors)
    }

    pub fn delete_connector(&self, id: &Uuid) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM connectors WHERE id = ?1", params![id])?;
        Ok(())
    }

    // --- Search ---

    pub fn search_boards(&self, query: &str) -> Result<Vec<SearchResult>> {
        let pattern = format!("%{}%", query);
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT 'board' AS entity_type, id AS board_id, NULL AS element_id, title AS title_or_text
             FROM boards WHERE title LIKE ?1 COLLATE NOCASE
             UNION ALL
             SELECT 'note' AS entity_type, board_id, id AS element_id, content AS title_or_text
             FROM elements WHERE element_type = 'note' AND content LIKE ?1 COLLATE NOCASE
             UNION ALL
             SELECT 'task_item' AS entity_type, e.board_id, t.element_id, t.text AS title_or_text
             FROM task_list_items t
             JOIN elements e ON t.element_id = e.id
             WHERE t.text LIKE ?1 COLLATE NOCASE
             LIMIT 50",
        )?;

        let rows = stmt.query_map(params![pattern], |row| {
            let entity_type: String = row.get(0)?;
            let board_id: Uuid = row.get(1)?;
            let element_id: Option<Uuid> = row.get(2)?;
            let title_or_text: String = row.get(3)?;
            let snippet = if entity_type == "note" {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&title_or_text) {
                    json_val.get("text").and_then(|v| v.as_str()).unwrap_or(&title_or_text).to_string()
                } else {
                    title_or_text.clone()
                }
            } else {
                title_or_text.clone()
            };

            Ok(SearchResult {
                entity_type,
                board_id,
                element_id,
                title_or_text,
                snippet,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    // --- Helper mapping functions ---

    fn map_board_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Board> {
        Ok(Board {
            id: row.get(0)?,
            parent_board_id: row.get(1)?,
            title: row.get(2)?,
            color_theme: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }

    fn map_element_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Element> {
        let et_str: String = row.get(2)?;
        let element_type = ElementType::from_str(&et_str).unwrap_or(ElementType::Note);
        Ok(Element {
            id: row.get(0)?,
            board_id: row.get(1)?,
            element_type,
            x: row.get(3)?,
            y: row.get(4)?,
            width: row.get(5)?,
            height: row.get(6)?,
            z_index: row.get(7)?,
            content: row.get(8)?,
            style: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }

    // --- Sync Operations ---

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }

    pub fn get_changes_since(&self, since_version: i64) -> Result<Vec<crate::sync::CrChange>> {
        let conn = self.conn.lock().unwrap();
        crate::sync::get_changes_since(&conn, since_version)
    }

    pub fn apply_changes(&self, changes: &[crate::sync::CrChange]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        crate::sync::apply_changes(&conn, changes)
    }

    pub fn get_db_version(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        crate::sync::get_db_version(&conn)
    }

    pub fn get_site_id(&self) -> Result<Vec<u8>> {
        let conn = self.conn.lock().unwrap();
        crate::sync::get_site_id(&conn)
    }
}

