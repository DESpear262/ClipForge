import React, { useEffect, useState } from "react";
import { useCombinedRecorder } from "../../hooks/useCombinedRecorder";
import { importVideo } from "../../utils/api";

// CombinedRecorder: Start/Stop a session that overlays webcam PiP onto screen with optional mic
const CombinedRecorder: React.FC = () => {
  const { state, listVideoDevices, listAudioDevices, start, stop, prettyElapsed } = useCombinedRecorder();
  const [cams, setCams] = useState<string[]>([]);
  const [mics, setMics] = useState<string[]>([]);
  const [cam, setCam] = useState<string>("");
  const [mic, setMic] = useState<string>("");
  const [fps, setFps] = useState<number>(60);
  const [corner, setCorner] = useState<"br"|"bl"|"tr"|"tl">("br");
  const [pip, setPip] = useState<number>(480);
  const [margin, setMargin] = useState<number>(16);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setCams(await listVideoDevices());
      setMics(await listAudioDevices());
    })();
  }, [listVideoDevices, listAudioDevices]);

  useEffect(() => { if (!cam && cams[0]) setCam(cams[0]); }, [cams, cam]);
  useEffect(() => { if (!mic && mics[0]) setMic(mics[0]); }, [mics, mic]);

  const handleStart = async () => {
    if (busy || state.isRecording || !cam) return;
    setBusy(true);
    try {
      const out = await start({ fps, webcamDevice: cam, audioDevice: mic || undefined, corner, pipWidthPx: pip, marginPx: margin });
      return out;
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
        } catch {}
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select value={cam} onChange={(e)=>setCam(e.target.value)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm" title="Webcam">
        {cams.map((c) => (<option key={c} value={c}>{c}</option>))}
      </select>
      <select value={mic} onChange={(e)=>setMic(e.target.value)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm" title="Microphone">
        <option value="">No Mic</option>
        {mics.map((m) => (<option key={m} value={m}>{m}</option>))}
      </select>
      <select value={corner} onChange={(e)=>setCorner(e.target.value as any)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm" title="PiP Corner">
        <option value="br">BR</option>
        <option value="bl">BL</option>
        <option value="tr">TR</option>
        <option value="tl">TL</option>
      </select>
      <input type="number" className="w-20 px-2 py-1 bg-gray-200 text-black rounded text-sm" value={pip} min={160} max={960} step={40} onChange={(e)=>setPip(Number(e.target.value||480))} title="PiP Width (px)" />
      <input type="number" className="w-16 px-2 py-1 bg-gray-200 text-black rounded text-sm" value={margin} min={0} max={64} step={2} onChange={(e)=>setMargin(Number(e.target.value||16))} title="Margin (px)" />
      <select value={fps} onChange={(e)=>setFps(Number(e.target.value))} className="px-2 py-1 bg-gray-200 text-black rounded text-sm" title="FPS">
        <option value={30}>30</option>
        <option value={60}>60</option>
      </select>
      {!state.isRecording ? (
        <button onClick={handleStart} disabled={busy} className="px-3 py-1 bg-purple-300 hover:bg-purple-400 text-black rounded text-sm font-medium disabled:opacity-60">Start Combined</button>
      ) : (
        <button onClick={handleStop} disabled={busy} className="px-3 py-1 bg-red-300 hover:bg-red-400 text-black rounded text-sm font-medium disabled:opacity-60">Stop ({prettyElapsed})</button>
      )}
    </div>
  );
};

export default CombinedRecorder;


