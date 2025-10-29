import React, { useEffect, useState } from "react";
import { useMicrophone } from "../../hooks/useMicrophone";

// Compact audio VU meter with device selector and preview toggle
const AudioMeter: React.FC = () => {
  const { state, listDevices, startPreview, stopPreview, levelDb } = useMicrophone();
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
    if (state.stream) {
      stopPreview();
    } else {
      await startPreview({ deviceId, echoCancellation: echo, noiseSuppression: ns, autoGain: agc });
    }
  };

  const pct = Math.max(0, Math.min(1, state.level)) * 100;

  return (
    <div className="flex items-center gap-2">
      <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm">
        {devices.map((d) => (
          <option key={d.id} value={d.id}>{d.label}</option>
        ))}
      </select>
      <div className="w-28 h-2 bg-gray-300 rounded overflow-hidden" title={`${levelDb} dB`}>
        <div className="h-full" style={{ width: `${pct}%`, background: pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#10b981" }} />
      </div>
      <button onClick={toggle} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded text-sm">
        {state.stream ? "Stop Mic" : "Start Mic"}
      </button>
      <button onClick={() => setAdvanced(!advanced)} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded text-sm">Adv</button>
      {advanced && (
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={echo} onChange={e=>setEcho(e.target.checked)} />Echo</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={ns} onChange={e=>setNs(e.target.checked)} />NS</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={agc} onChange={e=>setAgc(e.target.checked)} />AGC</label>
        </div>
      )}
    </div>
  );
};

export default AudioMeter;


