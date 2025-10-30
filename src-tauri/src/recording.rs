use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{sync::Mutex, time::Instant};
use tauri::{AppHandle, Manager};
use tokio::{io::{AsyncWriteExt, AsyncBufReadExt, BufReader}, process::Child, process::Command, task, time};

/// Basic readme: Screen recording session management
///
/// This module provides a lightweight Windows screen recording implementation
/// using FFmpeg's gdigrab input. It exposes start/stop APIs and emits progress
/// events. For Sprint 2 PR#1 we focus on full-desktop capture at 60 fps.
/// Future work may replace gdigrab with Windows.Graphics.Capture for improved
/// performance and window-specific capture.

#[derive(Debug)]
struct RecordingState {
  child: Child,
  started_at: Instant,
  output_path: String,
}

static ACTIVE: Lazy<Mutex<Option<RecordingState>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureSource {
  pub id: String,
  pub kind: String, // "display" | "window"
  pub name: String,
}

/// Generate a timestamped default recording output path under app_data_dir/recordings
fn default_output_path(app: &AppHandle) -> Result<String> {
  let dir = app
    .path_resolver()
    .app_data_dir()
    .ok_or_else(|| anyhow::anyhow!("app_data_dir not found"))?
    .join("recordings");
  std::fs::create_dir_all(&dir)?;
  let now = chrono::Local::now();
  let filename = format!(
    "ClipForge_{}.mp4",
    now.format("%Y-%m-%d_%H%M%S")
  );
  Ok(dir.join(filename).to_string_lossy().to_string())
}

