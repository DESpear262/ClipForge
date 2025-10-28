// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;

use ffmpeg::probe_metadata;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      // Initialize logging to console
      println!("ClipForge v0.1.0-mvp starting...");
      println!("FFmpeg module loaded");
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      test_ipc,
      open_import_dialog,
      open_export_dialog,
      probe_video_metadata
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
async fn open_import_dialog(app: tauri::AppHandle) -> Result<String, String> {
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
async fn open_export_dialog(app: tauri::AppHandle) -> Result<String, String> {
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
