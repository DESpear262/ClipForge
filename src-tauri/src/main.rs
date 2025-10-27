// Prevents additional console window on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

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
 * Main entry point for the Tauri application
 */
fn main() {
  tauri::Builder::default()
    .setup(|app| {
      // Initialize logging to console
      println!("ClipForge v0.1.0-mvp starting...");
      
      // Window setup would go here if needed
      // Future: Register event listeners for FFmpeg progress
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      test_ipc,
      open_import_dialog,
      open_export_dialog
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

