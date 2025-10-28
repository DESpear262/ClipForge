// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;
mod db;

use ffmpeg::{probe_metadata, export_trim};
use tauri::Manager;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use tauri::api::dialog::FileDialogBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // Initialize logging to console
      println!("ClipForge v0.1.0-mvp starting...");
      println!("FFmpeg module loaded");
      // Open DB and manage connection
      let handle = app.handle();
      let conn = db::open_db(&handle).expect("Failed to open DB");
      app.manage::<Arc<Mutex<Connection>>>(Arc::new(Mutex::new(conn)));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      test_ipc,
      open_import_dialog,
      open_export_dialog,
      probe_video_metadata,
      open_file_dialog,
      import_video,
      get_media_library,
      delete_media_item,
      ensure_preview,
      export_video
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/**
 * Test IPC command for verifying communication between frontend and backend
 * 
 * This command is called from the frontend to ensure the Tauri bridge is working
 */
#[tauri::command]
fn test_ipc() -> String {
  println!("IPC test command received from frontend");
  "IPC connection successful!".to_string()
}

/**
 * Open import dialog command
 * 
 * TODO: Implement file picker integration in PR #3 (File Import System)
 */
#[tauri::command]
async fn open_import_dialog(_app: tauri::AppHandle) -> Result<String, String> {
  println!("Import dialog requested");
  // Placeholder - will be implemented in PR #3
  Ok("Import dialog not yet implemented".to_string())
}

/**
 * Open export dialog command
 * 
 * TODO: Implement save dialog integration in PR #8 (FFmpeg Export Pipeline)
 */
#[tauri::command]
async fn open_export_dialog(_app: tauri::AppHandle) -> Result<String, String> {
  println!("Export dialog requested");
  let (tx, rx) = std::sync::mpsc::channel();
  FileDialogBuilder::new()
    .set_title("Save Exported Clip")
    .add_filter("MP4 Video", &["mp4"])
    .set_file_name("clip.mp4")
    .save_file(move |path_opt| {
      let _ = tx.send(path_opt.map(|p| p));
    });
  match rx.recv() {
    Ok(Some(path)) => {
      let path_str = path.to_string_lossy().to_string();
      Ok(path_str)
    }
    Ok(None) => Ok(String::new()),
    Err(e) => Err(format!("Failed to get dialog result: {}", e)),
  }
}

/**
 * Probe video metadata using FFprobe
 * 
 * Extracts video information (duration, resolution, codec, etc.) from file
 */
#[tauri::command]
async fn probe_video_metadata(
  app: tauri::AppHandle,
  video_path: String,
) -> Result<ffmpeg::VideoMetadata, String> {
  match probe_metadata(&app, &video_path).await {
    Ok(metadata) => Ok(metadata),
    Err(e) => Err(format!("Failed to probe video: {}", e)),
  }
}

/**
 * Open file dialog to select a video file
 * 
 * Returns the file path and name if selected, None if cancelled
 */
#[tauri::command]
async fn open_file_dialog(
  app: tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
  println!("[open_file_dialog] Command invoked");
  
  // Create a channel to receive the result from the callback
  let (tx, rx) = std::sync::mpsc::channel();
  
  FileDialogBuilder::new()
    .add_filter("Video Files", &["mp4", "mov", "webm"])
    .pick_file(move |path_opt| {
      let _ = tx.send(path_opt.map(|p| p));
    });
  
  // Wait for the result
  match rx.recv() {
    Ok(Some(path)) => {
      println!("[open_file_dialog] File selected: {:?}", path);
      
      let path_buf = path; // v1 returns PathBuf directly
      
      let file_name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
      
      let path_str = path_buf
        .to_str()
        .unwrap_or("")
        .to_string();
      
      println!("[open_file_dialog] File name: {}, Path: {}", file_name, path_str);
      
      let result = serde_json::json!({
        "path": path_str,
        "name": file_name
      });
      
      println!("[open_file_dialog] Returning result: {:?}", result);
      Ok(Some(result))
    }
    Ok(None) => {
      println!("[open_file_dialog] User cancelled or no file selected");
      Ok(None)
    }
    Err(e) => {
      println!("[open_file_dialog] Channel error: {}", e);
      Err(format!("Failed to get dialog result: {}", e))
    }
  }
}

#[derive(serde::Serialize)]
struct MediaDto {
  id: i64,
  path: String,
  filename: String,
  duration: Option<f64>,
  width: Option<i64>,
  height: Option<i64>,
  file_size: Option<i64>,
  format: Option<String>,
  codec: Option<String>,
  fps: Option<f64>,
  thumbnail_path: Option<String>,
  preview_path: Option<String>,
  created_at: String,
}

