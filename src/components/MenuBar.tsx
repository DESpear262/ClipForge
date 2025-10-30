import React from "react";
import { useTauriContext } from "../context/TauriContext";

/**
 * Menu bar component providing application menu items
 * 
 * Displays Import, Export, and Help menu options at the top of the window
 */
const MenuBar: React.FC = () => {
  const { showImportDialog, showHelpDialog, showExportDialog } = useTauriContext();

  /**
   * Handle import button click
   * Calls the Tauri context function which will be implemented in PR #3
   */
  const handleImport = async () => {
    await showImportDialog();
  };

  /**
   * Handle delete button click
   * Dispatches a delete request event to be handled by the media library
   */
  const handleDelete = async () => {
    try {
      console.log("[MenuBar] Delete clicked - dispatching request-delete event");
      const ev = new CustomEvent("request-delete");
      window.dispatchEvent(ev);
    } catch (e) {
      console.error("Delete trigger error:", e);
    }
  };

  /**
   * Handle export button click
   * Dispatches a request to export current trim selection
   */
  const handleExport = async () => {
    try {
      console.log("[MenuBar] Export clicked - dispatching request-export event");
      await showExportDialog();
    } catch (e) {
      console.error("Export trigger error:", e);
    }
  };

  /**
   * Handle help button click
   * Displays version and basic information about the application
   */
  const handleHelp = () => {
    showHelpDialog();
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 relative flex items-center justify-between w-full">
      <div className="flex gap-2">
        <button
          onClick={handleImport}
          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-black rounded-md transition-colors font-medium"
        >
          Import
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-2 bg-red-200 hover:bg-red-300 text-black rounded-md transition-colors font-medium"
        >
          Delete
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-black rounded-md transition-colors font-medium"
        >
          Export
        </button>
      </div>
      {/* Centered title overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <span className="text-xl md:text-2xl font-bold text-gray-200">ClipForge</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleHelp}
          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-black rounded-md transition-colors font-medium"
        >
          Help
        </button>
      </div>
    </div>
  );
};

export default MenuBar;

