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

/// Specification of a single video input used in timeline segment export.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportVideoInput {
    pub path: String,
    /// Seek position into the media in seconds (absolute media time)
    pub seek: f64,
    /// Duration to include from this media, in seconds
    pub duration: f64,
    /// Offset of this stream within the output fence, in seconds
    pub offset: f64,
    /// Optional linear gain for audio from this media (0..1). If provided for video, applies to its audio track.
    pub gain: Option<f64>,
    /// True if this is the base video stream (selected item). Required.
    pub is_base: bool,
}

/// Specification of a single audio input used in timeline segment export.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportAudioInput {
    pub path: String,
    pub seek: f64,
    pub duration: f64,
    pub offset: f64,
    pub gain: Option<f64>,
}

/// Specification of a text overlay to render over the segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOverlayInput {
    pub text: String,
    pub offset: f64,
    pub duration: f64,
    /// Relative 0..1 position
    pub x: f64,
    pub y: f64,
    pub font_size: Option<u32>,
    pub color: Option<String>,
    pub align: Option<String>, // center | left | right
}

/// Request payload to export a timeline segment bounded by [fence_start, fence_end).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTimelineRequest {
    pub fence_start: f64,
    pub fence_end: f64,
    pub videos: Vec<ExportVideoInput>,
    pub audios: Vec<ExportAudioInput>,
    pub overlays: Vec<ExportOverlayInput>,
    /// "source" | "720p" | "1080p"
    pub resolution: Option<String>,
    pub output_path: String,
    /// Audio enhancements
    pub normalize_enabled: Option<bool>,
    pub normalize_target_lufs: Option<f64>,
    pub normalize_true_peak: Option<f64>,
    pub fade_in_sec: Option<f64>,
    pub fade_out_sec: Option<f64>,
}