/// Start a desktop screen recording using ffmpeg gdigrab. Emits record:start and periodic record:progress.
pub async fn start_screen_recording(
  app: &AppHandle,
  fps: Option<u32>,
  output_path: Option<String>,
  audio_device: Option<String>,
) -> Result<String> {
  // Only one active session allowed
  {
    let mut guard = ACTIVE.lock().unwrap();
    if guard.is_some() {
      anyhow::bail!("Recording already in progress");
    }
  }

  let ffmpeg_path = app
    .path_resolver()
    .resolve_resource("bin/ffmpeg.exe")
    .context("Failed to resolve ffmpeg path")?;
  if !ffmpeg_path.exists() {
    anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
  }

  let fps = fps.unwrap_or(60).max(1).min(120);
  let out_path = output_path.unwrap_or(default_output_path(app)?);

  // Build args for video (gdigrab) and optional audio (dshow)
  let mut args: Vec<String> = vec![
    "-f".into(), "gdigrab".into(),
    "-framerate".into(), format!("{}", fps),
    "-draw_mouse".into(), "1".into(),
    "-i".into(), "desktop".into(),
  ];
  // Optional microphone device (dshow)
  let mut audio_added = false;
  if let Some(dev) = audio_device {
    println!("[record] mic override selected: {}", dev);
    args.extend_from_slice(&["-f".into(), "dshow".into(), "-i".into(), format!("audio={}", dev)]);
    audio_added = true;
  }
  // Encoding params
  args.extend_from_slice(&[
    "-pix_fmt".into(), "yuv420p".into(),
    "-c:v".into(), "libx264".into(),
    "-preset".into(), "veryfast".into(),
    "-crf".into(), "23".into(),
    "-r".into(), format!("{}", fps),
  ]);
  if audio_added {
    args.extend_from_slice(&["-c:a".into(), "aac".into(), "-b:a".into(), "160k".into()]);
    // Map streams explicitly when audio present
    args.extend_from_slice(&["-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);
  }
  args.extend_from_slice(&["-y".into(), out_path.clone()]);

  println!("[record] start_screen_recording ffmpeg args: {:?}", args);

  let mut child = Command::new(&ffmpeg_path)
    .args(&args)
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .context("Failed to spawn ffmpeg for recording")?;

  let started_at = Instant::now();
  app.emit_all("record:start", serde_json::json!({ "outputPath": out_path }))
    .ok();

  // Take stderr before moving child into ACTIVE
  let stderr_pipe = child.stderr.take();

  // Store session
  {
    let mut guard = ACTIVE.lock().unwrap();
    *guard = Some(RecordingState { child, started_at, output_path: out_path.clone() });
  }

  // Spawn a progress ticker emitting elapsed ms every second
  let app_handle = app.clone();
  task::spawn(async move {
    // pipe stderr lines to frontend
    if let Some(stderr) = stderr_pipe {
      let mut reader = BufReader::new(stderr).lines();
      while let Ok(Some(line)) = reader.next_line().await {
        app_handle.emit_all("record:ffmpeg", serde_json::json!({ "line": line })).ok();
      }
    }
    loop {
      time::sleep(time::Duration::from_secs(1)).await;
      let (alive, started, out) = {
        let guard = ACTIVE.lock().unwrap();
        if let Some(st) = guard.as_ref() {
          (true, st.started_at, st.output_path.clone())
        } else {
          (false, Instant::now(), String::new())
        }
      };
      if !alive { break; }
      let elapsed = started.elapsed().as_millis() as u64;
      app_handle.emit_all("record:progress", serde_json::json!({ "elapsedMs": elapsed, "outputPath": out }))
        .ok();
    }
  });

  Ok(out_path)
}

/// Stop the active recording by sending 'q' to ffmpeg stdin and waiting for exit.
pub async fn stop_recording(app: &AppHandle) -> Result<String> {
  let mut child_opt: Option<Child> = None;
  let out_path: String;
  // Extract child and output path without holding the lock across .await
  let stdin_to_signal: Option<tokio::process::ChildStdin>;
  {
    let mut guard = ACTIVE.lock().unwrap();
    if let Some(mut st) = guard.take() {
      out_path = st.output_path.clone();
      stdin_to_signal = st.child.stdin.take();
      child_opt = Some(st.child);
    } else {
      anyhow::bail!("No active recording");
    }
  }

  if let Some(mut stdin) = stdin_to_signal {
    let _ = stdin.write_all(b"q\n").await;
  }

  if let Some(mut child) = child_opt {
    let _ = child.wait().await;
  }

  app.emit_all("record:stopped", serde_json::json!({ "outputPath": out_path }))
    .ok();
  Ok(out_path)
}

/// List available capture sources. For PR#1 returns full desktop only.
pub async fn list_capture_sources(_app: &AppHandle) -> Result<Vec<CaptureSource>> {
  Ok(vec![CaptureSource { id: "desktop".into(), kind: "display".into(), name: "Desktop (Primary)".into() }])
}

/// List audio capture devices by invoking ffmpeg dshow list and parsing stderr
pub async fn list_audio_devices(app: &AppHandle) -> Result<Vec<String>> {
  let ffmpeg_path = app
    .path_resolver()
    .resolve_resource("bin/ffmpeg.exe")
    .context("Failed to resolve ffmpeg path")?;
  if !ffmpeg_path.exists() {
    anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
  }
  let output = Command::new(&ffmpeg_path)
    .arg("-f").arg("dshow")
    .arg("-list_devices").arg("true")
    .arg("-i").arg("dummy")
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped())
    .output()
    .await
    .context("Failed to execute ffmpeg dshow list")?;
  let stderr = String::from_utf8_lossy(&output.stderr);
  let mut out = Vec::new();
  let mut in_audio_section = false;
  for line in stderr.lines() {
    if line.contains("DirectShow audio devices") { in_audio_section = true; continue; }
    if line.contains("DirectShow video devices") { in_audio_section = false; }
    if !in_audio_section { continue; }
    if line.contains("Alternative name") { continue; }
    if let Some(idx) = line.find('"') {
      let rest = &line[idx+1..];
      if let Some(end) = rest.find('"') {
        let name = &rest[..end];
        if !name.is_empty() { out.push(name.to_string()); }
      }
    }
  }
  // Deduplicate
  out.sort();
  out.dedup();
  Ok(out)
}

/// List video capture devices via ffmpeg dshow
pub async fn list_video_devices(app: &AppHandle) -> Result<Vec<String>> {
  let ffmpeg_path = app
    .path_resolver()
    .resolve_resource("bin/ffmpeg.exe")
    .context("Failed to resolve ffmpeg path")?;
  if !ffmpeg_path.exists() {
    anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
  }
  let output = Command::new(&ffmpeg_path)
    .arg("-f").arg("dshow")
    .arg("-list_devices").arg("true")
    .arg("-i").arg("dummy")
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped())
    .output()
    .await
    .context("Failed to execute ffmpeg dshow list")?;
  let stderr = String::from_utf8_lossy(&output.stderr);
  let mut out = Vec::new();
  let mut in_video_section = false;
  for line in stderr.lines() {
    if line.contains("DirectShow video devices") { in_video_section = true; continue; }
    if line.contains("DirectShow audio devices") { in_video_section = false; }
    if !in_video_section { continue; }
    if line.contains("Alternative name") { continue; }
    if let Some(idx) = line.find('"') {
      let rest = &line[idx+1..];
      if let Some(end) = rest.find('"') {
        let name = &rest[..end];
        if !name.is_empty() { out.push(name.to_string()); }
      }
    }
  }
  out.sort();
  out.dedup();
  Ok(out)
}

