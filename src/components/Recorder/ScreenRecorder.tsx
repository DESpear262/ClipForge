import React, { useEffect, useState } from "react";
import { useRecorder } from "../../hooks/useRecorder";
import { importVideo } from "../../utils/api";

/**
 * ScreenRecorder: Minimal UI for PR#1
 * - Lists capture sources (desktop only for now)
 * - Start/Stop recording
 * - Shows elapsed time
 * - Auto-imports finished recording into media library
 */
const ScreenRecorder: React.FC = () => {
  const { state, start, stop, listSources, prettyElapsed } = useRecorder();
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<string>("desktop");
  const [fps, setFps] = useState<number>(60);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [audioDevice, setAudioDevice] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await listSources();
      setSources(list.map((s) => ({ id: s.id, name: s.name })));
      if (list.length > 0) setSelected(list[0].id);
      try {
        const { invoke } = await import("@tauri-apps/api/tauri");
        const devs = await invoke<string[]>("list_audio_devices_cmd");
        setAudioDevices(devs);
        if (devs.length > 0) setAudioDevice(devs[0]);
      } catch {}
    })();
  }, [listSources]);

  const handleStart = async () => {
    if (busy || state.isRecording) return;
    setBusy(true);
    try {
      await start({ fps, audioDevice });
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
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="px-2 py-1 bg-gray-200 text-black rounded text-sm"
      >
        {sources.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input
        type="number"
        min={15}
        max={120}
        step={15}
        value={fps}
        onChange={(e) => setFps(Number(e.target.value || 60))}
        className="w-20 px-2 py-1 bg-gray-200 text-black rounded text-sm"
        title="Frames per second"
      />
      <select
        value={audioDevice}
        onChange={(e) => setAudioDevice(e.target.value)}
        className="px-2 py-1 bg-gray-200 text-black rounded text-sm"
        title="Microphone"
      >
        {audioDevices.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
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
  );
};

export default ScreenRecorder;


