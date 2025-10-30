import React, { useMemo } from "react";
import { useTimeline } from "../../context/TimelineContext";

/**
 * TransitionMenu: PROTOTYPE CODE - FEATURE NEVER COMPLETED
 * 
 * This component was intended to add transitions (crossfade/fade-to-black) between
 * adjacent timeline items. While the UI buttons were implemented, the actual transition
 * rendering and export integration was never completed. The buttons have been removed
 * from the UI but the code is preserved here for reference.
 * 
 * The transition data model exists in TimelineContext (addTransition, transitions state),
 * but transitions are not rendered during preview or exported in the final video.
 */
const TransitionMenu: React.FC = () => {
  // PROTOTYPE: Component disabled - buttons removed from UI
  // The transition data model exists but transitions are not rendered or exported
  return null;
  
  /* PROTOTYPE CODE BELOW - NOT FUNCTIONAL
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
  */
};

export default TransitionMenu;


