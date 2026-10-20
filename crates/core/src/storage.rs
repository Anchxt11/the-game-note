use std::fs;
use std::path::{Path, PathBuf};
use base64::prelude::*;
use directories::ProjectDirs;
use rusqlite::{params, Connection};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::crypto::compute_file_id;
use crate::error::{AppError, Result};

#[derive(Debug, Clone)]
pub struct FileStorage {
    root_dir: PathBuf,
}

impl FileStorage {
    /// Opens the file storage at the default desktop location using `directories::ProjectDirs`.
    ///
    /// NOTE: Do not call this on mobile/Android as `ProjectDirs` cannot resolve the
    /// application directory. Mobile/Tauri hosts should resolve the directory via Tauri's
    /// path API (`app.path().app_data_dir()`) and call [`FileStorage::open_dir`] instead.
    pub fn open_default() -> Result<Self> {
        let proj_dirs = ProjectDirs::from("com", "anchit", "gameNote")
            .ok_or_else(|| AppError::InvalidOperation("Failed to determine project data directory".into()))?;
        let root_dir = proj_dirs.data_dir().join("files");
        fs::create_dir_all(&root_dir)?;
        Ok(Self { root_dir })
    }

    pub fn open_dir<P: AsRef<Path>>(dir: P) -> Result<Self> {
        let root_dir = dir.as_ref().to_path_buf();
        fs::create_dir_all(&root_dir)?;
        Ok(Self { root_dir })
    }

    pub fn import_file<P: AsRef<Path>>(&self, source_path: P) -> Result<String> {
        let source_path = source_path.as_ref();
        if !source_path.exists() {
            return Err(AppError::NotFound(format!(
                "Source file not found: {}",
                source_path.display()
            )));
        }

        let extension = source_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("bin");
        let unique_filename = format!("{}.{}", Uuid::new_v4(), extension);
        let dest_path = self.root_dir.join(&unique_filename);

        fs::copy(source_path, &dest_path)?;
        Ok(unique_filename)
    }

    pub fn save_bytes(&self, bytes: &[u8], extension: &str) -> Result<String> {
        let unique_filename = format!("{}.{}", Uuid::new_v4(), extension);
        let dest_path = self.root_dir.join(&unique_filename);
        fs::write(&dest_path, bytes)?;
        Ok(unique_filename)
    }

    pub fn root_dir(&self) -> &Path {
        &self.root_dir
    }

    pub fn get_file_path(&self, filename: &str) -> PathBuf {
        self.root_dir.join(filename)
    }

