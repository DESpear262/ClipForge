import React from "react";
import MenuBar from "./components/MenuBar";
import MainView from "./components/MainView";
import ErrorBoundary from "./components/ErrorBoundary";
import { TauriProvider } from "./context/TauriContext";
import { ProjectProvider } from "./context/ProjectContext";
import { ToastProvider, useToastContext } from "./context/ToastContext";
import { ToastContainer } from "./components/Toast";

/**
 * Main content component that has access to toast context
 */
const AppContent: React.FC = () => {
  const { toasts, dismissToast } = useToastContext();
  
  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-white overflow-hidden">
      <MenuBar />
      <div className="flex-1 overflow-hidden">
        <MainView />
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

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
        <ProjectProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </ProjectProvider>
      </TauriProvider>
    </ErrorBoundary>
  );
}

export default App;
