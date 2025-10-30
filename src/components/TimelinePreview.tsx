import React, { useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer from "./VideoPlayer";
import AudioPlayer from "./AudioPlayer";
import { useTimeline } from "../context/TimelineContext";

/**
 * TimelinePreview
 * Stacks up to two VideoPlayers to visualize simple transitions (crossfade/fadeblack)
 * and renders text overlays.
 */
const TimelinePreview: React.FC = () => {
  const timeline = useTimeline();
  const [primaryPath, setPrimaryPath] = useState<string>("");
  const [secondaryPath, setSecondaryPath] = useState<string>("");
  const primaryApiRef = useRef<{ seek: (t: number) => void; play: () => void; pause: () => void; getDuration: () => number } | null>(null);
  const secondaryApiRef = useRef<{ seek: (t: number) => void; play: () => void; pause: () => void; getDuration: () => number } | null>(null);

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
  return { baseVideo: base, overlayVideo: overlay, transition: trn, blend: alpha, activeAudios: activeAuds };
}, [timeline.state.currentTime, timeline.state.items, timeline.state.tracks, timeline.state.transitions]);

  // Update player sources when items change
useEffect(() => {
  setPrimaryPath(baseVideo?.path || "");
  setSecondaryPath(overlayVideo?.path || "");
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
  };

  const overlayItems = useMemo(() => {
    const t = timeline.state.currentTime || 0;
    const oTrackId = timeline.state.tracks.find(tr => tr.kind === "overlay")?.id || "O1";
    return timeline.state.items.filter(it => it.trackId === oTrackId && t >= it.start && t <= it.end && it.overlayText);
  }, [timeline.state.currentTime, timeline.state.items, timeline.state.tracks]);

const showSecondary = transition && (transition.type === "crossfade") && blend > 0 && secondaryPath;
  const fadeBlackOpacity = transition && transition.type === "fadeblack" ? blend : 0;

  // Register timeline -> player seek handler so clicking/dragging the timeline seeks playback
  useEffect(() => {
    if (!primaryApiRef.current) return;
    const seek = (t: number) => {
      const mediaT = computeMediaTime(current, t);
      try { primaryApiRef.current?.seek(mediaT); } catch {}
      if (secondaryApiRef.current && next) {
        const nT = computeMediaTime(next, t);
        try { secondaryApiRef.current.seek(nT); } catch {}
      }
    };
    timeline.registerSeekHandler(seek);
    return () => timeline.registerSeekHandler(undefined);
  }, [current?.id, next?.id, timeline.registerSeekHandler]);

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
      {/* Primary */}
      {primaryPath && (
        <VideoPlayer
        clip={{ id: baseVideo?.id || "primary", filePath: primaryPath, fileName: primaryPath.split("/").pop() || "video" }}
          onTimeUpdate={(ct) => handlePrimaryTime(ct, 0)}
        onReady={(api) => { primaryApiRef.current = api; }}
        showControls={false}
          volume={Math.max(0, Math.min(1, (baseVideo?.gain ?? 1)))}
        />
      )}
      {/* Secondary for crossfade */}
      {showSecondary && (
        <div className="absolute inset-0" style={{ pointerEvents: "none", opacity: Math.max(0, Math.min(1, blend)) }}>
          <VideoPlayer
            clip={{ id: overlayVideo?.id || "secondary", filePath: secondaryPath, fileName: secondaryPath.split("/").pop() || "video" }}
            onReady={(api) => { secondaryApiRef.current = api; }}
            showControls={false}
            volume={Math.max(0, Math.min(1, (overlayVideo?.gain ?? 1)))}
          />
        </div>
      )}
      {/* Fade to black overlay */}
      {fadeBlackOpacity > 0 && (
        <div className="absolute inset-0 bg-black" style={{ pointerEvents: "none", opacity: Math.max(0, Math.min(1, fadeBlackOpacity)) }} />
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
      {/* Active audio items */}
      {activeAudios.map((it) => (
        <AudioPlayer key={`aud-${it.id}`} srcPath={it.path} volume={Math.max(0, Math.min(1, (it.gain ?? 1)))} />
      ))}
  {/* Active audio items */}
  {activeAudios.map((it) => (
    <AudioPlayer key={`aud-${it.id}`} srcPath={it.path} />
  ))}
    </div>
  );
};

export default TimelinePreview;


