import React, { useState, Suspense } from "react";
import type { MediaDto } from "../utils/api";

const RecorderPanel = React.lazy(() => import("./Recorder/RecorderPanel"));

const AIToolsPanel = React.lazy(() => import("./AI/ToolsPanel"));

interface RightToolbarProps {
  selected?: MediaDto | null;
}

const RightToolbar: React.FC<RightToolbarProps> = ({ selected }) => {
  const [tab, setTab] = useState<"recording" | "ai">("recording");

  return (
    <div className="w-96 border-l border-gray-800 bg-gray-900 flex flex-col">
      <div className="px-4 pt-3 pb-2 border-b border-gray-800 flex items-center gap-2">
        <button
          onClick={() => setTab("recording")}
          className={`px-3 py-1 rounded text-sm font-medium ${tab === "recording" ? "bg-gray-200 text-black" : "bg-gray-700 text-gray-200 hover:bg-gray-600"}`}
        >
          Recording
        </button>
        <button
          onClick={() => setTab("ai")}
          className={`px-3 py-1 rounded text-sm font-medium ${tab === "ai" ? "bg-gray-200 text-black" : "bg-gray-700 text-gray-200 hover:bg-gray-600"}`}
        >
          AI Tools
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "recording" && (
          <Suspense fallback={<div className="text-xs text-gray-400">Loading…</div>}>
            <RecorderPanel />
          </Suspense>
        )}
        {tab === "ai" && (
          <Suspense fallback={<div className="text-xs text-gray-400">Loading…</div>}>
            <AIToolsPanel selected={selected} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default RightToolbar;
