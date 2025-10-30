import React, { useMemo } from "react";
import { useTimeline } from "../context/TimelineContext";

/**
 * StreamMixer
 * Renders per-stream volume sliders for currently active items under the playhead.
 * Updates are persisted on the corresponding TimelineItem via updateItem({ gain }).
 */
const StreamMixer: React.FC = () => {
  const timeline = useTimeline();
  const { baseVideo, overlayVideo, activeAudios } = useMemo(() => {
    const t = timeline.state.currentTime || 0;
    const videoTracks = timeline.state.tracks.filter(tr => tr.kind === "video");
    const audioTracks = timeline.state.tracks.filter(tr => tr.kind === "audio");
    const activeVideos = videoTracks
      .map(tr => timeline.state.items.filter(it => it.trackId === tr.id && t >= it.start && t < it.end).map(it => ({ it, tr })))
      .flat()
      .sort((a,b) => videoTracks.findIndex(v=>v.id===a.tr.id) - videoTracks.findIndex(v=>v.id===b.tr.id))
      .map(x => x.it);
    const base = activeVideos[0];
    const overlay = activeVideos[1];
    const auds = audioTracks
      .map(tr => timeline.state.items.filter(it => it.trackId === tr.id && t >= it.start && t < it.end))
      .flat();
    return { baseVideo: base, overlayVideo: overlay, activeAudios: auds };
  }, [timeline.state.currentTime, timeline.state.items, timeline.state.tracks]);

  const Slider: React.FC<{ label: string; id: string; value: number; onChange: (v: number) => void }> = ({ label, id, value, onChange }) => (
    <div className="flex items-center gap-2">
      <div className="w-28 text-xs text-gray-300 truncate" title={label}>{label}</div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <div className="w-10 text-right text-xs text-gray-400">{Math.round(value * 100)}%</div>
    </div>
  );

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
      <div className="text-xs text-gray-400">Mixer</div>
      {baseVideo && (
        <Slider
          label={`V1 (${baseVideo.id})`}
          id={`mx-${baseVideo.id}`}
          value={baseVideo.gain ?? 1}
          onChange={(v) => timeline.updateItem(baseVideo.id, { gain: v })}
        />
      )}
      {overlayVideo && (
        <Slider
          label={`V2 (${overlayVideo.id})`}
          id={`mx-${overlayVideo.id}`}
          value={overlayVideo.gain ?? 1}
          onChange={(v) => timeline.updateItem(overlayVideo.id, { gain: v })}
        />
      )}
      {activeAudios.map((it) => (
        <Slider
          key={`mx-${it.id}`}
          label={`${it.trackId} (${it.id})`}
          id={`mx-${it.id}`}
          value={it.gain ?? 1}
          onChange={(v) => timeline.updateItem(it.id, { gain: v })}
        />
      ))}
      {!baseVideo && activeAudios.length === 0 && (
        <div className="text-xs text-gray-500">No active streams at playhead</div>
      )}
    </div>
  );
};

export default StreamMixer;


