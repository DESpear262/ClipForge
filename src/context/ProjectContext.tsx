import React, { createContext, useContext, useState } from "react";
import type { VideoMetadata } from "../types/media";

/**
 * Single imported clip in the project
 */
export interface ProjectClip {
  id: string;
  filePath: string;
  fileName: string;
  metadata?: VideoMetadata;
}

/**
 * Playback state for video player
 */
export interface PlaybackState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

/**
 * Project state interface
 */
interface ProjectState {
  clips: ProjectClip[];
  activeClipId: string | null;
  playback: PlaybackState;
  clipTrimById?: Record<string, { inPoint: number; outPoint: number }>;
}

/**
 * Context interface for project state management
 */
interface ProjectContextType {
  state: ProjectState;
  addClip: (filePath: string, fileName: string) => string; // Returns clip ID
  setClipMetadata: (clipId: string, metadata: VideoMetadata) => void;
  setActiveClip: (clipId: string | null) => void;
  clearProject: () => void;
  updatePlayback: (playback: Partial<PlaybackState>) => void;
  setClipTrim: (clipId: string, inPoint: number, outPoint: number) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

/**
 * Hook to access project context
 */
export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
};

/**
 * Project context provider component
 * 
 * Manages imported clips and project state for the entire app
 */
export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ProjectState>({
    clips: [],
    activeClipId: null,
    playback: {
      currentTime: 0,
      duration: 0,
      isPlaying: false,
    },
    clipTrimById: {},
  });

  /**
   * Add a new clip to the project
   */
  const addClip = (filePath: string, fileName: string): string => {
    console.log("[ProjectContext] addClip called with:", { filePath, fileName });
    const id = `clip_${Date.now()}`;
    const newClip: ProjectClip = {
      id,
      filePath,
      fileName,
    };

    console.log("[ProjectContext] New clip:", newClip);

    setState((prev) => {
      console.log("[ProjectContext] Previous state:", prev);
      const newState = {
        ...prev,
        clips: [...prev.clips, newClip],
        activeClipId: id,
      };
      console.log("[ProjectContext] New state:", newState);
      return newState;
    });

    return id;
  };

  /**
   * Set metadata for a clip (called in PR #4 after probing)
   */
  const setClipMetadata = (clipId: string, metadata: VideoMetadata) => {
    setState((prev) => ({
      ...prev,
      clips: prev.clips.map((clip) =>
        clip.id === clipId ? { ...clip, metadata } : clip
      ),
    }));
  };

  /**
   * Set the active clip
   */
  const setActiveClip = (clipId: string | null) => {
    setState((prev) => ({
      ...prev,
      activeClipId: clipId,
    }));
  };

  /**
   * Update playback state
   */
  const updatePlayback = (playback: Partial<PlaybackState>) => {
    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, ...playback },
    }));
  };

  /**
   * Clear all clips from the project
   */
  const clearProject = () => {
    setState({
      clips: [],
      activeClipId: null,
      playback: {
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
      clipTrimById: {},
    });
  };

  /**
   * Store trim range for a given clip id
   */
  const setClipTrim = (clipId: string, inPoint: number, outPoint: number) => {
    setState((prev) => ({
      ...prev,
      clipTrimById: { ...(prev.clipTrimById || {}), [clipId]: { inPoint, outPoint } },
    }));
  };

  return (
    <ProjectContext.Provider
      value={{ state, addClip, setClipMetadata, setActiveClip, clearProject, updatePlayback, setClipTrim }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