    pub fn delete_file(&self, filename: &str) -> Result<()> {
        let path = self.root_dir.join(filename);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    /// Checks if a file with the given file ID exists in storage.
    pub fn has_file(&self, file_id: &str) -> bool {
        if !is_valid_file_id(file_id) {
            return false;
        }
        self.root_dir.join(file_id).exists()
    }

    /// Stores raw bytes under a content-addressed `file_id`.
    /// Writes atomically to a temporary file in root_dir then renames it.
    pub fn store_file(&self, file_id: &str, bytes: &[u8]) -> Result<()> {
        if !is_valid_file_id(file_id) {
            return Err(AppError::InvalidOperation(format!(
                "Invalid file ID format: {}",
                file_id
            )));
        }
        let dest_path = self.root_dir.join(file_id);
        if dest_path.exists() {
            return Ok(()); // Already stored and immutable
        }
        let temp_filename = format!("{}.tmp.{}", file_id, Uuid::new_v4());
        let temp_path = self.root_dir.join(&temp_filename);
        fs::write(&temp_path, bytes)?;
        fs::rename(&temp_path, &dest_path)?;
        Ok(())
    }

    /// Reads all bytes for a given `file_id`.
    pub fn read_file(&self, file_id: &str) -> Result<Vec<u8>> {
        if !is_valid_file_id(file_id) {
            return Err(AppError::InvalidOperation(format!(
                "Invalid file ID format: {}",
                file_id
            )));
        }
        let path = self.root_dir.join(file_id);
        if !path.exists() {
            return Err(AppError::NotFound(format!("File not found: {}", file_id)));
        }
        let bytes = fs::read(path)?;
        Ok(bytes)
    }

    /// Lists all 64-hex content-addressed file IDs currently in storage.
    pub fn list_content_addressed_files(&self) -> Result<Vec<String>> {
        let mut ids = Vec::new();
        if self.root_dir.exists() {
            for entry in fs::read_dir(&self.root_dir)? {
                let entry = entry?;
                if let Some(name) = entry.file_name().to_str() {
                    if is_valid_file_id(name) {
                        ids.push(name.to_string());
                    }
                }
            }
        }
        Ok(ids)
    }
}

/// Migrates any inline base64 image data URLs in the elements table to external
/// content-addressed files, drastically reducing SQLite database and changeset bloat.
pub fn migrate_embedded_images(
    conn: &Connection,
    storage: &FileStorage,
    file_key: &[u8; 32],
) -> Result<usize> {
    let mut stmt = conn.prepare(
        "SELECT id, content FROM elements WHERE content LIKE '%data:image/%'"
    )?;

    struct ElementToMigrate {
        id: String,
        content: String,
    }

    let rows = stmt.query_map([], |row| {
        Ok(ElementToMigrate {
            id: row.get(0)?,
            content: row.get(1)?,
        })
    })?;

    let mut elements_to_update = Vec::new();

    for item in rows {
        let item = item?;
        if let Ok(mut json) = serde_json::from_str::<JsonValue>(&item.content) {
            let data_url = json.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
            if data_url.starts_with("data:image/") {
                if let Some(comma_pos) = data_url.find(',') {
                    let header = &data_url[..comma_pos];
                    let b64_payload = &data_url[comma_pos + 1..];
                    let mime_type = header
                        .strip_prefix("data:")
                        .and_then(|h| h.split(';').next())
                        .unwrap_or("image/png")
                        .to_string();

                    if let Ok(raw_bytes) = BASE64_STANDARD.decode(b64_payload.trim()) {
                        let file_id = compute_file_id(file_key, &raw_bytes);
                        let _ = storage.store_file(&file_id, &raw_bytes);

                        if let Some(obj) = json.as_object_mut() {
                            obj.insert("file_id".to_string(), serde_json::json!(file_id));
                            obj.insert("mime_type".to_string(), serde_json::json!(mime_type));
                            obj.insert("url".to_string(), serde_json::json!(""));
                            elements_to_update.push((item.id, json.to_string()));
                        }
                    }
                }
            }
        }
    }

    drop(stmt);

    let count = elements_to_update.len();
    if count > 0 {
        let now = chrono::Utc::now().to_rfc3339();
        let mut update_stmt = conn.prepare("UPDATE elements SET content = ?1, updated_at = ?2 WHERE id = ?3")?;
        for (id, content_str) in elements_to_update {
            update_stmt.execute(params![content_str, now, id])?;
        }
    }

    Ok(count)
}

/// Validates that a file ID matches strict 64-character lowercase hex (SHA-256 / HMAC-SHA256).
pub fn is_valid_file_id(id: &str) -> bool {
    id.len() == 64 && id.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_content_addressed_storage() {
        let temp_dir = tempdir().unwrap();
        let storage = FileStorage::open_dir(temp_dir.path()).unwrap();

        let valid_id = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert!(!storage.has_file(valid_id));

        let data = b"Sample image binary bytes";
        storage.store_file(valid_id, data).unwrap();

        assert!(storage.has_file(valid_id));
        let read_back = storage.read_file(valid_id).unwrap();
        assert_eq!(read_back, data);

        let files = storage.list_content_addressed_files().unwrap();
        assert_eq!(files, vec![valid_id.to_string()]);

        // Invalid IDs are rejected
        assert!(!storage.has_file("bad_id"));
        assert!(storage.store_file("bad_id", data).is_err());
        assert!(storage.read_file("bad_id").is_err());
    }

    #[test]
    fn test_migrate_embedded_images() {
        let temp_dir = tempdir().unwrap();
        let storage = FileStorage::open_dir(temp_dir.path().join("files")).unwrap();
        let conn = Connection::open_in_memory().unwrap();

        conn.execute_batch(
            "CREATE TABLE elements (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
        )
        .unwrap();

        let sample_raw = b"Image PNG Data";
        let sample_b64 = BASE64_STANDARD.encode(sample_raw);
        let sample_data_url = format!("data:image/png;base64,{}", sample_b64);

        let initial_content = serde_json::json!({
            "url": sample_data_url,
            "caption": "Photo caption"
        })
        .to_string();

        conn.execute(
            "INSERT INTO elements VALUES ('el-1', ?1, '2026-10-20T00:00:00Z')",
            params![initial_content],
        )
        .unwrap();

        let file_key = [7u8; 32];
        let migrated = migrate_embedded_images(&conn, &storage, &file_key).unwrap();
        assert_eq!(migrated, 1);

        // Verify element updated
        let updated_content: String = conn
            .query_row("SELECT content FROM elements WHERE id = 'el-1'", [], |r| r.get(0))
            .unwrap();
        let parsed: JsonValue = serde_json::from_str(&updated_content).unwrap();

        let fid = parsed["file_id"].as_str().unwrap();
        assert_eq!(fid.len(), 64);
        assert_eq!(parsed["url"].as_str().unwrap(), "");
        assert_eq!(parsed["mime_type"].as_str().unwrap(), "image/png");
        assert_eq!(parsed["caption"].as_str().unwrap(), "Photo caption");

        // Verify file was written to storage
        assert!(storage.has_file(fid));
        let stored_bytes = storage.read_file(fid).unwrap();
        assert_eq!(stored_bytes, sample_raw);
    }
}
