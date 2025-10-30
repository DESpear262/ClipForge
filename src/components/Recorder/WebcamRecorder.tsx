import React, { useEffect, useRef, useState } from "react";
import { useWebcamRecorder } from "../../hooks/useWebcamRecorder";
import { importVideo } from "../../utils/api";

// WebcamRecorder UI: device select, resolution/fps, preview, start/stop, elapsed, auto-import
const WebcamRecorder: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { state, listVideoDevices, ensurePreview, start, stop, prettyElapsed } = useWebcamRecorder();
  const [devices, setDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [res, setRes] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });
  const [fps, setFps] = useState<number>(30);
  const [includeMic, setIncludeMic] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await listVideoDevices();
      const mapped = list.map((d) => ({ id: d.id, label: d.label || "Camera" }));
      setDevices(mapped);
      if (mapped.length > 0) setDeviceId((prev) => prev || mapped[0].id);
    })();
  }, [listVideoDevices]);

  useEffect(() => {
    if (videoRef.current && state.previewStream) {
      (videoRef.current as any).srcObject = state.previewStream;
      videoRef.current.play().catch(() => {});
    }
  }, [state.previewStream]);

  const refreshPreview = async () => {
    await ensurePreview({ deviceId, width: res.w, height: res.h, fps, includeMic });
  };

  const handleStart = async () => {
    if (busy || state.isRecording) return;
    setBusy(true);
    try {
      await start({ deviceId, width: res.w, height: res.h, fps, includeMic });
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
          const media = await importVideo(out);
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
          <div className="mb-1">Camera</div>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full"
            title="Camera"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-300">
          <div className="mb-1">Resolution</div>
          <select
            value={`${res.w}x${res.h}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              setRes({ w, h });
            }}
            className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full"
            title="Resolution"
          >
            <option value="1280x720">720p</option>
            <option value="1920x1080">1080p</option>
          </select>
        </label>
        <label className="text-xs text-gray-300">
          <div className="mb-1">FPS</div>
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full"
            title="FPS"
          >
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </label>
        <label className="text-xs text-gray-300 flex items-center gap-1">
          <input type="checkbox" checked={includeMic} onChange={(e) => setIncludeMic(e.target.checked)} />
          Include mic
        </label>
        <div>
          <div className="text-xs text-gray-300 mb-1">Preview</div>
          <button onClick={refreshPreview} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded text-sm w-full">Start Preview</button>
        </div>
        <div className="col-span-2 flex justify-end">
          {!state.isRecording ? (
            <button
              onClick={handleStart}
              disabled={busy}
              className="px-3 py-1 bg-green-300 hover:bg-green-400 text-black rounded text-sm font-medium disabled:opacity-60"
            >
              Start Cam
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
      <video ref={videoRef} muted playsInline className="hidden" />
    </div>
  );
};

export default WebcamRecorder;