/// Start combined screen + webcam + optional mic with PiP overlay
pub async fn start_combined_recording(
  app: &AppHandle,
  fps: Option<u32>,
  output_path: Option<String>,
  webcam_device: String,
  audio_device: Option<String>,
  corner: Option<String>, // "br"|"bl"|"tr"|"tl"
  pip_width_px: Option<u32>,
  margin_px: Option<u32>,
) -> Result<String> {
  {
    let mut guard = ACTIVE.lock().unwrap();
    if guard.is_some() {
      anyhow::bail!("Recording already in progress");
    }
  }

  let ffmpeg_path = app
    .path_resolver()
    .resolve_resource("bin/ffmpeg.exe")
    .context("Failed to resolve ffmpeg path")?;
  if !ffmpeg_path.exists() {
    anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
  }

  let fps = fps.unwrap_or(60).max(1).min(120);
  let out_path = output_path.unwrap_or(default_output_path(app)?);
  let pip_w = pip_width_px.unwrap_or(480);
  let margin = margin_px.unwrap_or(16);
  let corner = corner.unwrap_or_else(|| "br".to_string());

  // Compute x/y expressions for overlay
  let x_expr = match corner.as_str() {
    "bl" => format!("{}", margin),
    "tr" => format!("W-w-{}", margin),
    "tl" => format!("{}", margin),
    _ => format!("W-w-{}", margin), // br
  };
  let y_expr = match corner.as_str() {
    "tr" => format!("{}", margin),
    "tl" => format!("{}", margin),
    _ => format!("H-h-{}", margin),
  };

  // filter_complex: scale webcam to pip_w, pad by 4 px for border, overlay on desktop
  let filter = format!(
    "[1:v]scale={}: -1,format=rgba,pad=iw+4:ih+4:2:2:black[cam];[0:v][cam]overlay=x={}:y={}",
    pip_w, x_expr, y_expr
  );

  let mut args: Vec<String> = vec![
    "-f".into(), "gdigrab".into(),
    "-framerate".into(), format!("{}", fps),
    "-draw_mouse".into(), "1".into(),
    "-i".into(), "desktop".into(),
    "-f".into(), "dshow".into(), "-i".into(), format!("video={}", webcam_device),
  ];
  if let Some(dev) = audio_device.as_ref() {
    args.extend_from_slice(&["-f".into(), "dshow".into(), "-i".into(), format!("audio={}", dev)]);
  }
  args.extend_from_slice(&[
    "-filter_complex".into(), filter,
    "-c:v".into(), "libx264".into(),
    "-preset".into(), "veryfast".into(),
    "-crf".into(), "23".into(),
    "-r".into(), format!("{}", fps),
  ]);
  if audio_device.is_some() {
    args.extend_from_slice(&["-c:a".into(), "aac".into(), "-b:a".into(), "160k".into(), "-map".into(), "2:a:0".into()]);
  }
  args.extend_from_slice(&["-y".into(), out_path.clone()]);

  println!("[record] start_combined_recording ffmpeg args: {:?}", args);

  let mut child = Command::new(&ffmpeg_path)
    .args(&args)
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .context("Failed to spawn ffmpeg for combined recording")?;

  let started_at = Instant::now();
  app.emit_all("record:start", serde_json::json!({ "outputPath": out_path, "mode": "combined" }))
    .ok();
  let stderr_pipe = child.stderr.take();
  {
    let mut guard = ACTIVE.lock().unwrap();
    *guard = Some(RecordingState { child, started_at, output_path: out_path.clone() });
  }
  let app_handle = app.clone();
  task::spawn(async move {
    if let Some(stderr) = stderr_pipe {
      let mut reader = BufReader::new(stderr).lines();
      while let Ok(Some(line)) = reader.next_line().await {
        app_handle.emit_all("record:ffmpeg", serde_json::json!({ "line": line })).ok();
      }
    }
    loop {
      time::sleep(time::Duration::from_secs(1)).await;
      let (alive, started, out) = {
        let guard = ACTIVE.lock().unwrap();
        if let Some(st) = guard.as_ref() {
          (true, st.started_at, st.output_path.clone())
        } else { (false, Instant::now(), String::new()) }
      };
      if !alive { break; }
      let elapsed = started.elapsed().as_millis() as u64;
      app_handle.emit_all("record:progress", serde_json::json!({ "elapsedMs": elapsed, "outputPath": out }))
        .ok();
    }
  });

  Ok(out_path)
}


