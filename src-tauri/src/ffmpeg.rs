use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::{io::{AsyncBufReadExt, BufReader}, process::Command};

/**
 * Video metadata structure returned by FFprobe
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub bitrate: Option<u64>,
    pub codec: String,
    pub size: u64,
    pub container_format: Option<String>,
    pub fps: Option<f64>,
}

/**
 * Probe video metadata using FFprobe
 * 
 * Extracts duration, resolution, codec, and file size from video file
 * Returns structured metadata or error
 */
pub async fn probe_metadata(
    app: &AppHandle,
    video_path: &str,
) -> Result<VideoMetadata> {
    println!("Probing metadata for: {}", video_path);

    let ffprobe_path = app
        .path_resolver()
        .resolve_resource("bin/ffprobe.exe")
        .context("Failed to resolve ffprobe path")?;

    if !ffprobe_path.exists() {
        anyhow::bail!("ffprobe.exe not found at: {:?}", ffprobe_path);
    }

    // FFprobe command to get JSON output with video stream info
    let output = tokio::process::Command::new(&ffprobe_path)
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration,size,bit_rate,format_name:stream=codec_name,width,height,r_frame_rate")
        .arg("-of")
        .arg("json")
        .arg(video_path)
        .output()
        .await
        .context("Failed to execute ffprobe")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffprobe failed: {}", stderr);
    }

    let output_str = String::from_utf8(output.stdout)
        .context("Failed to parse ffprobe output")?;

    // Parse JSON response
    #[derive(Deserialize)]
    struct ProbeOutput {
        format: ProbeFormat,
        streams: Vec<ProbeStream>,
    }

    #[derive(Deserialize)]
    struct ProbeFormat {
        duration: Option<String>,
        size: Option<String>,
        bit_rate: Option<String>,
        format_name: Option<String>,
    }

    #[derive(Deserialize)]
    struct ProbeStream {
        codec_name: Option<String>,
        width: Option<u32>,
        height: Option<u32>,
        r_frame_rate: Option<String>,
    }

    let probe_data: ProbeOutput =
        serde_json::from_str(&output_str).context("Failed to parse ffprobe JSON")?;

    let video_stream = probe_data
        .streams
        .first()
        .context("No video stream found")?;

    let duration = probe_data
        .format
        .duration
        .and_then(|d| d.parse::<f64>().ok())
        .map(|d| (d * 10.0).round() / 10.0) // Round to nearest 0.1s
        .unwrap_or(0.0);

    let width = video_stream.width.unwrap_or(0);
    let height = video_stream.height.unwrap_or(0);
    let codec = video_stream
        .codec_name
        .clone()
        .unwrap_or_else(|| "unknown".to_string());
    let size = probe_data
        .format
        .size
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let bitrate = probe_data
        .format
        .bit_rate
        .and_then(|b| b.parse::<u64>().ok());
    let container_format = probe_data.format.format_name;
    
    // Parse frame rate (e.g., "30/1" -> 30.0)
    let fps = video_stream
        .r_frame_rate
        .as_ref()
        .and_then(|rate| {
            if let Some((num, den)) = rate.split_once('/') {
                let numerator: f64 = num.parse().ok()?;
                let denominator: f64 = den.parse().ok()?;
                if denominator != 0.0 {
                    Some((numerator / denominator * 10.0).round() / 10.0)
                } else {
                    None
                }
            } else {
                None
            }
        });

    Ok(VideoMetadata {
        duration,
        width,
        height,
        bitrate,
        codec,
        size,
        container_format,
        fps,
    })
}

/**
 * Execute FFmpeg command for processing video
 * 
 * Runs FFmpeg with the provided arguments and emits progress via events
 * This will be used for trimming and exporting in PR #8
 */
#[allow(dead_code)]
pub async fn execute_ffmpeg(
    app: &AppHandle,
    args: Vec<String>,
) -> Result<()> {
    println!("Executing FFmpeg with args: {:?}", args);

    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;

    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    // Build FFmpeg command
    let mut command = Command::new(&ffmpeg_path);

    // Set up progress reporting
    command.args(&args);

    let output = command
        .output()
        .await
        .context("Failed to execute ffmpeg")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("FFmpeg failed: {}", stderr);
    }

    Ok(())
}

