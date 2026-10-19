use std::fs;
use std::path::{Path, PathBuf};
use directories::ProjectDirs;
use uuid::Uuid;

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
}
