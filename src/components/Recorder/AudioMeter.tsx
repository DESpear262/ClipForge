import React, { useEffect, useState } from "react";
import { useMicrophone } from "../../hooks/useMicrophone";
import { useTimeline } from "../../context/TimelineContext";

// Compact audio VU meter with device selector and preview toggle
const AudioMeter: React.FC = () => {
  const { state, listDevices, startPreview, stopPreview, levelDb, startRecording, stopRecording } = useMicrophone();
  const timeline = useTimeline();
  const [devices, setDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [advanced, setAdvanced] = useState(false);
  const [echo, setEcho] = useState(true);
  const [ns, setNs] = useState(true);
  const [agc, setAgc] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await listDevices();
      setDevices(list);
      if (list.length > 0) setDeviceId((prev) => prev || list[0].id);
    })();
  }, [listDevices]);

  const toggle = async () => {
    console.info("[ui] mic toggle clicked; isRecording=", state.isRecording, "stream=", !!state.stream);
    if (state.isRecording) return; // avoid tearing down while recording; stop via record button
    if (state.stream) {
      console.info("[ui] mic preview stop");
      stopPreview();
    } else {
      console.info("[ui] mic preview start", { deviceId });
      await startPreview({ deviceId, echoCancellation: echo, noiseSuppression: ns, autoGain: agc });
    }
  };

  const pct = Math.max(0, Math.min(1, state.level)) * 100;

  return (
    <div className="space-y-2">
      <label className="text-xs text-gray-300 w-full block">
        <div className="mb-1">Microphone</div>
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm w-full">
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </label>
      <div>
        <div className="text-xs text-gray-300 mb-1">Level</div>
        <div className="w-full h-2 bg-gray-300 rounded overflow-hidden" title={`${levelDb} dB`}>
          <div className="h-full" style={{ width: `${pct}%`, background: pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#10b981" }} />
        </div>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={toggle} disabled={!!state.isRecording} className={`px-2 py-1 rounded text-sm ${state.isRecording ? "opacity-60 cursor-not-allowed bg-gray-300 text-black" : "bg-gray-200 hover:bg-gray-300 text-black"}`}>
          {state.stream ? "Stop Mic" : "Start Mic"}
        </button>
        {!state.isRecording ? (
          <button
            onClick={async () => {
              try {
                console.info("[ui] record toggle: start");
                if (!state.stream) {
                  await startPreview({ deviceId, echoCancellation: echo, noiseSuppression: ns, autoGain: agc });
                }
                await startRecording({ deviceId, echoCancellation: echo, noiseSuppression: ns, autoGain: agc });
              } catch (e) {
                console.error("[ui] record start error", e);
              }
            }}
            className="px-2 py-1 bg-green-300 hover:bg-green-400 text-black rounded text-sm"
          >
            Record Audio
          </button>
        ) : (
          <button
            onClick={async () => {
              try {
                console.info("[ui] record toggle: stop");
                const out = await stopRecording();
                if (out?.path) {
                  const start = timeline.state.currentTime || 0;
                  const len = Math.max(0.1, (out.elapsedMs || 0) / 1000);
                  console.info("[ui] adding audio item", { path: out.path, start, len });
                  timeline.addItem({
                    id: `aud-${Date.now()}`,
                    mediaId: -1,
                    path: out.path,
                    trackId: "A1",
                    start,
                    end: start + len,
                    trimIn: 0,
                    trimOut: len,
                  });
                }
              } catch (e) {
                console.error("[ui] record stop error", e);
              }
            }}
            className="px-2 py-1 bg-red-300 hover:bg-red-400 text-black rounded text-sm"
          >
            Stop & Add to A1
          </button>
        )}
        <button onClick={() => setAdvanced(!advanced)} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded text-sm">Advanced</button>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${state.stream ? "bg-green-700/40 text-green-200" : "bg-gray-700 text-gray-300"}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${state.stream ? "bg-green-400" : "bg-gray-500"}`}></span>
            Mic On
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${state.isRecording ? "bg-red-700/40 text-red-200" : "bg-gray-700 text-gray-300"}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${state.isRecording ? "bg-red-400" : "bg-gray-500"}`}></span>
            Recording
          </span>
        </div>
      </div>
      {advanced && (
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={echo} onChange={e=>setEcho(e.target.checked)} />Echo</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={ns} onChange={e=>setNs(e.target.checked)} />NS</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={agc} onChange={e=>setAgc(e.target.checked)} />AGC</label>
        </div>
      )}
      {state.error && <div className="text-xs text-red-400">{state.error}</div>}
    </div>
  );
};

export default AudioMeter;



