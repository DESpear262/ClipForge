import React, { useEffect, useState } from "react";
import { useRecorder } from "../../hooks/useRecorder";
import { importVideo } from "../../utils/api";
import { exists } from "@tauri-apps/api/fs";
import { useToastContext } from "../../context/ToastContext";
import { useSystemAudioLevel } from "../../hooks/useSystemAudioLevel";
import { useMicrophone } from "../../hooks/useMicrophone";

/**
 * ScreenRecorder: Minimal UI for PR#1
 * - Lists capture sources (desktop only for now)
 * - Start/Stop recording
 * - Shows elapsed time
 * - Auto-imports finished recording into media library
 */
const ScreenRecorder: React.FC = () => {
  const { state, start, stop, listSources, prettyElapsed } = useRecorder();
  const { showToast } = useToastContext();
  const sys = useSystemAudioLevel();
  const mic = useMicrophone();
  const [useMicForScreen, setUseMicForScreen] = useState(false);
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<string>("desktop");
  const [fps, setFps] = useState<number>(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await listSources();
      setSources(list.map((s) => ({ id: s.id, name: s.name })));
      if (list.length > 0) setSelected(list[0].id);
    })();
  }, [listSources]);

  const handleStart = async () => {
    if (busy || state.isRecording) return;
    setBusy(true);
    try {
      if (useMicForScreen && !mic.state.isRecording) {
        console.log("[ScreenRecorder] Starting mic voiceover recording");
        await mic.startRecording();
      }
      await start({ fps });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (busy || !state.isRecording) return;
    setBusy(true);
    try {
      const out = await stop();
      if (out) {
        try {
          const ok = await exists(out);
          if (!ok) {
            showToast("Recording failed to save. Check log for ffmpeg errors.", "error", 5000);
            return;
          }
          let finalPath = out;
          if (useMicForScreen && mic.state.isRecording) {
            console.log("[ScreenRecorder] Stopping mic and muxing into screen recording");
            const micOut = await mic.stopRecording();
            if (micOut?.path) {
              const { invoke } = await import("@tauri-apps/api/tauri");
              const muxPath = out.replace(/\.mp4$/i, "_vo.mp4");
              console.log("[ScreenRecorder] Mux", { video: out, audio: micOut.path, out: muxPath });
              await invoke<string>("mux_video_audio_cmd", { videoPath: out, audioPath: micOut.path, outputPath: muxPath });
              finalPath = muxPath;
            }
          }
          const media = await importVideo(finalPath);
          const ev = new CustomEvent("media-imported", { detail: media });
          window.dispatchEvent(ev);
        } catch (e) {
          console.warn("Auto-import failed:", e);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-300 col-span-2">
          <div className="mb-1">Source</div>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-300">
          <div className="mb-1">FPS</div>
          <input
            type="number"
            min={15}
            max={120}
            step={15}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value || 60))}
            className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full"
            title="Frames per second"
          />
        </label>
        {/* Screen recording captures system audio automatically when available. */}
      </div>
      <div>
        <div className="text-xs text-gray-300 mb-1">System audio level {sys.state.deviceLabel ? `(${sys.state.deviceLabel})` : ""}</div>
        <div className="w-full h-2 bg-gray-300 rounded overflow-hidden" title={`${sys.levelDb} dB`}>
          <div className="h-full" style={{ width: `${Math.max(0, Math.min(1, sys.state.level)) * 100}%`, background: (sys.state.level > 0.85 ? "#ef4444" : sys.state.level > 0.6 ? "#f59e0b" : "#10b981") }} />
        </div>
        {!sys.state.active && <div className="text-[11px] text-gray-400 mt-1">No loopback device detected. Enable "Stereo Mix" or a virtual cable to monitor system audio.</div>}
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input type="checkbox" checked={useMicForScreen} onChange={async (e) => {
          setUseMicForScreen(e.target.checked);
          if (e.target.checked && !mic.state.stream) {
            try { await mic.startPreview(); } catch {}
          }
          if (!e.target.checked) { try { mic.stopPreview(); } catch {} }
        }} />
        Use microphone as screen audio (voiceover)
      </label>
      <div className="flex justify-end">
        {!state.isRecording ? (
          <button
            onClick={handleStart}
            disabled={busy}
            className="px-3 py-1 bg-green-300 hover:bg-green-400 text-black rounded text-sm font-medium disabled:opacity-60"
          >
            Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={busy}
            className="px-3 py-1 bg-red-300 hover:bg-red-400 text-black rounded text-sm font-medium disabled:opacity-60"
          >
            Stop ({prettyElapsed})
          </button>
        )}
      </div>
    </div>
  );
};

export default ScreenRecorder;


