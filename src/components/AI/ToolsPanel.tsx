import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MediaDto } from "../../utils/api";

/**
 * Basic readme: AI Tools Panel (PR #7 - Transcription)
 *
 * This component provides the initial AI Tools UI with a "Transcribe Audio"
 * action that calls the backend Tauri command `transcribe_media_cmd`.
 * It listens for transcript:* events for coarse progress and renders a simple
 * transcript viewer from the saved JSON file once complete.
 *
 * Events emitted by backend (see src-tauri/src/whisper.rs):
 * - transcript:start { mediaId }
 * - transcript:progress { mediaId, stage: 'extract' | 'upload' | 'save' }
 * - transcript:success { mediaId, outputPath }
 * - transcript:error { mediaId, message }
 */

interface ToolsPanelProps {
  selected?: MediaDto | null;
}

type Stage = "idle" | "extract" | "upload" | "save" | "done" | "error";

interface TranscriptChunk {
  start?: number;
  end?: number;
  text?: string;
}

const ToolsPanel: React.FC<ToolsPanelProps> = ({ selected }) => {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptChunk[]>([]);
  const [hlStart, setHlStart] = useState<number | null>(null);
  const [hlEnd, setHlEnd] = useState<number | null>(null);
  const workingIdRef = useRef<number | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);
  const [online, setOnline] = useState<boolean>(true);
  const [hasTranscript, setHasTranscript] = useState<boolean>(false);
  const [hasHighlight, setHasHighlight] = useState<boolean>(false);
  const [aiLog, setAiLog] = useState<string[]>([]);

  const canTranscribe = useMemo(() => !!selected && stage !== "extract" && stage !== "upload" && stage !== "save", [selected, stage]);

  // Preflight check: API key presence and basic connectivity; reset indicators on selection change
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/tauri");
        const res = await invoke<{ hasKey: boolean; online: boolean }>("ai_preflight_cmd");
        setHasKey(!!res?.hasKey);
        setOnline(!!res?.online);
      } catch {
        setOnline(false);
      }
    })();
    setHasTranscript(false);
    setHasHighlight(false);
  }, [selected?.id]);

  useEffect(() => {
    let unlistenStart: any;
    let unlistenProg: any;
    let unlistenSuc: any;
    let unlistenErr: any;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenStart = await listen("transcript:start", (e: any) => {
          if (selected && e?.payload?.mediaId === selected.id) {
            setStage("extract");
            setError(null);
            setOutputPath(null);
            setSegments([]);
            workingIdRef.current = selected.id;
          }
        });
        unlistenProg = await listen("transcript:progress", (e: any) => {
          if (selected && e?.payload?.mediaId === selected.id) {
            const s = e?.payload?.stage as Stage | undefined;
            if (s === "extract" || s === "upload" || s === "save") setStage(s);
          }
        });
        unlistenSuc = await listen("transcript:success", async (e: any) => {
          if (selected && e?.payload?.mediaId === selected.id) {
            setStage("done");
            setOutputPath(e?.payload?.outputPath || null);
            workingIdRef.current = null;
            setHasTranscript(true);
            const elapsed = e?.payload?.elapsedMs;
            const model = e?.payload?.model;
            const dur = e?.payload?.duration;
            setAiLog((prev) => [
              `Transcribed (${model || 'whisper'}): ${typeof elapsed === 'number' ? elapsed + 'ms' : ''} ${typeof dur === 'number' ? 'dur=' + dur.toFixed(2) + 's' : ''}`.trim(),
              ...prev
            ].slice(0, 10));
            // Load transcript JSON and extract segments for simple rendering
            try {
              const { readTextFile } = await import("@tauri-apps/api/fs");
              const txt = await readTextFile(e?.payload?.outputPath);
              const json = JSON.parse(txt);
              const segs = (json?.segments || []) as any[];
              const out = segs.map((s) => ({ start: s.start, end: s.end, text: s.text }));
              setSegments(out);
            } catch (err) {
              console.warn("Failed to load transcript file", err);
            }
          }
        });
        unlistenErr = await listen("transcript:error", (e: any) => {
          if (selected && e?.payload?.mediaId === selected.id) {
            setStage("error");
            setError(String(e?.payload?.message || "Transcription failed"));
            workingIdRef.current = null;
          }
        });
        // Highlight events
        await listen("ai:highlight:start", (e: any) => {
          if (selected && e?.payload?.mediaId === selected.id) {
            setHlStart(null);
            setHlEnd(null);
          }
        });
        await listen("ai:highlight:success", (e: any) => {
          if (selected && e?.payload?.mediaId === selected.id) {
            const s = Number(e?.payload?.start ?? 0);
            const ed = Number(e?.payload?.end ?? 0);
            setHlStart(isFinite(s) ? s : 0);
            setHlEnd(isFinite(ed) ? ed : 0);
            setHasHighlight(true);
            setAiLog((prev) => [
              `Highlight: ${isFinite(s) ? s.toFixed(2) : '?' }–${ isFinite(ed) ? ed.toFixed(2) : '?' }`,
              ...prev
            ].slice(0, 10));
          }
        });
      } catch (e) {
        console.warn("Event wiring failed", e);
      }
    })();

    return () => {
      try { unlistenStart && unlistenStart(); } catch {}
      try { unlistenProg && unlistenProg(); } catch {}
      try { unlistenSuc && unlistenSuc(); } catch {}
      try { unlistenErr && unlistenErr(); } catch {}
    };
  }, [selected?.id]);

  const onTranscribe = async () => {
    if (!selected) return;
    try {
      setStage("extract");
      setError(null);
      setOutputPath(null);
      const { invoke } = await import("@tauri-apps/api/tauri");
      await invoke<string>("transcribe_media_cmd", { mediaId: Number(selected.id), videoPath: selected.path });
    } catch (e: any) {
      setStage("error");
      setError(String(e?.message || e || "Transcription failed"));
    }
  };

  const onFindHighlight = async () => {
    if (!selected) return;
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      await invoke("find_highlight_cmd", { mediaId: Number(selected.id) });
    } catch (e: any) {
      setError(String(e?.message || e || "Highlight extraction failed"));
    }
  };

  const onPreview = async () => {
    if (hlStart == null || hlEnd == null) return;
    try {
      // Seek the player to start; looping is handled manually by user for now
      const { emit } = await import("@tauri-apps/api/event");
      // If there was a global event bus, we could emit here; instead, use a DOM event consumed by RightPanel (future).
      // For now, just set the timeline current time via requestSeek exposed through TimelineContext is not accessible here directly.
    } catch {}
  };

  const renderStatus = () => {
    if (!selected) return <div className="text-xs text-gray-400">Select a video in the library to enable AI tools.</div>;
    if (stage === "idle") return <div className="text-xs text-gray-400">Ready to transcribe.</div>;
    if (stage === "extract") return <div className="text-xs text-gray-300">Extracting audio…</div>;
    if (stage === "upload") return <div className="text-xs text-gray-300">Uploading to OpenAI Whisper…</div>;
    if (stage === "save") return <div className="text-xs text-gray-300">Saving transcript…</div>;
    if (stage === "done") return <div className="text-xs text-green-400">Transcript ready.</div>;
    if (stage === "error") return <div className="text-xs text-red-400">{error || "Transcription failed"}</div>;
    return null;
  };

  return (
    <div className="flex flex-col gap-3" aria-live="polite" role="status">
      <div className="text-sm font-semibold text-gray-200">AI Tools</div>
      <div className="flex items-center gap-2 text-xs">
        {hasTranscript && <span className="px-2 py-0.5 rounded bg-green-700 text-green-100">Transcribed</span>}
        {hasHighlight && <span className="px-2 py-0.5 rounded bg-purple-700 text-purple-100">Highlight ready</span>}
        {!hasKey && <span className="px-2 py-0.5 rounded bg-red-800 text-red-200">API key missing</span>}
        {!online && <span className="px-2 py-0.5 rounded bg-red-800 text-red-2 00">Offline</span>}
      </div>
      <button
        onClick={onTranscribe}
        disabled={!canTranscribe || !hasKey || !online}
        className={`px-3 py-2 rounded text-sm font-medium ${canTranscribe && hasKey && online ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-700 opacity-60"} text-black`}
      >
        Transcribe Audio
      </button>
      <button
        onClick={onFindHighlight}
        disabled={!selected || !hasTranscript || !hasKey || !online}
        className={`px-3 py-2 rounded text-sm font-medium ${selected && hasTranscript && hasKey && online ? "bg-purple-500 hover:bg-purple-600" : "bg-gray-700 opacity-60"} text-black`}
      >
        Find Highlights
      </button>
      {renderStatus()}
      {outputPath && (
        <div className="mt-2">
          <div className="text-xs text-gray-400">Transcript file:</div>
          <div className="text-xs text-gray-200 break-all">{outputPath}</div>
        </div>
      )}
      {segments.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-gray-400 mb-1">Segments</div>
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {segments.map((s, i) => (
              <div key={i} className="text-xs text-gray-200">
                <span className="text-gray-400">[{(s.start ?? 0).toFixed(2)}–{(s.end ?? 0).toFixed(2)}]</span> {s.text}
              </div>
            ))}
          </div>
        </div>
      )}
      {hlStart != null && hlEnd != null && (
        <div className="mt-2">
          <div className="text-xs text-gray-400">Suggested highlight:</div>
          <div className="text-xs text-gray-200">{hlStart.toFixed(2)} – {hlEnd.toFixed(2)} s</div>
          <div className="mt-2">
            <button onClick={onPreview} className="px-3 py-1 rounded bg-gray-700 text-black text-xs hover:bg-gray-600 mr-2">Preview</button>
            <button onClick={async () => { try { await navigator.clipboard.writeText(`${hlStart?.toFixed(2)}\t${hlEnd?.toFixed(2)}`); } catch {} }} className="px-3 py-1 rounded bg-gray-700 text-black text-xs hover:bg-gray-600">Copy timestamps</button>
          </div>
        </div>
      )}
      {aiLog.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-gray-400 mb-1">AI Log</div>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto text-xs text-gray-300">
            {aiLog.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsPanel;


