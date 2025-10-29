import React, { useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer from "./VideoPlayer";
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

  // Compute current items and active transition
  const { current, next, transition, blend } = useMemo(() => {
    const t = timeline.state.currentTime || 0;
    const vTrackId = timeline.state.tracks[0]?.id || "V1";
    const items = timeline.state.items.filter(it => it.trackId === vTrackId).sort((a,b)=>a.start-b.start);
    const cur = items.find(it => t >= it.start && t < it.end) || [...items].reverse().find(it => it.start <= t) || items[0];
    const idx = items.findIndex(i => i.id === (cur?.id || ""));
    const nxt = idx >= 0 ? items[idx + 1] : undefined;
    const tr = timeline.state.transitions.find(tr => tr.fromItemId === cur?.id && tr.toItemId === nxt?.id);
    let alpha = 0;
    if (tr && nxt) {
      const start = Math.max(nxt.start - tr.duration, cur!.end - tr.duration);
      const end = nxt.start;
      if (t >= start && t <= end) {
        const span = Math.max(0.001, end - start);
        alpha = Math.min(1, Math.max(0, (t - start) / span));
      }
    }
    return { current: cur, next: nxt, transition: tr, blend: alpha };
  }, [timeline.state.currentTime, timeline.state.items, timeline.state.tracks, timeline.state.transitions]);

  // Update player sources when items change
  useEffect(() => {
    setPrimaryPath(current?.path || "");
    setSecondaryPath(next?.path || "");
  }, [current?.path, next?.path]);

  // Sync secondary player time to timeline
  const computeMediaTime = (item: any, timelineTime: number) => {
    if (!item) return 0;
    const rel = Math.max(0, timelineTime - item.start);
    return item.trimIn + rel;
  };

  // When primary reports time updates, propagate timeline time and seek secondary
  const handlePrimaryTime = () => {
    // timeline.state.currentTime is already updated by MediaLibrary wrapper; no-op here
    if (secondaryApiRef.current && next) {
      const mediaT = computeMediaTime(next, timeline.state.currentTime || 0);
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

  return (
    <div className="relative">
      {/* Primary */}
      {primaryPath && (
        <VideoPlayer
          clip={{ id: current?.id || "primary", filePath: primaryPath, fileName: primaryPath.split("/").pop() || "video" }}
          onTimeUpdate={() => handlePrimaryTime()}
          onReady={(api) => { primaryApiRef.current = api; }}
        />
      )}
      {/* Secondary for crossfade */}
      {showSecondary && (
        <div className="absolute inset-0" style={{ pointerEvents: "none", opacity: Math.max(0, Math.min(1, blend)) }}>
          <VideoPlayer
            clip={{ id: next?.id || "secondary", filePath: secondaryPath, fileName: secondaryPath.split("/").pop() || "video" }}
            onReady={(api) => { secondaryApiRef.current = api; }}
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
    </div>
  );
};

export default TimelinePreview;


