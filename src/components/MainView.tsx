import React from "react";
import MediaLibrary from "./MediaLibrary";

/**
 * Main content area component
 * 
 * Displays the import zone when no video is loaded,
 * will show video preview and timeline in future PRs
 */
const MainView: React.FC = () => {
  return <MediaLibrary />;
};

export default MainView;
