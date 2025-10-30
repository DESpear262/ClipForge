import React, { useState } from "react";
import { useRecording } from "../../context/RecordingContext";
import { importVideo } from "../../utils/api";
import { useToastContext } from "../../context/ToastContext";
import { invoke } from "@tauri-apps/api/tauri";

// CombinedRecorder (modular): orchestrates screen + webcam + mic using shared context
// No device pickers here—uses the selections made in the individual mic/cam panels (previews must be active)
const CombinedRecorder: React.FC = () => {
  const { screen, webcam, mic } = useRecording();
  const { showToast } = useToastContext();
  const [fps, setFps] = useState<number>(60);
  const [corner, setCorner] = useState<"br"|"bl"|"tr"|"tl">("br");
  const [pip, setPip] = useState<number>(480);
  const [margin, setMargin] = useState<number>(16);
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    if (busy || (screen.state.isRecording || webcam.state.isRecording || !!mic.state.isRecording)) return;
    // Validate mic + webcam previews are active; if not, fail without starting
    if (!mic.state.stream) {
      showToast("Microphone not ready. Open the Microphone panel and start preview.", "error", 4000);
      return;
    }
    if (!webcam.state.previewStream) {
      showToast("Webcam not ready. Open the Webcam panel and start preview.", "error", 4000);
      return;
    }
    setBusy(true);
    try {
      await webcam.start();
      await mic.startRecording();
      await screen.start({ fps });
    } catch (e) {
      showToast("Failed to start combined recording.", "error", 4000);
      try { if (webcam.state.isRecording) await webcam.stop(); } catch {}
      try { if (mic.state.isRecording) await mic.stopRecording(); } catch {}
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    const anyRecording = screen.state.isRecording || webcam.state.isRecording || !!mic.state.isRecording;
    if (busy || !anyRecording) return;
    setBusy(true);
    try {
      // Stop all in parallel to prevent drift; always attempt each
      const screenStop = screen.state.isRecording ? screen.stop() : Promise.resolve(null);
      const micStop = mic.state.isRecording ? mic.stopRecording() : Promise.resolve(null);
      const camStop = webcam.state.isRecording ? webcam.stop() : Promise.resolve(null);

      const [screenOut, camOut, micOut] = await Promise.all([screenStop, camStop, micStop]);

      if (!screenOut || !camOut) {
        showToast("Recording outputs missing.", "error", 4000);
        return;
      }
      // Tauri expects snake_case keys
      const out = await invoke<string>("compose_pip_cmd", {
        base_video_path: screenOut,
        overlay_video_path: camOut,
        audio_path: micOut && (micOut as any).path ? (micOut as any).path : null,
        corner,
        pip_width_px: pip,
        margin_px: margin,
      });
      try {
        const media = await importVideo(out);
        const ev = new CustomEvent("media-imported", { detail: media });
        window.dispatchEvent(ev);
      } catch {}
    } catch (e) {
      showToast("Failed to finalize combined recording.", "error", 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-300">
          <div className="mb-1">PiP Corner</div>
          <select value={corner} onChange={(e)=>setCorner(e.target.value as any)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full" title="PiP Corner">
            <option value="br">BR</option>
            <option value="bl">BL</option>
            <option value="tr">TR</option>
            <option value="tl">TL</option>
          </select>
        </label>
        <label className="text-xs text-gray-300">
          <div className="mb-1">FPS</div>
          <select value={fps} onChange={(e)=>setFps(Number(e.target.value))} className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full" title="FPS">
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <label className="text-xs text-gray-300">
          <div className="mb-1">PiP Width (px)</div>
          <input type="number" className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full" value={pip} min={160} max={960} step={40} onChange={(e)=>setPip(Number(e.target.value||480))} title="PiP Width (px)" />
        </label>
        <label className="text-xs text-gray-300">
          <div className="mb-1">Margin (px)</div>
          <input type="number" className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full" value={margin} min={0} max={64} step={2} onChange={(e)=>setMargin(Number(e.target.value||16))} title="Margin (px)" />
        </label>
      </div>
      <div className="flex justify-end">
        {!(screen.state.isRecording || webcam.state.isRecording || !!mic.state.isRecording) ? (
          <button onClick={handleStart} disabled={busy} className="px-3 py-1 bg-purple-300 hover:bg-purple-400 text-black rounded text-sm font-medium disabled:opacity-60">Start Combined</button>
        ) : (
          <button onClick={handleStop} disabled={busy} className="px-3 py-1 bg-red-300 hover:bg-red-400 text-black rounded text-sm font-medium disabled:opacity-60">Stop ({screen.prettyElapsed})</button>
        )}
      </div>
    </div>
  );
};

export default CombinedRecorder;


