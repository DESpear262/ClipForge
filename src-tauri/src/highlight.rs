use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::AppHandle;

/// Basic readme: Highlight extraction via OpenAI GPT-4o-mini
///
/// Loads a transcript JSON previously created by PR#7, summarizes timestamped
/// segments to the LLM, and requests a single clip highlight window. The
/// returned JSON must match:
/// { "tool": "setClipHighlight", "args": { "start_time": f64, "end_time": f64 } }
///
/// We validate and clamp the result (0..duration, length 5..90s, prefer 15..45s
/// via instruction but enforce boundaries here). The final selection is emitted
/// via `ai:highlight:success` and persisted to
/// app_data_dir()/transcripts/<media_id>.highlight.json.

#[derive(Debug, Clone, Deserialize)]
struct TranscriptFile {
    #[allow(dead_code)]
    clipId: Option<String>,
    mediaId: Option<i64>,
    sourcePath: Option<String>,
    duration: Option<f64>,
    segments: Option<Vec<TranscriptSegment>>, // verbose_json mapping
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct TranscriptSegment {
    start: Option<f64>,
    end: Option<f64>,
    text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ToolCall {
    tool: String,
    args: ToolArgs,
}

#[derive(Debug, Clone, Deserialize)]
struct ToolArgs {
    start_time: f64,
    end_time: f64,
}

#[derive(Debug, Clone, Serialize)]
struct HighlightJson {
    mediaId: i64,
    start: f64,
    end: f64,
    model: String,
    createdAt: String,
    transcriptPath: String,
}

fn transcript_path(app: &AppHandle, media_id: i64) -> Result<PathBuf> {
    let dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| anyhow::anyhow!("app_data_dir not found"))?
        .join("transcripts");
    Ok(dir.join(format!("{}.json", media_id)))
}

fn highlight_output_path(app: &AppHandle, media_id: i64) -> Result<PathBuf> {
    let dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| anyhow::anyhow!("app_data_dir not found"))?
        .join("transcripts");
    fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.highlight.json", media_id)))
}

fn load_transcript(app: &AppHandle, media_id: i64) -> Result<(TranscriptFile, String)> {
    let path = transcript_path(app, media_id)?;
    if !path.exists() {
        anyhow::bail!("Transcript not found for media {}", media_id);
    }
    let txt = fs::read_to_string(&path).context("Failed to read transcript file")?;
    let json: TranscriptFile = serde_json::from_str(&txt).context("Invalid transcript JSON")?;
    Ok((json, path.to_string_lossy().to_string()))
}

#[derive(Serialize)]
struct ChatMessage { role: &'static str, content: String }

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    response_format: serde_json::Value,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice { message: ChatResponseMessage }

#[derive(Deserialize)]
struct ChatResponseMessage { content: String }

async fn call_llm(api_key: &str, segments: &[TranscriptSegment], duration: f64) -> Result<ToolCall> {
    let client = reqwest::Client::new();
    // Reduce payload: map to minimal array
    let compact: Vec<serde_json::Value> = segments
        .iter()
        .filter_map(|s| {
            Some(serde_json::json!({
                "start": s.start?,
                "end": s.end?,
                "text": s.text.clone().unwrap_or_default(),
            }))
        })
        .collect();

    let system = "You are selecting a single high-engagement highlight from a transcript.\nReturn JSON only in this exact shape with media-relative seconds:\n{\n  \"tool\": \"setClipHighlight\",\n  \"args\": { \"start_time\": <number>, \"end_time\": <number> }\n}\nConstraints: 0 <= start < end <= duration; prefer 15-45s; clamp to 5-90s if needed. No commentary.";
    let user = serde_json::json!({
        "duration": duration,
        "segments": compact,
    })
    .to_string();

    let req = ChatRequest {
        model: "gpt-4o-mini".to_string(),
        messages: vec![
            ChatMessage { role: "system", content: system.to_string() },
            ChatMessage { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: serde_json::json!({ "type": "json_object" }),
    };

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&req)
        .send()
        .await
        .context("OpenAI highlight request failed")?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("OpenAI error {}: {}", status, text);
    }
    let body: ChatResponse = resp.json().await.context("Invalid chat JSON")?;
    let content = body
        .choices
        .get(0)
        .map(|c| c.message.content.clone())
        .unwrap_or_else(|| "{}".to_string());
    let tool: ToolCall = serde_json::from_str(&content).context("Tool JSON parse failed")?;
    if tool.tool != "setClipHighlight" { anyhow::bail!("Unexpected tool: {}", tool.tool); }
    Ok(tool)
}

fn clamp_times(start: f64, end: f64, duration: f64) -> (f64, f64) {
    let mut s = start.max(0.0).min(duration.max(0.0));
    let mut e = end.max(0.0).min(duration.max(0.0));
    if e <= s { e = (s + 5.0).min(duration); }
    let mut len = e - s;
    if len < 5.0 { e = (s + 5.0).min(duration); len = e - s; }
    if len > 90.0 { e = s + 90.0; if e > duration { s = (duration - 90.0).max(0.0); e = duration; } }
    (s, e)
}

pub async fn find_highlight(app: &AppHandle, media_id: i64) -> Result<(f64, f64, String)> {
    app.emit_all("ai:highlight:start", serde_json::json!({ "mediaId": media_id })).ok();
    let (transcript, transcript_path) = load_transcript(app, media_id)?;
    let duration = transcript.duration.unwrap_or(0.0);
    if duration <= 0.0 { anyhow::bail!("Transcript missing duration"); }
    let segs = transcript.segments.unwrap_or_default();
    if segs.is_empty() { anyhow::bail!("Transcript missing segments"); }

    let api_key = std::env::var("OPENAI_API_KEY").context("OPENAI_API_KEY not set")?;
    let tool = call_llm(&api_key, &segs, duration).await?;
    let (start, end) = clamp_times(tool.args.start_time, tool.args.end_time, duration);

    let out_path = highlight_output_path(app, media_id)?;
    let data = HighlightJson {
        mediaId: media_id,
        start,
        end,
        model: "gpt-4o-mini".to_string(),
        createdAt: chrono::Utc::now().to_rfc3339(),
        transcriptPath: transcript_path.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&data).context("Serialize highlight")?;
    fs::write(&out_path, bytes).context("Write highlight file")?;

    let out_str = out_path.to_string_lossy().to_string();
    app.emit_all("ai:highlight:success", serde_json::json!({ "mediaId": media_id, "start": start, "end": end, "outputPath": out_str })).ok();
    Ok((start, end, out_str))
}


