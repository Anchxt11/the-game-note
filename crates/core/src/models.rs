use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Board {
    pub id: Uuid,
    pub parent_board_id: Option<Uuid>,
    pub title: String,
    pub color_theme: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ElementType {
    Note,
    Image,
    Link,
    File,
    TaskList,
    Column,
    Connector,
    NestedBoard,
    Comment,
    Table,
}

impl ElementType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Image => "image",
            Self::Link => "link",
            Self::File => "file",
            Self::TaskList => "task_list",
            Self::Column => "column",
            Self::Connector => "connector",
            Self::NestedBoard => "nested_board",
            Self::Comment => "comment",
            Self::Table => "table",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "note" => Some(Self::Note),
            "image" => Some(Self::Image),
            "link" => Some(Self::Link),
            "file" => Some(Self::File),
            "task_list" => Some(Self::TaskList),
            "column" => Some(Self::Column),
            "connector" => Some(Self::Connector),
            "nested_board" => Some(Self::NestedBoard),
            "comment" => Some(Self::Comment),
            "table" => Some(Self::Table),
            _ => None,
        }
    }
}

impl std::fmt::Display for ElementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Element {
    pub id: Uuid,
    pub board_id: Uuid,
    pub element_type: ElementType,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z_index: i32,
    pub content: JsonValue,
    pub style: Option<JsonValue>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskListItem {
    pub id: Uuid,
    pub element_id: Uuid,
    pub text: String,
    pub is_checked: bool,
    pub order_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Connector {
    pub id: Uuid,
    pub board_id: Uuid,
    pub from_element_id: Uuid,
    pub to_element_id: Uuid,
    pub style: Option<JsonValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardTreeNode {
    pub board: Board,
    pub children: Vec<BoardTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementPositionUpdate {
    pub id: Uuid,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SearchResult {
    pub entity_type: String,
    pub board_id: Uuid,
    pub element_id: Option<Uuid>,
    pub title_or_text: String,
    pub snippet: String,
}
