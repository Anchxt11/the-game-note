use std::sync::Mutex;
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

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open_default() -> Result<Self> {
        let proj_dirs = ProjectDirs::from("com", "antigravity", "milanote")
            .ok_or_else(|| AppError::InvalidOperation("Failed to determine project data directory".into()))?;
        
        let data_dir = proj_dirs.data_dir();
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("milanote.db");
        Self::open_path(db_path)
    }

    pub fn open_path<P: AsRef<std::path::Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                parent_board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                color_theme TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_boards_parent ON boards(parent_board_id);

            CREATE TABLE IF NOT EXISTS elements (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                element_type TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                z_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                style TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_elements_board ON elements(board_id);

            CREATE TABLE IF NOT EXISTS task_list_items (
                id TEXT PRIMARY KEY,
                element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                is_checked INTEGER NOT NULL DEFAULT 0,
                order_index INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_element ON task_list_items(element_id, order_index);

            CREATE TABLE IF NOT EXISTS connectors (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                from_element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
                to_element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
                style TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_connectors_board ON connectors(board_id);
            "#,
        )?;

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
             FROM boards WHERE id = ?1",
        )?;
        let board = stmt
            .query_row(params![id], |row| {
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
                 FROM boards WHERE parent_board_id = ?1 ORDER BY title ASC",
            )?;
            let rows = stmt.query_map(params![parent_id], Self::map_board_row)?;
            for b in rows {
                boards.push(b?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, parent_board_id, title, color_theme, created_at, updated_at
                 FROM boards WHERE parent_board_id IS NULL ORDER BY title ASC",
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
        let conn = self.conn.lock().unwrap();
        let rows_affected = conn.execute("DELETE FROM boards WHERE id = ?1", params![id])?;
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
        let mut stmt = conn.prepare(
            "SELECT id, board_id, element_type, x, y, width, height, z_index, content, style, created_at, updated_at
             FROM elements WHERE id = ?1",
        )?;
        let element = stmt
            .query_row(params![id], Self::map_element_row)
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Element not found: {}", id)))?;
        Ok(element)
    }

    pub fn get_board_elements(&self, board_id: &Uuid) -> Result<Vec<Element>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, board_id, element_type, x, y, width, height, z_index, content, style, created_at, updated_at
             FROM elements WHERE board_id = ?1 ORDER BY z_index ASC",
        )?;
        let rows = stmt.query_map(params![board_id], Self::map_element_row)?;
        let mut elements = Vec::new();
        for el in rows {
            elements.push(el?);
        }
        Ok(elements)
    }

    pub fn update_element_position(&self, update: &ElementPositionUpdate) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now();
        conn.execute(
            "UPDATE elements SET x = ?1, y = ?2, width = ?3, height = ?4, z_index = ?5, updated_at = ?6 WHERE id = ?7",
            params![update.x, update.y, update.width, update.height, update.z_index, now, update.id],
        )?;
        Ok(())
    }

    pub fn batch_update_positions(&self, updates: &[ElementPositionUpdate]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let now = Utc::now();
        for update in updates {
            tx.execute(
                "UPDATE elements SET x = ?1, y = ?2, width = ?3, height = ?4, z_index = ?5, updated_at = ?6 WHERE id = ?7",
                params![update.x, update.y, update.width, update.height, update.z_index, now, update.id],
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
        conn.execute(
            "UPDATE elements SET content = ?1, style = ?2, updated_at = ?3 WHERE id = ?4",
            params![content, style, now, id],
        )?;
        Ok(())
    }

    pub fn delete_element(&self, id: &Uuid) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let affected = conn.execute("DELETE FROM elements WHERE id = ?1", params![id])?;
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
}
