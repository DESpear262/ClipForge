import React from "react";
import MenuBar from "./components/MenuBar";
import MainView from "./components/MainView";
import ErrorBoundary from "./components/ErrorBoundary";
import { TauriProvider } from "./context/TauriContext";

/**
 * Main application entry point for ClipForge
 * 
 * Wraps the entire application in an ErrorBoundary to handle React errors
 * gracefully and log them to the console. Provides Tauri context for cross-component
 * communication.
 */
function App() {
  return (
    <ErrorBoundary>
      <TauriProvider>
        <div className="flex flex-col h-screen bg-gray-900 text-white">
          <MenuBar />
          <MainView />
        </div>
      </TauriProvider>
    </ErrorBoundary>
  );
}

export default App;