/// Export a composed timeline segment to MP4 with progress events.
pub async fn export_timeline_segment(app: &AppHandle, req: ExportTimelineRequest) -> Result<()> {
    println!(
        "[export_timeline_segment] req: fence=[{:.3},{:.3}] videos={} audios={} overlays={} res={:?}",
        req.fence_start, req.fence_end, req.videos.len(), req.audios.len(), req.overlays.len(), req.resolution
    );
    // Emit structured info to frontend
    app.emit_all("export:graph", serde_json::json!({
        "fence": {"start": req.fence_start, "end": req.fence_end},
        "videos": req.videos.iter().map(|v| serde_json::json!({"path": v.path, "seek": v.seek, "dur": v.duration, "offset": v.offset, "isBase": v.is_base})).collect::<Vec<_>>(),
        "audios": req.audios.iter().map(|a| serde_json::json!({"path": a.path, "seek": a.seek, "dur": a.duration, "offset": a.offset})).collect::<Vec<_>>(),
        "overlays": req.overlays.iter().map(|o| serde_json::json!({"text": o.text, "offset": o.offset, "dur": o.duration})).collect::<Vec<_>>(),
        "resolution": req.resolution,
    })).ok();
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;
    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    let fence_len = (req.fence_end - req.fence_start).max(0.0);
    let total_ms = (fence_len * 1000.0).max(1.0);

    // Inputs: videos first, then audios
    let mut cmd = Command::new(&ffmpeg_path);
    // Video inputs
    for v in &req.videos {
        cmd.arg("-ss").arg(format!("{:.3}", v.seek.max(0.0)))
            .arg("-t").arg(format!("{:.3}", v.duration.max(0.0)))
            .arg("-i").arg(&v.path);
    }
    // Audio-only inputs
    for a in &req.audios {
        cmd.arg("-ss").arg(format!("{:.3}", a.seek.max(0.0)))
            .arg("-t").arg(format!("{:.3}", a.duration.max(0.0)))
            .arg("-i").arg(&a.path);
    }

    // Build filter_complex
    let mut filter = String::new();

    // Prepare video streams: setpts, optional time shift for overlays
    // Identify base index among video streams
    let base_idx = req.videos.iter().position(|v| v.is_base).unwrap_or(0);
    // Create normalized labels for video inputs
    // Map input stream to labels: [v{i}:v] -> [vv{i}] (time-normalized)
    for i in 0..req.videos.len() {
        // Each input video has stream index i
        // First video input is index 0 from the ffmpeg perspective
        // We always reset PTS to start from 0 so overlay offsets are relative to fence start
        filter.push_str(&format!("[{idx}:v]setpts=PTS-STARTPTS[vv{idx}];",
            idx = i));
    }

    // Compose video: start with base
    filter.push_str(&format!("[vv{b}]format=yuv420p[vcur];", b = base_idx));

    // Overlay other video streams onto base with time offsets
    for (i, v) in req.videos.iter().enumerate() {
        if i == base_idx { continue; }
        let offset = v.offset.max(0.0);
        // Shift overlay stream forward by offset seconds, scale to PiP, place bottom-right
        // Use scale2ref to size overlay relative to current base frame size
        filter.push_str(&format!(
            "[vv{idx}]setpts=PTS+{ofs}/TB[ov{idx}];" // time shift
        , idx=i, ofs=offset));
        // Scale overlay to ~28% width of base (even dimensions), then overlay at bottom-right with 12px margin
        filter.push_str(&format!(
            "[ov{idx}][vcur]scale2ref=w=trunc(iw*0.28/2)*2:h=trunc(ih*0.28/2)*2[ovS{idx}][ref{idx}];" 
            , idx=i));
        filter.push_str(&format!(
            "[vcur][ovS{idx}]overlay=shortest=0:eof_action=pass:x=main_w-overlay_w-12:y=main_h-overlay_h-12[vcur];",
            idx=i));
    }

    // Apply text overlays (drawtext) in sequence
    if !req.overlays.is_empty() {
        // Try a common Windows font
        let font_path = "C\\\\Windows\\\\Fonts\\\\arial.ttf";
        for (_j, ov) in req.overlays.iter().enumerate() {
            let x_expr = format!("(w*{:.6})-text_w/2", ov.x);
            let y_expr = format!("(h*{:.6})-text_h/2", ov.y);
            let fs = ov.font_size.unwrap_or(24);
            let color = ov.color.clone().unwrap_or_else(|| "white".to_string());
            let start = ov.offset.max(0.0);
            let end = (ov.offset + ov.duration).max(start);
            // Escape single quotes in text
            let txt = ov.text.replace("'", "\\'");
            filter.push_str(&format!(
                "[vcur]drawtext=fontfile='{font}':text='{text}':fontsize={fs}:fontcolor={color}:x={x}:y={y}:enable='between(t,{st:.3},{en:.3})'[vcur];",
                font=font_path, text=txt, fs=fs, color=color, x=x_expr, y=y_expr, st=start, en=end));
        }
    }

    // Final video label: use current composed video as output label
    // Avoid injecting an invalid trim; map [vcur] directly

    // Prepare audio streams: delay + gain, then mix
    let mut audio_input_count = 0usize;
    let mut audio_labels: Vec<String> = Vec::new();

    // NOTE: Do NOT assume video inputs have audio; referencing [i:a] will fail if absent.
    // Video-related audio is omitted here to avoid filtergraph errors. Use explicit `audios` list only.
    // Then dedicated audio inputs (they come after video inputs in ffmpeg command)
    for (k, a) in req.audios.iter().enumerate() {
        let input_idx = req.videos.len() + k;
        let off_ms = (a.offset.max(0.0) * 1000.0).round() as i64;
        let gain = a.gain.unwrap_or(1.0).max(0.0);
        let lbl = format!("aa{}", k);
        filter.push_str(&format!(
            "[{idx}:a]asetpts=PTS-STARTPTS,adelay={ms}|{ms},volume={gain},atrim=duration={dur},apad[{lbl}];",
            idx=input_idx, ms=off_ms, gain=gain, dur=fence_len, lbl=lbl));
        audio_labels.push(lbl);
        audio_input_count += 1;
    }

    if audio_input_count == 0 {
        // Synthesize silence matching fence length
        let dur = fence_len.max(0.0);
        filter.push_str(&format!(
            "anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration={:.3}[aout];",
            dur));
    } else if audio_input_count == 1 {
        filter.push_str(&format!("[{}]anull[aout];", audio_labels[0]));
    } else {
        // Build amix with N inputs
        let mut mix_in = String::new();
        for lbl in &audio_labels { mix_in.push_str(&format!("[{}]", lbl)); }
        filter.push_str(&format!(
            "{mix}amix=inputs={n}:normalize=0:duration=longest[aout];",
            mix = mix_in, n = audio_input_count));
    }

    // Audio normalization (loudnorm) and limiter
    let mut audio_map = String::from("[aout]");
    let normalize = req.normalize_enabled.unwrap_or(false);
    if normalize {
        let target = req.normalize_target_lufs.unwrap_or(-14.0);
        let tp = req.normalize_true_peak.unwrap_or(-1.0);
        filter.push_str(&format!(
            "[aout]loudnorm=I={ti:.1}:TP={tp:.1}:LRA=11:measured_I=-14:print_format=summary[anorm];",
            ti = target, tp = tp));
        audio_map = String::from("[anorm]");
    }
    // Apply soft limiter to avoid inter-sample peaks
    filter.push_str(&format!("{src}alimiter=limit=-1.0dB[a_limited];", src = audio_map));
    audio_map = String::from("[a_limited]");

    // Master fades
    let fin = req.fade_in_sec.unwrap_or(0.0).max(0.0);
    let fout = req.fade_out_sec.unwrap_or(0.0).max(0.0);
    if fin > 0.0 {
        filter.push_str(&format!("{src}afade=t=in:ss=0:d={:.3}[a_fi];", fin, src = audio_map));
        audio_map = String::from("[a_fi]");
    }
    if fout > 0.0 && fence_len > 0.0 {
        let st = (fence_len - fout).max(0.0);
        filter.push_str(&format!("{src}afade=t=out:st={:.3}:d={:.3}[a_fo];", st, fout, src = audio_map));
        audio_map = String::from("[a_fo]");
    }
    // Cap audio to fence length to avoid infinite padding from apad
    filter.push_str(&format!("{src}atrim=duration={:.3},asetpts=PTS-STARTPTS[a_cap];", fence_len.max(0.0), src = audio_map));
    audio_map = String::from("[a_cap]");

    // Cap video to fence length explicitly and hand off to a final label
    filter.push_str(&format!("[vcur]trim=duration={:.3}[vout];", fence_len.max(0.0)));

    // Optional scaling on final video
    let mut map_video = String::from("[vout]");
    if let Some(res) = req.resolution.as_ref() {
        let (w, h) = match res.as_str() { 
            "720p" => (1280, -2),
            "1080p" => (1920, -2),
            _ => (0, 0),
        };
        if w > 0 { // apply scale
            filter.push_str(&format!("[vout]scale={}:{}[vscaled];", w, h));
            map_video = String::from("[vscaled]");
        }
    }

    // Assemble command args
    cmd.arg("-filter_complex").arg(&filter)
        .arg("-map").arg(map_video)
        .arg("-map").arg(audio_map)
        .arg("-c:v").arg("libx264")
        .arg("-preset").arg("veryfast")
        .arg("-crf").arg("21")
        .arg("-pix_fmt").arg("yuv420p")
        .arg("-c:a").arg("aac")
        .arg("-b:a").arg("160k")
        .arg("-movflags").arg("+faststart")
        .arg("-progress").arg("pipe:1")
        .arg("-nostats").arg("-v").arg("error")
        .arg("-y").arg(&req.output_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

    println!("[export_timeline_segment] launching ffmpeg");
    // Debug: print filter graph (full arg introspection not available on tokio::process::Command)
    println!("[export_timeline_segment] filter_complex: {}", filter);

    // Route stderr for diagnostics
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().context("Failed to spawn ffmpeg timeline export")?;

    let stdout = child.stdout.take().context("Missing stdout pipe")?;
    let mut reader = BufReader::new(stdout).lines();

    // Read stderr concurrently and forward as events for diagnosis
    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let mut r = BufReader::new(stderr).lines();
            loop {
                match r.next_line().await {
                    Ok(Some(line)) => {
                        let _ = app_clone.emit_all("export:stderr", serde_json::json!({ "line": line }));
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        });
    }

    app.emit_all("export:start", serde_json::json!({ "outputPath": req.output_path }))
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
        let msg = format!("ffmpeg timeline export failed with status: {}", status);
        app.emit_all("export:error", serde_json::json!({ "message": msg })).ok();
        anyhow::bail!("{}", msg);
    }

    app.emit_all("export:success", serde_json::json!({ "outputPath": req.output_path }))
        .ok();
    Ok(())
}

