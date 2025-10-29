import React from "react";
import { useTimeline } from "../../context/TimelineContext";

/**
 * OverlayMenu: minimal UI to add a text overlay item on O1 at current playhead.
 */
const OverlayMenu: React.FC = () => {
  const timeline = useTimeline();
  const addOverlay = () => {
    const id = `ov_${Date.now()}`;
    const start = Math.max(0, timeline.state.currentTime || 0);
    const end = start + 3;
    const overlayTrack = timeline.state.tracks.find(t => t.kind === "overlay")?.id || "O1";
    timeline.addItem({
      id,
      mediaId: -1,
      path: "",
      trackId: overlayTrack,
      start,
      end,
      trimIn: 0,
      trimOut: 0,
      overlayText: "Text",
      overlayX: 0.5,
      overlayY: 0.85,
      overlayFontSize: 24,
      overlayColor: "#ffffff",
      overlayAlign: "center",
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-black text-xs"
        onClick={addOverlay}
      >
        Add Text Overlay
      </button>
    </div>
  );
};

export default OverlayMenu;


