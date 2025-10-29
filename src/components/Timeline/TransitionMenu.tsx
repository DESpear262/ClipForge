import React, { useMemo } from "react";
import { useTimeline } from "../../context/TimelineContext";

/**
 * TransitionMenu: minimal UI to add transitions between adjacent items on V1.
 */
const TransitionMenu: React.FC = () => {
  const timeline = useTimeline();

  const v1Items = useMemo(() => timeline.state.items.filter(it => it.trackId === (timeline.state.tracks[0]?.id || "V1"))
    .sort((a,b) => a.start - b.start), [timeline.state.items, timeline.state.tracks]);

  const addBetweenAdjacent = (type: "crossfade" | "fadeblack") => {
    if (v1Items.length < 2) return;
    // Find neighbor at/after playhead
    const t = timeline.state.currentTime || 0;
    let idx = v1Items.findIndex(it => it.start >= t);
    if (idx <= 0) idx = 1; // ensure we have a previous
    const prev = v1Items[idx - 1];
    const next = v1Items[idx];
    if (!prev || !next) return;
    const duration = 1.0;
    const id = `tr_${Date.now()}`;
    timeline.addTransition({ id, fromItemId: prev.id, toItemId: next.id, type, duration });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-black text-xs"
        onClick={() => addBetweenAdjacent("crossfade")}
      >
        Add Crossfade
      </button>
      <button
        className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-black text-xs"
        onClick={() => addBetweenAdjacent("fadeblack")}
      >
        Add Fade to Black
      </button>
    </div>
  );
};

export default TransitionMenu;


