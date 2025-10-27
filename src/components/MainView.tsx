import React from "react";

/**
 * Main content area component
 * 
 * This will be populated with the video preview, timeline, and editor components
 * in subsequent PRs. For now, displays a welcome screen.
 */
const MainView: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">ClipForge</h1>
        <p className="text-gray-400 text-lg">
          Lightweight Desktop Video Editor
        </p>
        <p className="text-gray-500 text-sm mt-4">
          Import a video file to get started
        </p>
      </div>
    </div>
  );
};

export default MainView;

