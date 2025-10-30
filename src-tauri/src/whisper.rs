use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs::File, io::Read, path::PathBuf};
use tauri::{AppHandle, Manager};
use tokio::{process::Command, time::{sleep, Duration}};

/// Basic readme: Whisper transcription (OpenAI API) integration
///
/// This module extracts mono 16kHz PCM audio from a video via FFmpeg
/// and sends it to OpenAI's Whisper (`audio/transcriptions`) endpoint.
/// The full JSON response (segments + words when available) is persisted
/// under app_data_dir()/transcripts/<media_id>.json, and events are emitted:
/// - transcript:start { mediaId }
/// - transcript:progress { stage }
/// - transcript:success { mediaId, outputPath }
/// - transcript:error { mediaId, message }
///
/// For Sprint 2 PR#7 we prioritize the hosted API for speed-to-value.
/// A local/offline path (whisper.cpp) can be added later behind a feature.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptWord {
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub word: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: Option<i64>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptJson {
    pub clipId: Option<String>,
    pub mediaId: Option<i64>,
    pub sourcePath: Option<String>,
    pub createdAt: String,
    pub model: String,
    pub language: Option<String>,
    pub duration: Option<f64>,
    pub segments: Option<Vec<TranscriptSegment>>,
    pub words: Option<Vec<TranscriptWord>>,
    pub raw: serde_json::Value,
}

/// Extract a mono 16kHz PCM WAV from the input media using FFmpeg.
async fn extract_wav_mono_16k(app: &AppHandle, input_path: &str, out_path: &str) -> Result<()> {
    let ffmpeg_path = app
        .path_resolver()
        .resolve_resource("bin/ffmpeg.exe")
        .context("Failed to resolve ffmpeg path")?;
    if !ffmpeg_path.exists() {
        anyhow::bail!("ffmpeg.exe not found at: {:?}", ffmpeg_path);
    }

    let status = Command::new(&ffmpeg_path)
        .arg("-i").arg(input_path)
        .arg("-vn")
        .arg("-ac").arg("1")
        .arg("-ar").arg("16000")
        .arg("-c:a").arg("pcm_s16le")
        .arg("-y")
        .arg(out_path)
        .status()
        .await
        .context("Failed to execute ffmpeg for audio extract")?;
    if !status.success() {
        anyhow::bail!("ffmpeg audio extract failed with status: {}", status);
    }
    Ok(())
}

/// Call OpenAI Whisper transcription API with multipart form upload.
async fn openai_transcribe_wav(api_key: &str, wav_path: &str) -> Result<serde_json::Value> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(45)).build()?;
    let url = "https://api.openai.com/v1/audio/transcriptions";

    // Read file bytes once; rebuild multipart form per attempt
    let mut file = File::open(wav_path).context("Failed to open WAV for upload")?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).context("Failed to read WAV bytes")?;

    // Simple retry: 2 attempts on 429/5xx
    let mut last_err: Option<anyhow::Error> = None;
    for (i, backoff_ms) in [0u64, 250, 1000].iter().enumerate() {
        if i > 0 { sleep(Duration::from_millis(*backoff_ms)).await; }
        // Build form anew for each attempt (Form is not Clone)
        let part = reqwest::multipart::Part::bytes(buf.clone())
            .file_name("audio.wav")
            .mime_str("audio/wav")?;
        let form = reqwest::multipart::Form::new()
            .text("model", "whisper-1")
            .text("response_format", "verbose_json")
            .text("timestamp_granularities[]", "segment")
            .text("timestamp_granularities[]", "word")
            .part("file", part);

        match client.post(url).bearer_auth(api_key).multipart(form).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    let json: serde_json::Value = resp.json().await.context("Invalid OpenAI JSON")?;
                    return Ok(json);
                } else if !(resp.status().as_u16() == 429 || resp.status().is_server_error()) {
                    let status = resp.status();
                    let text = resp.text().await.unwrap_or_default();
                    return Err(anyhow::anyhow!("OpenAI error {}: {}", status, text));
                }
            }
            Err(e) => { last_err = Some(e.into()); }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("OpenAI request failed")))
}