/// Generate a WebM (VP8/Vorbis) preview as a fallback when VP9 is unavailable.
pub async fn generate_preview_vp8(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
) -> Result<()> {
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;

    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    // Determine total duration for percent
    let meta = probe_metadata(app, input_path).await.ok();
    let total_ms = meta.map(|m| (m.duration * 1000.0).max(1.0)).unwrap_or(1.0);

    // ffmpeg -i input -c:v libvpx ... -progress pipe:1
    let mut child = Command::new(&ffmpeg_path)
        .arg("-i").arg(input_path)
        .arg("-c:v").arg("libvpx")
        .arg("-b:v").arg("1500k")
        .arg("-vf").arg("scale=1280:-1")
        .arg("-c:a").arg("libvorbis")
        .arg("-b:a").arg("96k")
        .arg("-progress").arg("pipe:1")
        .arg("-nostats").arg("-v").arg("error")
        .arg("-y")
        .arg(output_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .context("Failed to execute ffmpeg for VP8 preview")?;

    app.emit_all("preview:start", serde_json::json!({ "inputPath": input_path })).ok();

    let stdout = child.stdout.take().context("Missing stdout pipe")?;
    let mut reader = BufReader::new(stdout).lines();
    while let Some(line) = reader.next_line().await? {
        if let Some((k,v)) = line.split_once('=') {
            if k == "out_time_ms" {
                if let Ok(ms) = v.trim().parse::<f64>() {
                    let pct = ((ms / total_ms) * 100.0).min(100.0).max(0.0);
                    app.emit_all("preview:progress", serde_json::json!({ "inputPath": input_path, "percent": pct, "timeMs": ms })).ok();
                }
            }
        }
    }

    let status = child.wait().await?;
    if !status.success() {
        anyhow::bail!("ffmpeg VP8 preview failed with status: {}", status);
    }

    app.emit_all("preview:success", serde_json::json!({ "inputPath": input_path, "outputPath": output_path })).ok();
    Ok(())
}

/**
 * Calculate export progress from FFmpeg stderr output
 * 
 * Parses frame information from FFmpeg's stderr stream
 * Returns percentage (0-100) based on frame count
 */
#[allow(dead_code)]
pub fn parse_progress(stderr_line: &str) -> Option<f64> {
    // FFmpeg outputs: "frame=  123 fps= 25 q=28.0 size=  1234kB time=00:00:05.00 bitrate=..."
    // We need to extract frame and time information
    
    let frame_start = stderr_line.find("frame=")?;
    let after_frame = &stderr_line[frame_start + 6..];
    
    let end = after_frame.find(' ').unwrap_or(0);
    let frame_str = &after_frame[..end].trim();
    
    frame_str.parse::<u64>().ok()?;
    
    // For now, just return None - actual progress calculation needs total frames
    // This will be enhanced in PR #8
    None
}

/// Generate a JPEG thumbnail at the given timestamp using ffmpeg, scaled to width 320px.
pub async fn generate_thumbnail(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
    timestamp_sec: f64,
) -> Result<()> {
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;

    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    let output = Command::new(&ffmpeg_path)
        .arg("-ss").arg(format!("{}", timestamp_sec))
        .arg("-i").arg(input_path)
        .arg("-vframes").arg("1")
        .arg("-vf").arg("scale=320:-1")
        .arg("-y")
        .arg(output_path)
        .output()
        .await
        .context("Failed to execute ffmpeg for thumbnail")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg thumbnail failed: {}", stderr);
    }

    Ok(())
}

