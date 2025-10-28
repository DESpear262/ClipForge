use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use tauri::AppHandle;

pub fn open_db(app: &AppHandle) -> Result<Connection> {
    let app_data = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| anyhow!("Failed to resolve app data dir"))?;
    std::fs::create_dir_all(&app_data).ok();
    let db_path = PathBuf::from(app_data).join("clipforge.db");
    let conn = Connection::open(db_path).context("Failed to open SQLite database")?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    Ok(conn)
}

fn initialize_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            duration REAL,
            width INTEGER,
            height INTEGER,
            file_size INTEGER,
            format TEXT,
            codec TEXT,
            fps REAL,
            thumbnail_path TEXT,
            preview_path TEXT,
            created_at TEXT NOT NULL,
            metadata_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);
        "#,
    )
    .context("Failed to initialize schema")?;
    Ok(())
}

fn migrate_schema(conn: &Connection) -> Result<()> {
    // Ensure preview_path column exists (added in a later version)
    let has_preview: bool = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('media') WHERE name='preview_path' LIMIT 1",
            [],
            |row| row.get::<_, i32>(0),
        )
        .map(|_| true)
        .unwrap_or(false);

    if !has_preview {
        conn.execute("ALTER TABLE media ADD COLUMN preview_path TEXT", [])
            .ok();
    }

    Ok(())
}

#[derive(Debug, Clone)]
pub struct MediaRow {
    pub id: i64,
    pub path: String,
    pub filename: String,
    pub duration: Option<f64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub file_size: Option<i64>,
    pub format: Option<String>,
    pub codec: Option<String>,
    pub fps: Option<f64>,
    pub thumbnail_path: Option<String>,
    pub preview_path: Option<String>,
    pub created_at: String,
}

pub fn insert_media(
    conn: &Connection,
    path: &str,
    filename: &str,
    duration: Option<f64>,
    width: Option<i64>,
    height: Option<i64>,
    file_size: Option<i64>,
    format: Option<&str>,
    codec: Option<&str>,
    fps: Option<f64>,
    thumbnail_path: Option<&str>,
    preview_path: Option<&str>,
    metadata_json: Option<&str>,
) -> Result<i64> {
    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        r#"INSERT OR REPLACE INTO media
            (path, filename, duration, width, height, file_size, format, codec, fps, thumbnail_path, preview_path, created_at, metadata_json)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
        params![
            path,
            filename,
            duration,
            width,
            height,
            file_size,
            format,
            codec,
            fps,
            thumbnail_path,
            preview_path,
            created_at,
            metadata_json
        ],
    )
    .context("Failed to insert media")?;
    Ok(conn.last_insert_rowid())
}

pub fn list_media(conn: &Connection) -> Result<Vec<MediaRow>> {
    let mut stmt = conn
        .prepare(
            r#"SELECT id, path, filename, duration, width, height, file_size, format, codec, fps, thumbnail_path, preview_path, created_at
               FROM media ORDER BY created_at DESC"#,
        )
        .context("Prepare list_media failed")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MediaRow {
                id: row.get(0)?,
                path: row.get(1)?,
                filename: row.get(2)?,
                duration: row.get(3).ok(),
                width: row.get(4).ok(),
                height: row.get(5).ok(),
                file_size: row.get(6).ok(),
                format: row.get(7).ok(),
                codec: row.get(8).ok(),
                fps: row.get(9).ok(),
                thumbnail_path: row.get(10).ok(),
                preview_path: row.get(11).ok(),
                created_at: row.get(12)?,
            })
        })
        .context("Query map list_media failed")?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn delete_media(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM media WHERE id = ?1", params![id])
        .context("Delete media failed")?;
    Ok(())
}

pub fn update_preview_path(conn: &Connection, path: &str, preview_path: &str) -> Result<()> {
    conn.execute(
        "UPDATE media SET preview_path = ?1 WHERE path = ?2",
        params![preview_path, path],
    )
    .context("Update preview_path failed")?;
    Ok(())
}