/// Persist the transcript JSON under app_data_dir()/transcripts/<media_id>.json
fn persist_transcript(app: &AppHandle, media_id: i64, json: &TranscriptJson) -> Result<String> {
    let dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| anyhow::anyhow!("app_data_dir not found"))?
        .join("transcripts");
    std::fs::create_dir_all(&dir).ok();
    let path = dir.join(format!("{}.json", media_id));
    let bytes = serde_json::to_vec_pretty(json).context("Serialize transcript")?;
    std::fs::write(&path, bytes).context("Write transcript file")?;
    Ok(path.to_string_lossy().to_string())
}

/// Transcribe a media file and persist JSON. Emits progress events.
pub async fn transcribe_media(
    app: &AppHandle,
    media_id: i64,
    video_path: &str,
) -> Result<String> {
    app.emit_all("transcript:start", serde_json::json!({ "mediaId": media_id })).ok();

    // Prepare temp WAV output under app_data_dir()/tmp
    let tmp_dir: PathBuf = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| anyhow::anyhow!("app_data_dir not found"))?
        .join("tmp");
    std::fs::create_dir_all(&tmp_dir).ok();
    let wav_path = tmp_dir.join(format!("transcribe_{}.wav", media_id));

    app.emit_all("transcript:progress", serde_json::json!({ "mediaId": media_id, "stage": "extract" })).ok();
    extract_wav_mono_16k(app, video_path, &wav_path.to_string_lossy()).await?;

    let api_key = std::env::var("OPENAI_API_KEY").context("OPENAI_API_KEY not set")?;
    app.emit_all("transcript:progress", serde_json::json!({ "mediaId": media_id, "stage": "upload" })).ok();
    let start_at = std::time::Instant::now();
    let raw = openai_transcribe_wav(&api_key, &wav_path.to_string_lossy()).await?;

    // Build normalized JSON envelope
    let now = chrono::Utc::now().to_rfc3339();
    let model = raw.get("model").and_then(|v| v.as_str()).unwrap_or("whisper-1").to_string();
    let language = raw.get("language").and_then(|v| v.as_str()).map(|s| s.to_string());
    let duration = raw.get("duration").and_then(|v| v.as_f64());

    // Map segments/words if present in verbose_json
    let segments = raw.get("segments").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().map(|s| TranscriptSegment {
            id: s.get("id").and_then(|x| x.as_i64()),
            start: s.get("start").and_then(|x| x.as_f64()),
            end: s.get("end").and_then(|x| x.as_f64()),
            text: s.get("text").and_then(|x| x.as_str()).map(|t| t.to_string()),
        }).collect::<Vec<_>>()
    });
    let words = raw.get("words").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().map(|w| TranscriptWord {
            start: w.get("start").and_then(|x| x.as_f64()),
            end: w.get("end").and_then(|x| x.as_f64()),
            word: w.get("word").and_then(|x| x.as_str()).map(|t| t.to_string()),
        }).collect::<Vec<_>>()
    });

    let out = TranscriptJson {
        clipId: None,
        mediaId: Some(media_id),
        sourcePath: Some(video_path.to_string()),
        createdAt: now,
        model,
        language,
        duration,
        segments,
        words,
        raw,
    };

    app.emit_all("transcript:progress", serde_json::json!({ "mediaId": media_id, "stage": "save" })).ok();
    let out_path = persist_transcript(app, media_id, &out)?;
    // Cleanup temp WAV on success
    let _ = std::fs::remove_file(&wav_path);
    let elapsed_ms = start_at.elapsed().as_millis() as u64;
    app.emit_all("transcript:success", serde_json::json!({ "mediaId": media_id, "outputPath": out_path, "model": out.model, "duration": out.duration, "elapsedMs": elapsed_ms })).ok();
    Ok(out_path)
}


