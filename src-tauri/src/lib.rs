// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;

use ffmpeg::probe_metadata;
use tauri_plugin_dialog::DialogExt;
use tauri::http::{Response, header::{CONTENT_TYPE, ACCEPT_RANGES, CONTENT_RANGE}};
use urlencoding::decode;
use std::{fs, path::PathBuf, fs::File, io::{Read, Seek, SeekFrom}};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .register_uri_scheme_protocol("stream", |app, request| {
      // stream://video?path=<encoded-absolute-path>
      let uri = request.uri().to_string();
      let path_param = uri.split_once("path=")
        .and_then(|(_, p)| Some(p.to_string()))
        .unwrap_or_default();

      let decoded = decode(&path_param).unwrap_or_default().to_string();
      let path = PathBuf::from(decoded);

      // Determine MIME by extension
      let content_type = match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        _ => "application/octet-stream",
      };

      // Open file and get metadata
      let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(e) => {
          let body = format!("Failed to open file: {}", e);
          return Response::builder()
            .status(404)
            .body(body.as_bytes().to_vec())
            .expect("failed to build error response");
        }
      };

      let file_len = match file.metadata() {
        Ok(m) => m.len(),
        Err(e) => {
          let body = format!("Failed to read file metadata: {}", e);
          return Response::builder()
            .status(500)
            .body(body.as_bytes().to_vec())
            .expect("failed to build error response");
        }
      };

      // Parse Range header for partial content support
      let range_header = request
        .headers()
        .get("Range")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

      if let Some(r) = range_header.strip_prefix("bytes=") {
        let (start, end) = if let Some((s, e)) = r.split_once('-') {
          let s: u64 = s.parse().unwrap_or(0);
          let e: u64 = if e.is_empty() { file_len.saturating_sub(1) } else { e.parse().unwrap_or(file_len.saturating_sub(1)) };
          (s, e.min(file_len.saturating_sub(1)))
        } else {
          (0, file_len.saturating_sub(1))
        };

        if start >= file_len {
          // Invalid range
          let body = format!("Requested range not satisfiable");
          return Response::builder()
            .status(416)
            .header(CONTENT_RANGE, format!("bytes */{}", file_len))
            .body(body.as_bytes().to_vec())
            .expect("failed to build response");
        }

        let chunk_len = end.saturating_sub(start) + 1;
        let mut buf = vec![0u8; chunk_len as usize];
        let _ = file.seek(SeekFrom::Start(start));
        if let Err(e) = file.read_exact(&mut buf) {
          let body = format!("Failed to read range: {}", e);
          return Response::builder()
            .status(500)
            .body(body.as_bytes().to_vec())
            .expect("failed to build response");
        }

        return Response::builder()
          .status(206)
          .header(CONTENT_TYPE, content_type)
          .header(ACCEPT_RANGES, "bytes")
          .header(CONTENT_RANGE, format!("bytes {}-{}/{}", start, end, file_len))
          .body(buf)
          .expect("failed to build response");
      }

      // No Range header → serve full file
      let mut buf = Vec::with_capacity(file_len as usize);
      if let Err(e) = file.read_to_end(&mut buf) {
        let body = format!("Failed to read file: {}", e);
        return Response::builder()
          .status(500)
          .body(body.as_bytes().to_vec())
          .expect("failed to build response");
      }

      Response::builder()
        .status(200)
        .header(CONTENT_TYPE, content_type)
        .header(ACCEPT_RANGES, "bytes")
        .body(buf)
        .expect("failed to build response")
    })
    .setup(|_app| {
      // Initialize logging to console
      println!("ClipForge v0.1.0-mvp starting...");
      println!("FFmpeg module loaded");
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      test_ipc,
      open_import_dialog,
      open_export_dialog,
      probe_video_metadata,
      open_file_dialog
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
  // Placeholder - will be implemented in PR #8
  Ok("Export dialog not yet implemented".to_string())
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
  
  // Use the dialog plugin's app context
  let dialog = app.dialog();
  
  // Create a channel to receive the result from the callback
  let (tx, rx) = std::sync::mpsc::channel();
  
  dialog.file()
    .add_filter("Video Files", &["mp4", "mov", "webm"])
    .pick_file(move |path_opt| {
      let _ = tx.send(path_opt);
    });
  
  // Wait for the result
  match rx.recv() {
    Ok(Some(path)) => {
      println!("[open_file_dialog] File selected: {:?}", path);
      
      // FilePath is an enum, convert to PathBuf to access methods
      let path_buf = path.into_path().map_err(|e| format!("Failed to get path: {}", e))?;
      
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
