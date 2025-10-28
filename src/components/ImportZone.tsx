import React, { useState, useRef } from "react";
import { useImport } from "../hooks/useImport";
import { useProject } from "../context/ProjectContext";
import ClipCard from "./ClipCard";

/**
 * Import zone component with drag-and-drop functionality
 * 
 * Provides visual feedback for dragging files and handles file selection
 */
const ImportZone: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { handleDrop, openFileDialog } = useImport();
  const { state } = useProject();

  console.log("[ImportZone] State:", state);

  // Check if a file has already been imported (MVP: single import)
  const hasImportedFile = state.clips.length > 0;

  /**
   * Handle drag enter
   */
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasImportedFile) {
      setIsDragging(true);
    }
  };

  /**
   * Handle drag leave
   */
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  /**
   * Handle drag over (required to allow drop)
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * Handle file drop
   */
  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (hasImportedFile) {
      return;
    }

    const files = e.dataTransfer.files;
    handleDrop(files);
  };

  /**
   * Handle click to select file
   */
  const handleClick = async () => {
    console.log("[ImportZone] handleClick called");
    if (hasImportedFile) {
      console.log("[ImportZone] Already has imported file, returning");
      return;
    }

    console.log("[ImportZone] Calling openFileDialog");
    await openFileDialog();
  };

  /**
   * Handle file input change
   */
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasImportedFile) {
      return;
    }

    const files = e.target.files;
    if (files) {
      handleDrop(files);
    }
  };

  // If file already imported, show the clip card
  if (hasImportedFile) {
    const clip = state.clips[0]; // MVP: single clip
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950 p-8">
        <div className="w-full max-w-md">
          <ClipCard 
            clip={clip} 
            onRetryProbe={() => {
              // This will be handled by ClipCard internally
            }}
          />
          <div className="mt-4 text-center">
            <p className="text-gray-400 text-sm">
              Timeline and preview will appear here in PR #6
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 flex items-center justify-center bg-gray-950 relative transition-colors ${
        isDragging ? "bg-blue-950" : ""
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFiles}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.webm"
        onChange={handleFileInput}
        className="hidden"
      />

      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center max-w-md transition-all ${
          isDragging
            ? "border-blue-400 bg-blue-950 bg-opacity-50"
            : "border-gray-600"
        }`}
        onClick={handleClick}
      >
        <div className="text-6xl mb-4">📹</div>
        {isDragging ? (
          <>
            <h2 className="text-2xl font-bold mb-2 text-blue-400">
              Drop Video Here
            </h2>
            <p className="text-gray-400">Release to import</p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-2">
              Drag & Drop Video
            </h2>
            <p className="text-gray-400 mb-4">
              or click to select a file
            </p>
            <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded text-black font-semibold">
              Select File
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Supported: .mp4, .mov, .webm
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ImportZone;
