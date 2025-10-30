// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;
mod recording;
mod db;
mod whisper;
mod highlight;
use serde::{Deserialize, Serialize};

use ffmpeg::{probe_metadata, export_trim, transcode_recording_to_mp4, transcode_audio_to_m4a, mux_video_audio, compose_pip};
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

      // In release, explicitly create the main window to the embedded index.html
      // to avoid any race with protocol initialization.
      use tauri::{WindowBuilder, WindowUrl};
      #[cfg(debug_assertions)]
      {
        println!("Boot: creating main window -> External(http://localhost:1420)");
        WindowBuilder::new(app, "main", WindowUrl::External("http://localhost:1420".parse().unwrap()))
          .title("ClipForge")
          .inner_size(1200.0, 800.0)
          .min_inner_size(800.0, 600.0)
          .build()
          .expect("failed to build main window (dev)");
      }
      #[cfg(not(debug_assertions))]
      {
        println!("Boot: creating main window -> App(index.html)");
        WindowBuilder::new(app, "main", WindowUrl::App("index.html".into()))
          .title("ClipForge")
          .inner_size(1200.0, 800.0)
          .min_inner_size(800.0, 600.0)
          .build()
          .expect("failed to build main window (prod)");
      }
      // In dev, default window uses dev server from config
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      test_ipc,
      open_import_dialog,
      open_export_dialog,
      probe_video_metadata,
      start_screen_recording_cmd,
      stop_recording_cmd,
      list_capture_sources_cmd,
      list_audio_devices_cmd,
      list_video_devices_cmd,
      start_combined_recording_cmd,
      transcode_audio,
      mux_video_audio_cmd,
      compose_pip_cmd,
      transcode_recording,
      open_file_dialog,
      import_video,
      get_media_library,
      delete_media_item,
      ensure_preview,
      export_video,
      export_timeline_segment_cmd,
      load_project_state,
      save_project_state
      , transcribe_media_cmd
      , find_highlight_cmd
      , ai_preflight_cmd
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

/// Start screen recording (desktop) using FFmpeg gdigrab. Returns output path on success.
#[tauri::command]
async fn start_screen_recording_cmd(app: tauri::AppHandle, fps: Option<u32>, output_path: Option<String>, audio_device: Option<String>) -> Result<String, String> {
  recording::start_screen_recording(&app, fps, output_path, audio_device)
    .await
    .map_err(|e| format!("Failed to start recording: {}", e))
}

/// Stop active recording session. Returns output path of the recording.
#[tauri::command]
async fn stop_recording_cmd(app: tauri::AppHandle) -> Result<String, String> {
  recording::stop_recording(&app).await.map_err(|e| format!("Failed to stop recording: {}", e))
}

/// List capture sources (PR#1: desktop only)
#[tauri::command]
async fn list_capture_sources_cmd(app: tauri::AppHandle) -> Result<Vec<recording::CaptureSource>, String> {
  recording::list_capture_sources(&app).await.map_err(|e| format!("Failed to list sources: {}", e))
}

/// List audio input devices via ffmpeg dshow
#[tauri::command]
async fn list_audio_devices_cmd(app: tauri::AppHandle) -> Result<Vec<String>, String> {
  recording::list_audio_devices(&app).await.map_err(|e| format!("Failed to list audio devices: {}", e))
}

/// List video input devices via ffmpeg dshow
#[tauri::command]
async fn list_video_devices_cmd(app: tauri::AppHandle) -> Result<Vec<String>, String> {
  recording::list_video_devices(&app).await.map_err(|e| format!("Failed to list video devices: {}", e))
}

