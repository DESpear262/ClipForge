import React from "react";
import AudioMeter from "./AudioMeter";
import ScreenRecorder from "./ScreenRecorder";
import WebcamRecorder from "./WebcamRecorder";
import CombinedRecorder from "./CombinedRecorder";

// RecorderPanel: groups recording controls in a scrollable box
const RecorderPanel: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">Recording Controls</div>
      <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-300">Microphone</div>
        <AudioMeter />
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-300">Screen Record</div>
        <ScreenRecorder />
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-300">Webcam</div>
        <WebcamRecorder />
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-300">Combined (PiP)</div>
        <CombinedRecorder />
      </div>
    </div>
  );
};

export default RecorderPanel;


