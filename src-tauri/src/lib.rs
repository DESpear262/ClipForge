// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;

use ffmpeg::probe_metadata;
use tauri_plugin_dialog::DialogExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
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
