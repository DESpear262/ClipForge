import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Rect, Text, Group } from "react-konva";
import { useTimeline } from "../context/TimelineContext";
import TrackLayer from "./Timeline/TrackLayer";

/**
 * Konva-based multi-track timeline with grid, items, trim overlay, and playhead.
 *
 * Zoom behavior:
 * - Fully zoomed out fits the entire timeline duration in view.
 * - Increasing zoom increases px/sec so the visible time window shrinks proportionally
 *   (e.g., 2× zoom shows half the timeline length).
 * - Maximum zoom clamps to a minimum visible window of MIN_WINDOW_SEC seconds.
 * - If total duration ≤ MIN_WINDOW_SEC, zooming is disabled (no-op).
 * - A field-of-view (FOV) slider pans the viewport across the timeline by adjusting
 *   a left-edge time offset (`viewOffsetSec`).
 *
 * Layering model (performance-optimized):
 * - Static layer (listening=false): background, grid lines/labels, track row backgrounds.
 * - Content layer: track items (via TrackLayer Groups), trim overlays/handles/tooltip, playhead.
 *
 * This keeps the Stage to two layers to avoid Konva's multi-layer performance penalty.
 */
const Timeline: React.FC = () => {
  const {
    state,
    setCurrentTime,
    setPxPerSecond,
    requestSeek,
    setInPoint,
    setOutPoint,
    setTrimRange,
    setLoopTrim,
    moveItem,
    selectItem,
    deleteItem,
  } = useTimeline();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 800, height: 220 });

  // Resize observer to track container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setSize((prev) => ({ width: Math.max(300, cr.width), height: prev.height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const timelineWidth = size.width;
  const rowHeight = 56;
  const trackGap = 6;
  const tracksHeight = state.tracks.length * rowHeight + Math.max(0, state.tracks.length - 1) * trackGap;
  const topPadding = 0;
  const bottomPadding = 0;
  const timelineHeight = Math.max(size.height, tracksHeight + topPadding + bottomPadding);
  // total width coverage implicitly handled by grid/end calculation

  // Minimum visible window (seconds) at maximum zoom
  const MIN_WINDOW_SEC = 5;

  // Viewport left-edge time (seconds). 0 means view from start of timeline.
  const [viewOffsetSec, setViewOffsetSec] = useState(0);

  // Compute dynamic minimum px/sec so full video fits at min zoom
  const dynamicMinPps = useMemo(() => {
    const d = state.duration || 0;
    if (d <= 0) return 1;
    return Math.max(1, timelineWidth / d);
  }, [timelineWidth, state.duration]);

  // Compute dynamic maximum px/sec corresponding to the minimum visible window
  const dynamicMaxPpsBase = useMemo(() => {
    const denom = Math.max(0.001, MIN_WINDOW_SEC);
    return Math.max(1, timelineWidth / denom);
  }, [timelineWidth]);

  // If duration ≤ MIN_WINDOW_SEC, zooming is effectively disabled
  const canZoom = (state.duration || 0) > MIN_WINDOW_SEC;
  const minPps = dynamicMinPps;
  const maxPps = canZoom ? Math.max(dynamicMinPps, dynamicMaxPpsBase) : dynamicMinPps;

  // Visible window (seconds) at current zoom
  const visibleWindowSec = useMemo(() => {
    const pps = state.pxPerSecond || 1;
    return timelineWidth / pps;
  }, [timelineWidth, state.pxPerSecond]);

  // Clamp the viewport offset when zoom, width, or duration changes
  useEffect(() => {
    const duration = state.duration || 0;
    const maxOffset = Math.max(0, duration - visibleWindowSec);
    if (!Number.isFinite(maxOffset) || maxOffset <= 0) {
      if (viewOffsetSec !== 0) setViewOffsetSec(0);
      return;
    }
    if (viewOffsetSec < 0 || viewOffsetSec > maxOffset) {
      setViewOffsetSec(Math.max(0, Math.min(viewOffsetSec, maxOffset)));
    }
  }, [state.duration, visibleWindowSec, viewOffsetSec]);

  // Ensure pxPerSecond stays within [minPps, maxPps] on resize/duration changes
  useEffect(() => {
    if (state.pxPerSecond < minPps) {
      setPxPerSecond(minPps);
    } else if (state.pxPerSecond > maxPps) {
      setPxPerSecond(maxPps);
    }
  }, [minPps, maxPps, state.pxPerSecond, setPxPerSecond]);

  // Determine tick spacing based on zoom
  const { majorEverySec, minorEverySec } = useMemo(() => {
    const pps = state.pxPerSecond;
    // target ~80-120px between major ticks
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    let major = 1;
    for (const c of candidates) {
      if (c * pps >= 80) { major = c; break; }
    }
    let minor = major / 2;
    if (minor < 0.5) minor = 0.5;
    return { majorEverySec: major, minorEverySec: minor };
  }, [state.pxPerSecond]);

  const formatTime = (tSec: number) => {
    const t = Math.max(0, Math.round(tSec));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // Generate grid lines and labels
  const grid = useMemo(() => {
    const lines: { x: number; major: boolean; label?: string }[] = [];
    const startT = Math.max(0, viewOffsetSec);
    const endT = startT + visibleWindowSec;
    const addLines = (step: number, isMajor: boolean) => {
      if (step <= 0) return;
      const first = Math.floor(startT / step) * step;
      for (let t = first; t <= endT + 0.0001; t += step) {
        const x = (t - viewOffsetSec) * state.pxPerSecond;
        lines.push({ x, major: isMajor, label: isMajor ? formatTime(t) : undefined });
      }
    };
    addLines(minorEverySec, false);
    addLines(majorEverySec, true);
    return lines;
  }, [state.pxPerSecond, majorEverySec, minorEverySec, timelineWidth, viewOffsetSec, visibleWindowSec]);

  // Trim and playhead geometry (global selection)
  const inX = ((state.inPoint || 0) - viewOffsetSec) * state.pxPerSecond;
  const outX = ((state.outPoint || 0) - viewOffsetSec) * state.pxPerSecond;
  const playheadX = ((state.currentTime || 0) - viewOffsetSec) * state.pxPerSecond;

  // Dragging state
  type DragMode = "none" | "in" | "out" | "move";
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const dragStartRef = useRef<{ startX: number; in: number; out: number } | null>(null);
  const [showTooltip, setShowTooltip] = useState<{ which: "in" | "out" | null; x: number; label: string } | null>(null);

  const snapX = useCallback((x: number, altKey: boolean) => {
    if (altKey) return x;
    const snapPx = 6;
    const sec = Math.round(x / state.pxPerSecond);
    const secX = sec * state.pxPerSecond;
    if (Math.abs(secX - x) <= snapPx) x = secX;
    if (Math.abs(playheadX - x) <= snapPx) x = playheadX;
    return x;
  }, [state.pxPerSecond, playheadX]);

  const toTimeFromX = useCallback((x: number) => {
    const duration = state.duration || 0;
    const t = x / state.pxPerSecond + viewOffsetSec;
    return Math.max(0, Math.min(t, duration || Number.MAX_SAFE_INTEGER));
  }, [state.pxPerSecond, state.duration, viewOffsetSec]);

  // Mouse interactions: handles, move, and seek
  const stageRef = useRef<any>(null);

  const handleDown = useCallback((evt: any) => {
    const stage = evt.target.getStage?.();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const alt = !!evt.evt?.altKey;
    const x = snapX(pos.x, alt);
    const near = (hx: number) => Math.abs(hx - x) <= 8;
    if (near(inX)) {
      setDragMode("in");
      dragStartRef.current = { startX: x, in: state.inPoint || 0, out: state.outPoint || 0 };
      setShowTooltip({ which: "in", x, label: formatTime(toTimeFromX(x)) });
      return;
    }
    if (near(outX)) {
      setDragMode("out");
      dragStartRef.current = { startX: x, in: state.inPoint || 0, out: state.outPoint || 0 };
      setShowTooltip({ which: "out", x, label: formatTime(toTimeFromX(x)) });
      return;
    }
    if (x >= inX && x <= outX) {
      setDragMode("move");
      dragStartRef.current = { startX: x, in: state.inPoint || 0, out: state.outPoint || 0 };
      return;
    }
    // plain seek
    const t = toTimeFromX(x);
    setCurrentTime(t);
    requestSeek(t);
  }, [snapX, inX, outX, state.inPoint, state.outPoint, setCurrentTime, requestSeek, toTimeFromX]);

  const handleMove = useCallback((evt: any) => {
    const stage = evt.target.getStage?.();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const alt = !!evt.evt?.altKey;
    const x = snapX(pos.x, alt);
    if (dragMode === "in") {
      const t = toTimeFromX(x);
      setInPoint(t);
      setShowTooltip({ which: "in", x, label: formatTime(t) });
      return;
    }
    if (dragMode === "out") {
      const t = toTimeFromX(x);
      setOutPoint(t);
      setShowTooltip({ which: "out", x, label: formatTime(t) });
      return;
    }
    if (dragMode === "move" && dragStartRef.current) {
      const deltaPx = x - dragStartRef.current.startX;
      const deltaSec = deltaPx / state.pxPerSecond;
      setTrimRange(dragStartRef.current.in + deltaSec, dragStartRef.current.out + deltaSec);
      return;
    }
  }, [dragMode, snapX, toTimeFromX, setInPoint, setOutPoint, setTrimRange, state.pxPerSecond]);

  const handleUp = useCallback(() => {
    setDragMode("none");
    setShowTooltip(null);
    const i = state.inPoint || 0;
    const o = state.outPoint || state.duration || 0;
    if (state.currentTime < i || state.currentTime > o) {
      setCurrentTime(i);
      requestSeek(i);
    }
  }, [state.inPoint, state.outPoint, state.duration, state.currentTime, setCurrentTime, requestSeek]);
  const handleLeave = useCallback(() => { setDragMode("none"); setShowTooltip(null); }, []);

  // Multi-track helpers: locate track index from absolute Y
  const getTrackIndexFromY = useCallback((absY: number) => {
    const relativeY = absY; // stage y-origin at 0
    const band = rowHeight + trackGap;
    const idx = Math.floor(relativeY / band);
    return Math.max(0, Math.min(state.tracks.length - 1, idx));
  }, [state.tracks.length]);

  // Snapping for item drag end
  const snapTime = useCallback((t: number, altKey: boolean) => {
    if (altKey) return Math.max(0, t);
    const snapSec = 1;
    const sec = Math.round(t / snapSec) * snapSec;
    const playheadSec = state.currentTime || 0;
    const candidates = [sec, playheadSec];
    let best = t;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const d = Math.abs(c - t);
      if ((d * state.pxPerSecond) <= 6 && d < bestDist) { best = c; bestDist = d; }
    }
    return Math.max(0, best);
  }, [state.currentTime, state.pxPerSecond]);

  // Prevent overlaps on a track by clamping start
  const clampNoOverlap = useCallback((trackId: string, itemId: string, start: number, len: number) => {
    const sameTrack = state.items.filter(it => it.trackId === trackId && it.id !== itemId).sort((a,b) => a.start - b.start);
    let s = Math.max(0, start), e = s + len;
    // Find neighbors
    const prev = [...sameTrack].reverse().find(it => it.start <= s);
    const next = sameTrack.find(it => it.start >= s);
    if (prev && s < prev.end) { s = prev.end; e = s + len; }
    if (next && e > next.start) { s = Math.max(0, next.start - len); e = s + len; }
    return { start: s, end: e };
  }, [state.items]);

  const handleItemDragEnd = useCallback((id: string, absX: number, absY: number, altKey?: boolean) => {
    const newStartSec = Math.max(0, viewOffsetSec + (absX / state.pxPerSecond));
    const snappedStart = snapTime(newStartSec, !!altKey);
    const toIdx = getTrackIndexFromY(absY);
    const toTrack = state.tracks[toIdx]?.id ?? state.tracks[0]?.id;
    const it = state.items.find(x => x.id === id);
    if (!it || !toTrack) return;
    const len = Math.max(0.1, it.end - it.start);
    const clamped = clampNoOverlap(toTrack, id, snappedStart, len);
    moveItem(id, toTrack, clamped.start);
  }, [state.pxPerSecond, viewOffsetSec, state.tracks, state.items, snapTime, getTrackIndexFromY, clampNoOverlap, moveItem]);

  // Keyboard precision: when a handle was last active, arrows adjust
  const containerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.5 : 0.05;
    if (e.key === "ArrowLeft") {
      if (dragMode === "out") setOutPoint((state.outPoint || 0) - step);
      else setInPoint((state.inPoint || 0) - step);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      if (dragMode === "out") setOutPoint((state.outPoint || 0) + step);
      else setInPoint((state.inPoint || 0) + step);
      e.preventDefault();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      // Allow removing currently selected timeline item (videos or audio) via keyboard
      const sel = state.selectedItemId;
      if (sel) {
        deleteItem(sel);
        e.preventDefault();
      }
    }
  }, [dragMode, setInPoint, setOutPoint, state.inPoint, state.outPoint]);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-300">Timeline</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Zoom</span>
            <input
              type="range"
              min={Math.max(1, Math.floor(minPps))}
              max={Math.max(1, Math.ceil(maxPps))}
              step={1}
              value={state.pxPerSecond}
              onChange={(e) => {
                const v = Number(e.target.value);
                const clamped = Math.max(minPps, Math.min(v, maxPps));
                setPxPerSecond(clamped);
              }}
              disabled={!canZoom}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">View</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, (state.duration || 0) - visibleWindowSec)}
              step={0.01}
              value={Math.max(0, Math.min(viewOffsetSec, Math.max(0, (state.duration || 0) - visibleWindowSec)))}
              onChange={(e) => {
                const duration = state.duration || 0;
                const maxOffset = Math.max(0, duration - visibleWindowSec);
                const v = Number(e.target.value);
                setViewOffsetSec(Math.max(0, Math.min(v, maxOffset)));
              }}
              disabled={(state.duration || 0) <= visibleWindowSec}
              className="w-48"
            />
          </div>
          <label className="text-xs text-gray-400 ml-3 flex items-center gap-1 select-none">
            <input type="checkbox" checked={!!state.loopTrim} onChange={(e) => setLoopTrim(e.target.checked)} />
            Loop trim
          </label>
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: timelineHeight }} tabIndex={0} onKeyDown={containerKeyDown}>
        <Stage
          width={timelineWidth}
          height={timelineHeight}
          ref={stageRef}
          onMouseDown={handleDown}
          onMouseMove={handleMove}
          onMouseUp={handleUp}
          onMouseLeave={handleLeave}
        >
          {/* Static layer: background, grid, track bands */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={timelineWidth} height={timelineHeight} fill="#1f2937" />
            {grid.map((g, i) => (
              <Group key={i}>
                <Line
                  points={[g.x, 0, g.x, timelineHeight]}
                  stroke={g.major ? "#374151" : "#2d3748"}
                  strokeWidth={g.major ? 1 : 0.5}
                />
                {g.major && g.label && g.x >= 0 && g.x <= timelineWidth && (
                  <Text x={g.x + 4} y={4} text={g.label} fontSize={12} fill="#9ca3af" />
                )}
              </Group>
            ))}
            {state.tracks.map((track, idx) => (
              <Rect
                key={`band-${track.id}`}
                x={0}
                y={idx * (rowHeight + trackGap)}
                width={timelineWidth}
                height={rowHeight}
                fill="#111827"
                opacity={0.6}
              />
            ))}
          </Layer>

          {/* Content layer: items, trim overlay/handles/tooltip, playhead */}
          <Layer>
            {state.tracks.map((track, idx) => (
              <TrackLayer
                key={track.id}
                track={track}
                items={state.items.filter(it => it.trackId === track.id)}
                y={idx * (rowHeight + trackGap)}
                height={rowHeight}
                width={timelineWidth}
                pxPerSecond={state.pxPerSecond}
                viewOffsetSec={viewOffsetSec}
                selectedItemId={state.selectedItemId}
                onItemDragMove={() => { /* visual drag handled by Konva; snap on end */ }}
                onItemDragEnd={(id, absX, absY) => handleItemDragEnd(id, absX, absY)}
                onItemMouseDown={(id) => selectItem(id)}
              />
            ))}

            {/* Dim outside trim (global) */}
            <Rect x={0} y={0} width={Math.max(0, inX)} height={timelineHeight} fill="#000" opacity={0.15} />
            <Rect x={Math.max(outX, 0)} y={0} width={Math.max(0, timelineWidth - outX)} height={timelineHeight} fill="#000" opacity={0.15} />
            {/* Trim selection highlight */}
            <Rect x={Math.max(0, inX)} y={Math.max(0, (rowHeight/2 - 18))} width={Math.max(0, outX - inX)} height={36} fill="#10b981" opacity={0.15} cornerRadius={6} />
            {/* Handles */}
            <Rect x={Math.max(0, inX) - 6} y={4} width={12} height={Math.max(44, tracksHeight - 8)} fill="#10b981" opacity={0.35} cornerRadius={3} />
            <Rect x={Math.max(0, outX) - 6} y={4} width={12} height={Math.max(44, tracksHeight - 8)} fill="#ef4444" opacity={0.35} cornerRadius={3} />
            {showTooltip && (
              <Group>
                <Rect x={showTooltip.x + 8} y={8} width={70} height={22} fill="#111827" opacity={0.9} cornerRadius={4} />
                <Text x={showTooltip.x + 12} y={12} text={showTooltip.label} fontSize={12} fill="#e5e7eb" />
              </Group>
            )}

            {/* Playhead */}
            <Line points={[playheadX, 0, playheadX, timelineHeight]} stroke="#f59e0b" strokeWidth={2} />
          </Layer>
        </Stage>
        {/* Footer labels in tidy box */}
        <div className="mt-2 bg-gray-800 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 flex gap-6">
          <div>In: <span className="text-gray-100">{formatTime(state.inPoint || 0)}</span></div>
          <div>Out: <span className="text-gray-100">{formatTime(state.outPoint || 0)}</span></div>
          <div>Len: <span className="text-gray-100">{formatTime(Math.max(0, (state.outPoint || 0) - (state.inPoint || 0)))}</span></div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;