/// Transcode a recording (WebM) to MP4 (H.264/AAC) with faststart enabled
pub async fn transcode_recording_to_mp4(
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

    let output = Command::new(&ffmpeg_path)
        .arg("-i").arg(input_path)
        .arg("-c:v").arg("libx264")
        .arg("-preset").arg("veryfast")
        .arg("-crf").arg("23")
        .arg("-pix_fmt").arg("yuv420p")
        .arg("-c:a").arg("aac")
        .arg("-b:a").arg("160k")
        .arg("-movflags").arg("+faststart")
        .arg("-y")
        .arg(output_path)
        .output()
        .await
        .context("Failed to execute ffmpeg transcode")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg transcode failed: {}", stderr);
    }

    Ok(())
}

/// Compose a PiP video by overlaying `overlay_video_path` on top of `base_video_path` and
/// optionally using `audio_path` as the master audio. Produces an MP4 (H.264/AAC).
pub async fn compose_pip(
    app: &tauri::AppHandle,
    base_video_path: &str,
    overlay_video_path: &str,
    audio_path: Option<&str>,
    corner: Option<&str>, // "br"|"bl"|"tr"|"tl"
    pip_width_px: Option<u32>,
    margin_px: Option<u32>,
    output_path: &str,
) -> Result<()> {
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;
    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    let pip_w = pip_width_px.unwrap_or(480);
    let margin = margin_px.unwrap_or(16);
    let c = corner.unwrap_or("br");
    let x_expr = match c {
        "bl" => format!("{}", margin),
        "tr" => format!("W-w-{}", margin),
        "tl" => format!("{}", margin),
        _ => format!("W-w-{}", margin), // br
    };
    let y_expr = match c {
        "tr" => format!("{}", margin),
        "tl" => format!("{}", margin),
        _ => format!("H-h-{}", margin),
    };

    // Build filter: scale overlay to pip_w, add simple 2px border pad, overlay onto base
    let filter = format!(
        "[1:v]scale={}: -1,format=rgba,pad=iw+4:ih+4:2:2:black[cam];[0:v][cam]overlay=x={}:y={}[vout]",
        pip_w, x_expr, y_expr
    );

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.arg("-i").arg(base_video_path)
        .arg("-i").arg(overlay_video_path);
    if let Some(a) = audio_path.as_ref() { cmd.arg("-i").arg(a); }

    cmd.arg("-filter_complex").arg(&filter)
        .arg("-map").arg("[vout]")
        .arg("-c:v").arg("libx264")
        .arg("-preset").arg("veryfast")
        .arg("-crf").arg("23")
        .arg("-pix_fmt").arg("yuv420p");

    if audio_path.is_some() {
        // Map mic audio; if present as third input, it is index 2
        cmd.arg("-map").arg("2:a:0")
            .arg("-c:a").arg("aac")
            .arg("-b:a").arg("160k");
    }

    cmd.arg("-shortest")
        .arg("-movflags").arg("+faststart")
        .arg("-y")
        .arg(output_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());

    println!("[compose_pip] filter_complex: {}", filter);
    println!("[compose_pip] Executing ffmpeg with inputs: base={}, overlay={}, audio={:?}", base_video_path, overlay_video_path, audio_path);
    let output = cmd.output().await.context("Failed to execute ffmpeg compose_pip")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("[compose_pip] FFmpeg stderr: {}", stderr);
        anyhow::bail!("compose_pip failed: {}", stderr);
    }
    println!("[compose_pip] FFmpeg execution successful");
    Ok(())
}

/// Transcode audio-only WebM/Opus to M4A (AAC)
pub async fn transcode_audio_to_m4a(
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

    let output = Command::new(&ffmpeg_path)
        .arg("-i").arg(input_path)
        .arg("-vn")
        .arg("-c:a").arg("aac")
        .arg("-b:a").arg("160k")
        .arg("-y")
        .arg(output_path)
        .output()
        .await
        .context("Failed to execute ffmpeg audio transcode")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg transcode failed: {}", stderr);
    }

    Ok(())
}

/// Mux a silent video with an external audio track into a single MP4
pub async fn mux_video_audio(
    app: &AppHandle,
    video_path: &str,
    audio_path: &str,
    output_path: &str,
) -> Result<()> {
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;

    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    let output = Command::new(&ffmpeg_path)
        .arg("-i").arg(video_path)
        .arg("-i").arg(audio_path)
        .arg("-c:v").arg("copy")
        .arg("-c:a").arg("aac")
        .arg("-b:a").arg("160k")
        .arg("-shortest")
        .arg("-movflags").arg("+faststart")
        .arg("-y")
        .arg(output_path)
        .output()
        .await
        .context("Failed to execute ffmpeg mux")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg mux failed: {}", stderr);
    }

    Ok(())
}