#[tauri::command]
async fn import_video(
  app: tauri::AppHandle,
  state: tauri::State<'_, Arc<Mutex<Connection>>>,
  video_path: String,
) -> Result<serde_json::Value, String> {
  // Validate path
  if !std::path::Path::new(&video_path).exists() {
    return Err("File does not exist".into());
  }

  // Extract filename
  let filename = std::path::Path::new(&video_path)
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("unknown")
    .to_string();

  // Probe metadata
  let meta = probe_metadata(&app, &video_path)
    .await
    .map_err(|e| format!("Probe failed: {}", e))?;

  // Generate thumbnail
  let thumb_dir = app.path_resolver().app_data_dir().ok_or("app_data_dir not found")?
    .join("thumbnails");
  std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
  let thumb_path = thumb_dir.join(format!("{}_thumb.jpg", filename));
  ffmpeg::generate_thumbnail(&app, &video_path, thumb_path.to_string_lossy().as_ref(), 1.0)
    .await
    .map_err(|e| format!("Thumbnail failed: {}", e))?;

  // Generate preview (WebM)
  let preview_dir = app.path_resolver().app_data_dir().ok_or("app_data_dir not found")?
    .join("previews");
  std::fs::create_dir_all(&preview_dir).map_err(|e| e.to_string())?;
  let preview_path = preview_dir.join(format!("{}.webm", filename));
  ffmpeg::generate_preview_webm(&app, &video_path, preview_path.to_string_lossy().as_ref())
    .await
    .map_err(|e| format!("Preview failed: {}", e))?;

  // Insert DB
  let conn = state.inner().lock().unwrap();
  let id = db::insert_media(
    &conn,
    &video_path,
    &filename,
    Some(meta.duration),
    Some(meta.width as i64),
    Some(meta.height as i64),
    Some(meta.size as i64),
    meta.container_format.as_deref(),
    Some(meta.codec.as_str()),
    meta.fps,
    Some(thumb_path.to_string_lossy().as_ref()),
    Some(preview_path.to_string_lossy().as_ref()),
    None,
  ).map_err(|e| format!("DB insert failed: {}", e))?;

  Ok(serde_json::json!({
    "id": id,
    "path": video_path,
    "filename": filename,
    "duration": meta.duration,
    "width": meta.width,
    "height": meta.height,
    "file_size": meta.size,
    "format": meta.container_format,
    "codec": meta.codec,
    "fps": meta.fps,
    "thumbnail_path": thumb_path.to_string_lossy(),
    "preview_path": preview_path.to_string_lossy(),
  }))
}

#[tauri::command]
async fn get_media_library(
  state: tauri::State<'_, Arc<Mutex<Connection>>>,
) -> Result<Vec<MediaDto>, String> {
  let conn = state.inner().lock().unwrap();
  let rows = db::list_media(&conn).map_err(|e| format!("DB error: {}", e))?;
  Ok(rows.into_iter().map(|r| MediaDto {
    id: r.id,
    path: r.path,
    filename: r.filename,
    duration: r.duration,
    width: r.width,
    height: r.height,
    file_size: r.file_size,
    format: r.format,
    codec: r.codec,
    fps: r.fps,
    thumbnail_path: r.thumbnail_path,
    preview_path: r.preview_path,
    created_at: r.created_at,
  }).collect())
}

#[tauri::command]
async fn delete_media_item(
  state: tauri::State<'_, Arc<Mutex<Connection>>>,
  id: i64,
) -> Result<(), String> {
  let conn = state.inner().lock().unwrap();
  db::delete_media(&conn, id).map_err(|e| format!("DB error: {}", e))
}

/// Ensure a WebM preview exists for the given absolute video path; returns preview_path
#[tauri::command]
async fn ensure_preview(
  app: tauri::AppHandle,
  state: tauri::State<'_, Arc<Mutex<Connection>>>,
  video_path: String,
) -> Result<String, String> {
  let filename = std::path::Path::new(&video_path)
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("unknown")
    .to_string();

  let preview_dir = app.path_resolver().app_data_dir().ok_or("app_data_dir not found")?
    .join("previews");
  std::fs::create_dir_all(&preview_dir).map_err(|e| e.to_string())?;
  let preview_path = preview_dir.join(format!("{}.webm", filename));

  // If file already exists, just update DB and return
  if !preview_path.exists() {
    if let Err(e) = ffmpeg::generate_preview_webm(&app, &video_path, preview_path.to_string_lossy().as_ref()).await {
      println!("[ensure_preview] VP9 failed: {}. Trying VP8...", e);
      ffmpeg::generate_preview_vp8(&app, &video_path, preview_path.to_string_lossy().as_ref())
        .await
        .map_err(|e| format!("Preview generation failed: {}", e))?;
    }
  }

  let preview_str = preview_path.to_string_lossy().to_string();
  let conn = state.inner().lock().unwrap();
  db::update_preview_path(&conn, &video_path, &preview_str)
    .map_err(|e| format!("DB error: {}", e))?;
  Ok(preview_str)
}

/// Export a trimmed clip to MP4 with progress events
#[tauri::command]
async fn export_video(
  app: tauri::AppHandle,
  input_path: String,
  output_path: String,
  start_sec: f64,
  end_sec: f64,
  fast_copy: Option<bool>,
) -> Result<(), String> {
  if input_path.is_empty() || output_path.is_empty() {
    return Err("Invalid input or output path".into());
  }
  let fc = fast_copy.unwrap_or(false);
  export_trim(&app, &input_path, &output_path, start_sec, end_sec, fc)
    .await
    .map_err(|e| format!("Export failed: {}", e))
}