/// Start combined screen+webcam (+optional mic) recording with PiP
#[tauri::command]
async fn start_combined_recording_cmd(
  app: tauri::AppHandle,
  fps: Option<u32>,
  output_path: Option<String>,
  webcam_device: String,
  audio_device: Option<String>,
  corner: Option<String>,
  pip_width_px: Option<u32>,
  margin_px: Option<u32>,
) -> Result<String, String> {
  recording::start_combined_recording(&app, fps, output_path, webcam_device, audio_device, corner, pip_width_px, margin_px)
    .await
    .map_err(|e| format!("Failed to start combined recording: {}", e))
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

/// Export a composed timeline segment bounded by a selected item fence.
#[tauri::command]
async fn export_timeline_segment_cmd(
  app: tauri::AppHandle,
  req: ffmpeg::ExportTimelineRequest,
) -> Result<(), String> {
  ffmpeg::export_timeline_segment(&app, req)
    .await
    .map_err(|e| format!("Export timeline segment failed: {}", e))
}

/// Transcode a WebM recording to MP4 and return output path
#[tauri::command]
async fn transcode_recording(app: tauri::AppHandle, input_path: String, output_path: String) -> Result<String, String> {
  if input_path.is_empty() || output_path.is_empty() {
    return Err("Invalid input or output path".into());
  }
  transcode_recording_to_mp4(&app, &input_path, &output_path)
    .await
    .map_err(|e| format!("Transcode failed: {}", e))?;
  Ok(output_path)
}

/// Transcode audio-only recording to M4A
#[tauri::command]
async fn transcode_audio(app: tauri::AppHandle, input_path: String, output_path: String) -> Result<String, String> {
  if input_path.is_empty() || output_path.is_empty() { return Err("Invalid input or output path".into()); }
  transcode_audio_to_m4a(&app, &input_path, &output_path)
    .await
    .map_err(|e| format!("Transcode failed: {}", e))?;
  Ok(output_path)
}

/// Mux a video file and an external audio file into a single MP4
#[tauri::command]
async fn mux_video_audio_cmd(app: tauri::AppHandle, video_path: String, audio_path: String, output_path: String) -> Result<String, String> {
  if video_path.is_empty() || audio_path.is_empty() || output_path.is_empty() { return Err("Invalid path(s)".into()); }
  mux_video_audio(&app, &video_path, &audio_path, &output_path)
    .await
    .map_err(|e| format!("Mux failed: {}", e))?;
  Ok(output_path)
}

/// Compose PiP from base + overlay (+ optional mic) into a final MP4.
#[tauri::command]
async fn compose_pip_cmd(
  app: tauri::AppHandle,
  base_video_path: String,
  overlay_video_path: String,
  audio_path: Option<String>,
  corner: Option<String>,
  pip_width_px: Option<u32>,
  margin_px: Option<u32>,
) -> Result<String, String> {
  let out = {
    // Default output next to base video with suffix
    let base = std::path::Path::new(&base_video_path);
    let parent = base.parent().ok_or("Invalid base path")?;
    let stem = base.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    parent.join(format!("{}_pip.mp4", stem)).to_string_lossy().to_string()
  };
  compose_pip(
    &app,
    &base_video_path,
    &overlay_video_path,
    audio_path.as_deref(),
    corner.as_deref(),
    pip_width_px,
    margin_px,
    &out,
  ).await.map_err(|e| format!("Compose failed: {}", e))?;
  Ok(out)
}

/// Persisted project state structure
#[derive(Serialize, Deserialize, Default)]
struct PersistedState {
  version: u32,
  lastSelectedPath: Option<String>,
  timeline: Option<PersistedTimeline>,
  trimsByPath: Option<std::collections::HashMap<String, PersistedTrim>>, 
  /// Multi-track doc is stored client-side; optional here if present
  #[serde(skip_serializing_if = "Option::is_none")]
  timelineDoc: Option<serde_json::Value>,
  /// Export settings (PR#12)
  #[serde(skip_serializing_if = "Option::is_none")]
  exportSettings: Option<ExportSettings>,
}

#[derive(Serialize, Deserialize)]
struct PersistedTimeline { pxPerSecond: Option<f64>, loopTrim: Option<bool> }

#[derive(Serialize, Deserialize)]
struct PersistedTrim { inPoint: f64, outPoint: f64 }

#[derive(Serialize, Deserialize, Default)]
struct ExportSettings {
  #[serde(default)]
  normalizeEnabled: Option<bool>,
  #[serde(default)]
  targetLufs: Option<f64>,
  #[serde(default)]
  truePeak: Option<f64>,
  #[serde(default)]
  fadeInSec: Option<f64>,
  #[serde(default)]
  fadeOutSec: Option<f64>,
}

fn state_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let dir = app.path_resolver().app_data_dir().ok_or("app_data_dir not found")?;
  let file = dir.join("project.json");
  Ok(file)
}

#[tauri::command]
async fn load_project_state(app: tauri::AppHandle) -> Result<Option<PersistedState>, String> {
  let path = state_path(&app)?;
  if !path.exists() { return Ok(None); }
  let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
  let state: PersistedState = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
  Ok(Some(state))
}

#[tauri::command]
async fn save_project_state(app: tauri::AppHandle, state: PersistedState) -> Result<(), String> {
  let path = state_path(&app)?;
  if let Some(dir) = path.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
  let json = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
  std::fs::write(&path, json).map_err(|e| e.to_string())?;
  Ok(())
}

/// Transcribe the given media using OpenAI Whisper and persist JSON
#[tauri::command]
async fn transcribe_media_cmd(
  app: tauri::AppHandle,
  media_id: i64,
  video_path: String,
) -> Result<String, String> {
  if video_path.is_empty() { return Err("Invalid video path".into()); }
  whisper::transcribe_media(&app, media_id, &video_path).await.map_err(|e| format!("Transcription failed: {}", e))
}

/// Find a single highlight (start/end) from a transcript via GPT-4o-mini
#[tauri::command]
async fn find_highlight_cmd(
  app: tauri::AppHandle,
  media_id: i64,
) -> Result<serde_json::Value, String> {
  match highlight::find_highlight(&app, media_id).await {
    Ok((start, end, path)) => Ok(serde_json::json!({ "start": start, "end": end, "path": path })),
    Err(e) => {
      // Emit an error event so the frontend can surface details
      let _ = app.emit_all("ai:highlight:error", serde_json::json!({ "mediaId": media_id, "message": e.to_string() }));
      Err(format!("Highlight failed: {}", e))
    },
  }
}

/// AI preflight: check key presence and basic internet connectivity
#[tauri::command]
async fn ai_preflight_cmd() -> Result<serde_json::Value, String> {
  let has_key = std::env::var("OPENAI_API_KEY").ok().filter(|s| !s.is_empty()).is_some();
  let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(3)).build().map_err(|e| e.to_string())?;
  let online = client.get("https://api.openai.com").send().await.map(|r| r.status().is_success() || r.status().as_u16() >= 400).unwrap_or(false);
  Ok(serde_json::json!({ "hasKey": has_key, "online": online }))
}
