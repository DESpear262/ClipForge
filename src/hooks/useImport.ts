import { useCallback } from "react";
import { useProject } from "../context/ProjectContext";
import { useToastContext } from "../context/ToastContext";
import { invoke } from "@tauri-apps/api/core";
import { useFFmpeg } from "./useFFmpeg";

/**
 * Supported video file extensions
 */
const SUPPORTED_FORMATS = [".mp4", ".mov", ".webm"];

/**
 * Check if a file has a supported video format
 */
const isSupportedFormat = (fileName: string): boolean => {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
  return SUPPORTED_FORMATS.includes(ext);
};

/**
 * Custom hook for importing video files
 * 
 * Provides functions to import files via drag-and-drop or file picker
 */
export const useImport = () => {
  const { addClip, setClipMetadata } = useProject();
  const { showToast } = useToastContext();
  const { probeMetadata } = useFFmpeg();

  /**
   * Open file picker dialog to select a video file
   */
  const openFileDialog = useCallback(async () => {
    console.log("[useImport] openFileDialog called");
    
    try {
      console.log("[useImport] Invoking open_file_dialog command");
      const result = await invoke<{ path: string; name: string } | null>(
        "open_file_dialog",
        {}
      );

      console.log("[useImport] open_file_dialog result:", result);

      if (!result) {
        console.log("[useImport] User cancelled file selection");
        return; // User cancelled
      }

      if (isSupportedFormat(result.name)) {
        console.log("[useImport] Format validated, adding clip:", result);
        const clipId = addClip(result.path, result.name);
        showToast("Video imported successfully", "success");
        console.log("[useImport] Clip added and toast shown");
        
        // Auto-probe metadata
        try {
          console.log("[useImport] Starting metadata probe...");
          const metadata = await probeMetadata(result.path);
          if (metadata) {
            setClipMetadata(clipId, metadata);
            showToast("Metadata extracted successfully", "success");
            console.log("[useImport] Metadata probe successful:", metadata);
          } else {
            showToast("Failed to extract metadata", "warning");
            console.log("[useImport] Metadata probe returned null");
          }
        } catch (error) {
          console.error("[useImport] Metadata probe error:", error);
          showToast("Failed to extract metadata", "warning");
        }
      } else {
        console.log("[useImport] Unsupported format:", result.name);
        showToast("Unsupported file format", "error");
      }
    } catch (error) {
      console.error("[useImport] File import error:", error);
      showToast("Failed to import file", "error");
    }
  }, [addClip, showToast]);

  /**
   * Handle file dropped on import zone
   * 
   * For MVP, we'll use the file picker instead when files are dropped
   * Full drag-and-drop path handling will be enhanced in future iterations
   */
  const handleDrop = useCallback(
    (files: FileList | null) => {
      console.log("[useImport] handleDrop called with:", files);
      if (!files || files.length === 0) {
        console.log("[useImport] No files in FileList");
        return;
      }

      // MVP: Only handle single file
      const file = files[0];
      console.log("[useImport] Processing file:", file.name);

      if (!isSupportedFormat(file.name)) {
        console.log("[useImport] Unsupported format:", file.name);
        showToast("Unsupported file format. Please use .mp4, .mov, or .webm", "error");
        return;
      }

      // For now, prompt user to select file via file picker
      // Future: Extract file path from dropped files in Tauri
      console.log("[useImport] File dropped (not yet implemented):", file.name);
      showToast("Please use the 'Select File' button for now", "info");
    },
    [showToast]
  );

  return {
    openFileDialog,
    handleDrop,
  };
};