/// Generate a WebM (VP9/Opus) preview suitable for HTML5 playback.
pub async fn generate_preview_webm(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
) -> Result<()> {
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;

    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    // Determine total duration for percent
    let meta = probe_metadata(app, input_path).await.ok();
    let total_ms = meta.map(|m| (m.duration * 1000.0).max(1.0)).unwrap_or(1.0);

    // ffmpeg -i input ... -progress pipe:1
    let mut child = Command::new(&ffmpeg_path)
        .arg("-i").arg(input_path)
        .arg("-c:v").arg("libvpx-vp9")
        .arg("-b:v").arg("2000k")
        .arg("-deadline").arg("good")
        .arg("-row-mt").arg("1")
        .arg("-speed").arg("4")
        .arg("-vf").arg("scale=1280:-1")
        .arg("-c:a").arg("libopus")
        .arg("-b:a").arg("96k")
        .arg("-progress").arg("pipe:1")
        .arg("-nostats").arg("-v").arg("error")
        .arg("-y")
        .arg(output_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .context("Failed to execute ffmpeg for preview")?;

    app.emit_all("preview:start", serde_json::json!({ "inputPath": input_path })).ok();

    let stdout = child.stdout.take().context("Missing stdout pipe")?;
    let mut reader = BufReader::new(stdout).lines();
    while let Some(line) = reader.next_line().await? {
        if let Some((k,v)) = line.split_once('=') {
            if k == "out_time_ms" {
                if let Ok(ms) = v.trim().parse::<f64>() {
                    let pct = ((ms / total_ms) * 100.0).min(100.0).max(0.0);
                    app.emit_all("preview:progress", serde_json::json!({ "inputPath": input_path, "percent": pct, "timeMs": ms })).ok();
                }
            }
        }
    }

    let status = child.wait().await?;
    if !status.success() {
        anyhow::bail!("ffmpeg preview failed with status: {}", status);
    }

    app.emit_all("preview:success", serde_json::json!({ "inputPath": input_path, "outputPath": output_path })).ok();
    Ok(())
}

/// Export a trimmed segment to MP4 with progress events
pub async fn export_trim(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
    start_sec: f64,
    end_sec: f64,
    fast_copy: bool,
) -> Result<()> {
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;

    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    let length = if end_sec > start_sec { end_sec - start_sec } else { 0.0 };
    let total_ms = (length * 1000.0).max(1.0);

    let mut args: Vec<String> = vec![
        "-ss".into(), format!("{:.3}", start_sec.max(0.0)),
        "-i".into(), input_path.into(),
        "-t".into(), format!("{:.3}", length.max(0.0)),
    ];

    if fast_copy {
        args.extend_from_slice(&["-c".into(), "copy".into()]);
    } else {
        args.extend_from_slice(&[
            "-c:v".into(), "libx264".into(),
            "-preset".into(), "veryfast".into(),
            "-crf".into(), "21".into(),
            "-pix_fmt".into(), "yuv420p".into(),
            "-c:a".into(), "aac".into(),
            "-b:a".into(), "160k".into(),
            "-movflags".into(), "+faststart".into(),
        ]);
    }

    // Structured progress
    args.extend_from_slice(&[
        "-progress".into(), "pipe:1".into(),
        "-nostats".into(), "-v".into(), "error".into(),
        "-y".into(), output_path.into(),
    ]);

    println!("[export_trim] ffmpeg args: {:?}", args);

    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .context("Failed to spawn ffmpeg export")?;

    let stdout = child.stdout.take().context("Missing stdout pipe")?;
    let mut reader = BufReader::new(stdout).lines();

    app.emit_all("export:start", serde_json::json!({ "outputPath": output_path }))
        .ok();

    while let Some(line) = reader.next_line().await? {
        if let Some((k, v)) = line.split_once('=') {
            if k == "out_time_ms" {
                if let Ok(ms) = v.trim().parse::<f64>() {
                    let pct = ((ms / total_ms) * 100.0).min(100.0).max(0.0);
                    app.emit_all("export:progress", serde_json::json!({ "percent": pct, "timeMs": ms }))
                        .ok();
                }
            }
        }
    }

    let status = child.wait().await?;
    if !status.success() {
        anyhow::bail!("ffmpeg export failed with status: {}", status);
    }

    app.emit_all("export:success", serde_json::json!({ "outputPath": output_path }))
        .ok();
    Ok(())
}

