use std::fs;
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub label: String,
}

pub struct BackupManager;

fn parse_label_from_filename(filename: &str) -> String {
    // Expected format: gamenote_backup_<label>_<timestamp>.db
    if let Some(stripped) = filename.strip_prefix("gamenote_backup_") {
        if let Some(end_idx) = stripped.rfind('_') {
            return stripped[..end_idx].to_string();
        }
    }
    "manual".to_string()
}

impl BackupManager {
    /// Creates a hot, point-in-time consistent backup using SQLite's `VACUUM INTO`.
    /// The destination path is generated inside `backup_dir` as `gamenote_backup_<label>_<timestamp>.db`.
    pub fn create_backup(
        conn: &Connection,
        backup_dir: &Path,
        label: &str,
    ) -> Result<BackupInfo> {
        fs::create_dir_all(backup_dir)?;

        let now = Utc::now();
        let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
        let clean_label = label
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
            .collect::<String>();
        let filename = format!("gamenote_backup_{}_{}.db", clean_label, timestamp);
        let dest_path = backup_dir.join(&filename);

        if dest_path.exists() {
            let _ = fs::remove_file(&dest_path);
        }

        let path_str = dest_path.to_str().ok_or_else(|| {
            AppError::InvalidOperation("Invalid UTF-8 in backup destination path".into())
        })?;

        // SQLite VACUUM INTO safely creates an atomic snapshot without locking writes
        conn.execute("VACUUM INTO ?1", rusqlite::params![path_str])
            .map_err(AppError::Db)?;

        let metadata = fs::metadata(&dest_path)?;
        let size_bytes = metadata.len();

        Ok(BackupInfo {
            filename,
            path: path_str.to_string(),
            size_bytes,
            created_at: now.to_rfc3339(),
            label: label.to_string(),
        })
    }

