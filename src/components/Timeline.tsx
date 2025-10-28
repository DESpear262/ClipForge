import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Rect, Text, Group } from "react-konva";
import { useTimeline } from "../context/TimelineContext";

/**
 * Konva-based single-clip timeline with grid, clip bar, and playhead.
 *
 * - Renders a horizontal time grid with adaptive tick spacing
 * - Shows a single clip block from 0..duration
 * - Playhead follows currentTime; click/drag to seek
 * - Zoom via slider adjusts pxPerSecond
 */
const Timeline: React.FC = () => {
  const { state, setCurrentTime, setPxPerSecond, requestSeek, setInPoint, setOutPoint, setTrimRange, setLoopTrim } = useTimeline();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 800, height: 160 });
  const [isDragging, setIsDragging] = useState(false);

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
  const timelineHeight = size.height;
  const totalPx = (state.duration || 0) * state.pxPerSecond;

  // Compute dynamic minimum px/sec so full video fits at min zoom
  const dynamicMinPps = useMemo(() => {
    const d = state.duration || 0;
    if (d <= 0) return 1;
    return Math.max(1, timelineWidth / d);
  }, [timelineWidth, state.duration]);

  // Ensure pxPerSecond is never below dynamic min (e.g., on resize or duration change)
  useEffect(() => {
    if (state.pxPerSecond < dynamicMinPps) {
      setPxPerSecond(dynamicMinPps);
    }
  }, [dynamicMinPps, state.pxPerSecond, setPxPerSecond]);

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
    const duration = state.duration || 0;
    const end = Math.max(duration, timelineWidth / state.pxPerSecond);
    const addLines = (step: number, isMajor: boolean) => {
      for (let t = 0; t <= end + 0.0001; t += step) {
        const x = t * state.pxPerSecond;
        lines.push({ x, major: isMajor, label: isMajor ? formatTime(t) : undefined });
      }
    };
    addLines(minorEverySec, false);
    addLines(majorEverySec, true);
    return lines;
  }, [state.duration, state.pxPerSecond, majorEverySec, minorEverySec, timelineWidth]);

  // Trim and playhead geometry
  const inX = (state.inPoint || 0) * state.pxPerSecond;
  const outX = (state.outPoint || 0) * state.pxPerSecond;
  const playheadX = (state.currentTime || 0) * state.pxPerSecond;

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
    const clampedX = Math.max(0, Math.min(x, (state.duration || 0) * state.pxPerSecond));
    const t = clampedX / state.pxPerSecond;
    return Math.max(0, Math.min(t, state.duration || Number.MAX_SAFE_INTEGER));
  }, [state.pxPerSecond, state.duration]);

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
    }
  }, [dragMode, setInPoint, setOutPoint, state.inPoint, state.outPoint]);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-300">Timeline</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Zoom</span>
          <input
            type="range"
            min={Math.max(1, Math.floor(dynamicMinPps))}
            max={2000}
            step={1}
            value={state.pxPerSecond}
            onChange={(e) => setPxPerSecond(Math.max(dynamicMinPps, Number(e.target.value)))}
            className="w-40"
          />
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
          <Layer listening={false}>
            {/* Background */}
            <Rect x={0} y={0} width={timelineWidth} height={timelineHeight} fill="#1f2937" />
          </Layer>
          <Layer listening={false}>
            {/* Grid */}
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
          </Layer>
          <Layer listening={false}>
            {/* Clip block (single clip from 0..duration) */}
            <Rect
              x={0}
              y={timelineHeight / 2 - 18}
              width={Math.max(timelineWidth, totalPx)}
              height={36}
              fill="#2563eb"
              opacity={0.25}
              cornerRadius={6}
            />
            {/* Dim outside trim */}
            <Rect x={0} y={0} width={Math.max(0, inX)} height={timelineHeight} fill="#000" opacity={0.15} />
            <Rect x={Math.max(outX, 0)} y={0} width={Math.max(0, timelineWidth - outX)} height={timelineHeight} fill="#000" opacity={0.15} />
            {/* Trim selection highlight */}
            <Rect x={Math.max(0, inX)} y={timelineHeight / 2 - 18} width={Math.max(0, outX - inX)} height={36} fill="#10b981" opacity={0.25} cornerRadius={6} />
            {/* Handles */}
            <Rect x={Math.max(0, inX) - 6} y={timelineHeight / 2 - 22} width={12} height={44} fill="#10b981" opacity={0.85} cornerRadius={3} />
            <Rect x={Math.max(0, outX) - 6} y={timelineHeight / 2 - 22} width={12} height={44} fill="#ef4444" opacity={0.85} cornerRadius={3} />
            {showTooltip && (
              <Group>
                <Rect x={showTooltip.x + 8} y={8} width={70} height={22} fill="#111827" opacity={0.9} cornerRadius={4} />
                <Text x={showTooltip.x + 12} y={12} text={showTooltip.label} fontSize={12} fill="#e5e7eb" />
              </Group>
            )}
          </Layer>
          <Layer>
            {/* Playhead */}
            <Line points={[playheadX, 0, playheadX, timelineHeight]} stroke="#f59e0b" strokeWidth={2} />
          </Layer>
          <Layer>
            {/* Interaction overlay to ensure pointer events are captured across the surface */}
            <Rect
              x={0}
              y={0}
              width={timelineWidth}
              height={timelineHeight}
              fill="rgba(0,0,0,0)"
              onMouseDown={handleDown}
              onMouseMove={handleMove}
              onMouseUp={handleUp}
              onMouseLeave={handleLeave}
            />
          </Layer>
        </Stage>
        {/* Footer labels */}
        <div className="mt-2 text-xs text-gray-300">
          In: {formatTime(state.inPoint || 0)} | Out: {formatTime(state.outPoint || 0)} | Len: {formatTime(Math.max(0, (state.outPoint || 0) - (state.inPoint || 0)))}
        </div>
      </div>
    </div>
  );
};

export default Timeline;


