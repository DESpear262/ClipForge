import React from "react";
// PROTOTYPE: useTimeline import removed - component disabled and returns null

/**
 * OverlayMenu: PROTOTYPE CODE - FEATURE NEVER COMPLETED
 * 
 * This component was intended to add text overlay items to the timeline. While the
 * UI button and data model were implemented, the actual text rendering during export
 * was never fully integrated. The button has been removed from the UI but the code
 * is preserved here for reference.
 * 
 * Overlay items can be added to timeline (data model exists), but text overlays are
 * not rendered in the final exported video through the export pipeline.
 */
const OverlayMenu: React.FC = () => {
  // PROTOTYPE: Component disabled - button removed from UI
  // Overlay data model exists but overlays are not rendered in exported video
  return null;
  
  /* PROTOTYPE CODE BELOW - NOT FUNCTIONAL
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
  */
};

export default OverlayMenu;


