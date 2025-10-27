import React from "react";
import { useTauriContext } from "../context/TauriContext";

/**
 * Menu bar component providing application menu items
 * 
 * Displays Import, Export, and Help menu options at the top of the window
 */
const MenuBar: React.FC = () => {
  const { showImportDialog, showExportDialog, showHelpDialog } = useTauriContext();

  /**
   * Handle import button click
   * Calls the Tauri context function which will be implemented in PR #3
   */
  const handleImport = async () => {
    await showImportDialog();
  };

  /**
   * Handle export button click
   * Calls the Tauri context function which will be implemented in PR #8
   */
  const handleExport = async () => {
    await showExportDialog();
  };

  /**
   * Handle help button click
   * Displays version and basic information about the application
   */
  const handleHelp = () => {
    showHelpDialog();
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
      <div className="flex gap-4">
        <button
          onClick={handleImport}
          className="px-4 py-2 hover:bg-gray-700 rounded transition-colors"
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="px-4 py-2 hover:bg-gray-700 rounded transition-colors"
        >
          Export
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">ClipForge</span>
        <button
          onClick={handleHelp}
          className="px-4 py-2 hover:bg-gray-700 rounded transition-colors"
        >
          Help
        </button>
      </div>
    </div>
  );
};

export default MenuBar;