    /// Lists all backup files in `backup_dir` sorted newest to oldest.
    pub fn list_backups(backup_dir: &Path) -> Result<Vec<BackupInfo>> {
        if !backup_dir.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        for entry in fs::read_dir(backup_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("db") {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("gamenote_backup_") {
                        let meta = entry.metadata()?;
                        let created_at: DateTime<Utc> = meta.modified()?.into();
                        let label = parse_label_from_filename(name);
                        backups.push(BackupInfo {
                            filename: name.to_string(),
                            path: path.to_string_lossy().to_string(),
                            size_bytes: meta.len(),
                            created_at: created_at.to_rfc3339(),
                            label,
                        });
                    }
                }
            }
        }

        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(backups)
    }

    /// Rotates backups in `backup_dir`, keeping `max_daily` recent daily backups and `max_monthly` older monthly backups.
    pub fn rotate_backups(
        backup_dir: &Path,
        max_daily: usize,
        max_monthly: usize,
    ) -> Result<usize> {
        let backups = Self::list_backups(backup_dir)?;
        if backups.is_empty() {
            return Ok(0);
        }

        let mut deleted_count = 0;
        let mut daily_kept = 0;
        let mut monthly_seen = std::collections::HashSet::new();

        for backup in backups {
            if daily_kept < max_daily {
                daily_kept += 1;
                continue;
            }

            let month_key = backup.created_at.chars().take(7).collect::<String>(); // "YYYY-MM"
            if monthly_seen.len() < max_monthly && !monthly_seen.contains(&month_key) {
                monthly_seen.insert(month_key);
                continue;
            }

            if fs::remove_file(&backup.path).is_ok() {
                deleted_count += 1;
            }
        }

        Ok(deleted_count)
    }

    /// Restores a backup file by safely copying it over the target db path.
    /// Creates a pre-restore safety copy first (`milanote.db.pre_restore_<timestamp>.bak`).
    pub fn restore_from_backup(backup_file: &Path, active_db_path: &Path) -> Result<PathBuf> {
        if !backup_file.exists() {
            return Err(AppError::NotFound(format!(
                "Backup file not found: {}",
                backup_file.display()
            )));
        }

        // Verify the backup file is a valid SQLite DB before touching active DB
        {
            let test_conn = Connection::open(backup_file)?;
            let _user_version: i64 = test_conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        }

        // Create safety backup of active db if it exists
        let mut pre_restore_path = PathBuf::new();
        if active_db_path.exists() {
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            pre_restore_path = active_db_path.with_extension(format!("pre_restore_{}.bak", timestamp));
            fs::copy(active_db_path, &pre_restore_path)?;

            // Remove existing WAL and SHM files to prevent WAL inconsistency with restored DB
            let wal = active_db_path.with_extension("db-wal");
            if wal.exists() {
                let _ = fs::remove_file(wal);
            }
            let shm = active_db_path.with_extension("db-shm");
            if shm.exists() {
                let _ = fs::remove_file(shm);
            }
        }

        fs::copy(backup_file, active_db_path)?;
        Ok(pre_restore_path)
    }

    /// Exports a live DB to a user-chosen destination path using `VACUUM INTO`.
    pub fn export_backup_to_path(conn: &Connection, target_file: &Path) -> Result<()> {
        if let Some(parent) = target_file.parent() {
            fs::create_dir_all(parent)?;
        }
        if target_file.exists() {
            fs::remove_file(target_file)?;
        }
        let target_str = target_file.to_str().ok_or_else(|| {
            AppError::InvalidOperation("Invalid UTF-8 in destination path".into())
        })?;
        conn.execute("VACUUM INTO ?1", rusqlite::params![target_str])
            .map_err(AppError::Db)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_create_and_list_backups() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("active.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT);
             INSERT INTO notes VALUES ('1', 'Test backup content');",
        )
        .unwrap();

        let backup_dir = temp_dir.path().join("backups");
        let info = BackupManager::create_backup(&conn, &backup_dir, "daily").unwrap();

        assert!(Path::new(&info.path).exists());
        assert!(info.size_bytes > 0);
        assert_eq!(info.label, "daily");

        // Verify backed-up database content
        let backup_conn = Connection::open(&info.path).unwrap();
        let text: String = backup_conn
            .query_row("SELECT text FROM notes WHERE id = '1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(text, "Test backup content");

        let list = BackupManager::list_backups(&backup_dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].filename, info.filename);
    }

    #[test]
    fn test_restore_from_backup() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("active.db");
        let backup_dir = temp_dir.path().join("backups");

        // Create initial state
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT);
             INSERT INTO notes VALUES ('1', 'Original note');",
        )
        .unwrap();

        // Create backup of initial state
        let backup_info = BackupManager::create_backup(&conn, &backup_dir, "pre_edit").unwrap();
        drop(conn);

        // Modify active database
        {
            let conn2 = Connection::open(&db_path).unwrap();
            conn2.execute("UPDATE notes SET text = 'Corrupted or deleted' WHERE id = '1'", []).unwrap();
        }

        // Restore from backup
        let safety_copy = BackupManager::restore_from_backup(
            Path::new(&backup_info.path),
            &db_path,
        )
        .unwrap();

        assert!(safety_copy.exists());

        // Verify active database restored to original
        let conn_restored = Connection::open(&db_path).unwrap();
        let restored_text: String = conn_restored
            .query_row("SELECT text FROM notes WHERE id = '1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(restored_text, "Original note");
    }

    #[test]
    fn test_rotate_backups() {
        let temp_dir = tempdir().unwrap();
        let backup_dir = temp_dir.path().join("backups");
        fs::create_dir_all(&backup_dir).unwrap();

        // Create 10 dummy backup files
        for i in 1..=10 {
            let filename = format!("gamenote_backup_daily_202610{:02}_120000.db", i);
            let dummy_path = backup_dir.join(filename);
            let conn = Connection::open(&dummy_path).unwrap();
            conn.execute_batch("CREATE TABLE t (x);").unwrap();
        }

        // Rotate keeping 7 daily, 1 monthly
        let deleted = BackupManager::rotate_backups(&backup_dir, 7, 1).unwrap();
        assert_eq!(deleted, 2); // 10 - 7 - 1 = 2 deleted

        let remaining = BackupManager::list_backups(&backup_dir).unwrap();
        assert_eq!(remaining.len(), 8);
    }
}
