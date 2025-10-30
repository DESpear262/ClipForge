import React, { useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer from "./VideoPlayer";
import AudioPlayer from "./AudioPlayer";
import { useTimeline } from "../context/TimelineContext";

/**
 * TimelinePreview
 * Stacks up to two VideoPlayers to visualize simple transitions (crossfade/fadeblack)
 * and renders text overlays.
 *
 * Playback rules (multi-track):
 * - Primary (V1) renders full-size with native controls visible.
 * - Secondary (V2) renders as picture-in-picture at bottom-right; controls hidden.
 * - All active audio track items play in sync; seeking and play/pause propagate.
 */
const TimelinePreview: React.FC = () => {
  const timeline = useTimeline();
  const [primaryPath, setPrimaryPath] = useState<string>("");
  const [secondaryPath, setSecondaryPath] = useState<string>("");
  const primaryApiRef = useRef<{ seek: (t: number) => void; play: () => void; pause: () => void; getDuration: () => number } | null>(null);
  const secondaryApiRef = useRef<{ seek: (t: number) => void; play: () => void; pause: () => void; getDuration: () => number } | null>(null);
  const audioApisRef = useRef<Map<string, { seek: (t: number) => void; play: () => void; pause: () => void; getDuration: () => number }>>(new Map());

// Compute active items across tracks at current time
const { baseVideo, overlayVideo, transition, blend, activeAudios } = useMemo(() => {
  const t = timeline.state.currentTime || 0;
  const videoTracks = timeline.state.tracks.filter(tr => tr.kind === "video");
  const audioTracks = timeline.state.tracks.filter(tr => tr.kind === "audio");
  const activeVideos = videoTracks
    .map(tr => timeline.state.items.filter(it => it.trackId === tr.id && t >= it.start && t < it.end).map(it => ({ it, trackId: tr.id })))
    .flat()
    .sort((a,b) => videoTracks.findIndex(v=>v.id===a.trackId) - videoTracks.findIndex(v=>v.id===b.trackId))
    .map(x => x.it);
  const base = activeVideos[0];
  const overlay = activeVideos[1];
  // Transition on base track only
  let trn: any = undefined; let alpha = 0;
  if (base) {
    const ordered = timeline.state.items.filter(it => it.trackId === base.trackId).sort((a,b)=>a.start-b.start);
    const idx = ordered.findIndex(i => i.id === base.id);
    const nxt = idx >= 0 ? ordered[idx + 1] : undefined;
    trn = timeline.state.transitions.find(x => x.fromItemId === base.id && x.toItemId === nxt?.id);
    if (trn && nxt) {
      const start = Math.max(nxt.start - trn.duration, base.end - trn.duration);
      const end = nxt.start;
      if (t >= start && t <= end) {
        const span = Math.max(0.001, end - start);
        alpha = Math.min(1, Math.max(0, (t - start) / span));
      }
    }
  }
  const activeAuds = audioTracks
    .map(tr => timeline.state.items.filter(it => it.trackId === tr.id && t >= it.start && t < it.end))
    .flat();
  try { console.info("[TimelinePreview] active videos:", { base: base?.id, overlay: overlay?.id }, "activeAudios:", activeAuds.map(a=>a.id)); } catch {}
  return { baseVideo: base, overlayVideo: overlay, transition: trn, blend: alpha, activeAudios: activeAuds };
}, [timeline.state.currentTime, timeline.state.items, timeline.state.tracks, timeline.state.transitions]);

  // Update player sources when items change
useEffect(() => {
  setPrimaryPath(baseVideo?.path || "");
  setSecondaryPath(overlayVideo?.path || "");
  try { console.info("[TimelinePreview] sources updated:", { primaryPath: baseVideo?.path, secondaryPath: overlayVideo?.path }); } catch {}
}, [baseVideo?.path, overlayVideo?.path]);

  // Map timeline time -> item media time
  const computeMediaTime = (item: any, timelineTime: number) => {
    if (!item) return 0;
    const rel = Math.max(0, timelineTime - item.start);
    return item.trimIn + rel;
  };

  // When primary reports time updates, advance the timeline clock and keep the secondary in sync
const handlePrimaryTime = (ct: number, _dur: number) => {
  if (baseVideo) {
    const timelineT = baseVideo.start + Math.max(0, ct - baseVideo.trimIn);
    if (Math.abs((timeline.state.currentTime || 0) - timelineT) > 0.01) {
      try { timeline.setCurrentTime(timelineT); } catch {}
    }
  }
  if (secondaryApiRef.current && overlayVideo) {
    const mediaT = computeMediaTime(overlayVideo, timeline.state.currentTime || 0);
    try { secondaryApiRef.current.seek(mediaT); } catch {}
  }
  // Keep audio tracks in sync
  try {
    activeAudios.forEach((it) => {
      const api = audioApisRef.current.get(it.id);
      if (!api) return;
      const mediaT = computeMediaTime(it, timeline.state.currentTime || 0);
      api.seek(mediaT);
    });
  } catch {}
};

  const overlayItems = useMemo(() => {
    const t = timeline.state.currentTime || 0;
    const oTrackId = timeline.state.tracks.find(tr => tr.kind === "overlay")?.id || "O1";
    return timeline.state.items.filter(it => it.trackId === oTrackId && t >= it.start && t <= it.end && it.overlayText);
  }, [timeline.state.currentTime, timeline.state.items, timeline.state.tracks]);

// Always show secondary as PiP when present
const showSecondary = !!secondaryPath && !!overlayVideo;

  // Register timeline -> player seek handler so clicking/dragging the timeline seeks playback
  useEffect(() => {
    if (!primaryApiRef.current) return;
    const seek = (t: number) => {
      const mediaT = computeMediaTime(baseVideo as any, t);
      try { primaryApiRef.current?.seek(mediaT); } catch {}
      if (secondaryApiRef.current && overlayVideo) {
        const nT = computeMediaTime(overlayVideo as any, t);
        try { secondaryApiRef.current.seek(nT); } catch {}
      }
    };
    timeline.registerSeekHandler(seek);
    return () => timeline.registerSeekHandler(undefined);
  }, [baseVideo?.id, overlayVideo?.id, timeline.registerSeekHandler]);

  // Keep timeline duration in sync with composition (max end of video items)
  useEffect(() => {
    const vTrackId = timeline.state.tracks[0]?.id || "V1";
    const items = timeline.state.items.filter(it => it.trackId === vTrackId);
    const total = items.reduce((m, it) => Math.max(m, it.end), 0);
    if (total && Math.abs((timeline.state.duration || 0) - total) > 0.01) {
      try { timeline.setDuration(total); } catch {}
    }
  }, [timeline.state.items, timeline.state.tracks, timeline.state.duration, timeline.setDuration]);

  return (
    <div className="relative">
      {/* Primary with native controls */}
      {primaryPath && (
        <VideoPlayer
          clip={{ id: baseVideo?.id || "primary", filePath: primaryPath, fileName: primaryPath.split("/").pop() || "video" }}
          onTimeUpdate={(ct) => handlePrimaryTime(ct, 0)}
          onReady={(api) => { primaryApiRef.current = api; try { console.info("[TimelinePreview] primary ready"); } catch {} }}
          showControls={true}
          onPlay={() => {
            try { console.info("[TimelinePreview] primary play"); } catch {}
            try { secondaryApiRef.current?.play(); } catch {}
            // Play all audio tracks
            try { activeAudios.forEach(it => audioApisRef.current.get(it.id)?.play()); } catch {}
          }}
          onPause={() => {
            try { console.info("[TimelinePreview] primary pause"); } catch {}
            try { secondaryApiRef.current?.pause(); } catch {}
            try { activeAudios.forEach(it => audioApisRef.current.get(it.id)?.pause()); } catch {}
          }}
          volume={Math.max(0, Math.min(1, (baseVideo?.gain ?? 1)))}
        />
      )}
      {/* Secondary PiP (bottom-right) */}
      {showSecondary && (
        <div
          className="absolute"
          style={{ right: 12, bottom: 12, width: "28%", aspectRatio: "16/9", pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.5)", borderRadius: 8, overflow: "hidden" }}
        >
          <VideoPlayer
            clip={{ id: overlayVideo?.id || "secondary", filePath: secondaryPath, fileName: secondaryPath.split("/").pop() || "video" }}
            onReady={(api) => { secondaryApiRef.current = api; try { console.info("[TimelinePreview] secondary ready (PiP)"); } catch {} }}
            showControls={false}
            muted={false}
            volume={Math.max(0, Math.min(1, (overlayVideo?.gain ?? 1)))}
          />
        </div>
      )}
      {/* Text overlays */}
      {overlayItems.map((it) => (
        <div
          key={it.id}
          className="absolute"
          style={{
            left: `${Math.round(((it.overlayX ?? 0.5) * 100))}%`,
            top: `${Math.round(((it.overlayY ?? 0.85) * 100))}%`,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            color: it.overlayColor || "#ffffff",
            fontSize: (it.overlayFontSize || 24),
            textAlign: it.overlayAlign || "center",
            textShadow: "0 2px 8px rgba(0,0,0,0.7)",
          }}
        >
          {it.overlayText}
        </div>
      ))}
      {/* Active audio items (single instance per item) */}
      {activeAudios.map((it) => (
        <AudioPlayer
          key={`aud-${it.id}`}
          srcPath={it.path}
          volume={Math.max(0, Math.min(1, (it.gain ?? 1)))}
          onReady={(api) => {
            audioApisRef.current.set(it.id, api);
            try { console.info("[TimelinePreview] audio ready:", it.id); } catch {}
          }}
        />
      ))}
    </div>
  );
};

export default TimelinePreview;


