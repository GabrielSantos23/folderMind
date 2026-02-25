use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub folder_path: String,
    pub folder_name: String,
    pub file_count: i32,
    pub folder_count: i32,
    pub confidence: i32,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderRecord {
    pub id: i64,
    pub session_id: String,
    pub name: String,
    pub tag: String,
    pub file_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: i64,
    pub folder_id: i64,
    pub name: String,
    pub size: String,
    pub original_path: String,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_handle: &tauri::AppHandle) -> SqliteResult<Self> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data dir");
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = PathBuf::from(&app_dir).join("sessions.db");

        let conn = Connection::open(&db_path)?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.initialize()?;
        Ok(db)
    }

    fn initialize(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                folder_path TEXT NOT NULL,
                folder_name TEXT NOT NULL,
                file_count INTEGER DEFAULT 0,
                folder_count INTEGER DEFAULT 0,
                confidence INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                tag TEXT DEFAULT 'auto',
                file_count INTEGER DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                size TEXT DEFAULT '',
                original_path TEXT NOT NULL,
                FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_folders_session ON folders(session_id);
            CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
            "#,
        )?;

        Ok(())
    }

    pub fn create_session(&self, session: &SessionRecord) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (id, folder_path, folder_name, file_count, folder_count, confidence, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            [
                &session.id,
                &session.folder_path,
                &session.folder_name,
                &session.file_count.to_string(),
                &session.folder_count.to_string(),
                &session.confidence.to_string(),
                &session.status,
                &session.created_at,
                &session.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_session_status(&self, id: &str, status: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            [status, id],
        )?;
        Ok(())
    }

    pub fn update_session_stats(
        &self,
        id: &str,
        file_count: i32,
        folder_count: i32,
        confidence: i32,
    ) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET file_count = ?1, folder_count = ?2, confidence = ?3, status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
            [file_count.to_string(), folder_count.to_string(), confidence.to_string(), id.to_string()],
        )?;
        Ok(())
    }

    pub fn add_folder(
        &self,
        session_id: &str,
        name: &str,
        tag: &str,
        file_count: i32,
    ) -> SqliteResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO folders (session_id, name, tag, file_count) VALUES (?1, ?2, ?3, ?4)",
            [session_id, name, tag, &file_count.to_string()],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn add_file(
        &self,
        folder_id: i64,
        name: &str,
        size: &str,
        original_path: &str,
    ) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO files (folder_id, name, size, original_path) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![folder_id, name, size, original_path],
        )?;
        Ok(())
    }

    pub fn get_all_sessions(&self) -> SqliteResult<Vec<SessionRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, folder_path, folder_name, file_count, folder_count, confidence, status, created_at, updated_at 
             FROM sessions ORDER BY created_at DESC"
        )?;

        let sessions = stmt
            .query_map([], |row| {
                Ok(SessionRecord {
                    id: row.get(0)?,
                    folder_path: row.get(1)?,
                    folder_name: row.get(2)?,
                    file_count: row.get(3)?,
                    folder_count: row.get(4)?,
                    confidence: row.get(5)?,
                    status: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    pub fn get_session_by_id(&self, id: &str) -> SqliteResult<Option<SessionRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, folder_path, folder_name, file_count, folder_count, confidence, status, created_at, updated_at 
             FROM sessions WHERE id = ?1"
        )?;

        let mut sessions = stmt.query_map([id], |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                folder_path: row.get(1)?,
                folder_name: row.get(2)?,
                file_count: row.get(3)?,
                folder_count: row.get(4)?,
                confidence: row.get(5)?,
                status: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;

        Ok(sessions.next().transpose()?)
    }

    pub fn get_folders_by_session(&self, session_id: &str) -> SqliteResult<Vec<FolderRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, name, tag, file_count FROM folders WHERE session_id = ?1",
        )?;

        let folders = stmt
            .query_map([session_id], |row| {
                Ok(FolderRecord {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    name: row.get(2)?,
                    tag: row.get(3)?,
                    file_count: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(folders)
    }

    pub fn get_files_by_folder(&self, folder_id: i64) -> SqliteResult<Vec<FileRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, name, size, original_path FROM files WHERE folder_id = ?1",
        )?;

        let files = stmt
            .query_map([folder_id], |row| {
                Ok(FileRecord {
                    id: row.get(0)?,
                    folder_id: row.get(1)?,
                    name: row.get(2)?,
                    size: row.get(3)?,
                    original_path: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(files)
    }

    pub fn delete_session(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", [id])?;
        Ok(())
    }
}
