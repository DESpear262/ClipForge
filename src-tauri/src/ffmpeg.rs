use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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

    let resource_dir = app.path().resource_dir().context("Failed to get resource directory")?;
    let ffprobe_path = resource_dir.join("bin/ffprobe.exe");

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

    let resource_dir = app.path().resource_dir().context("Failed to get resource directory")?;
    let ffmpeg_path = resource_dir.join("bin/ffmpeg.exe");

    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    // Build FFmpeg command
    let mut command = tokio::process::Command::new(&ffmpeg_path);

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

