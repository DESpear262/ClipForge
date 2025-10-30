# ClipForge Product Requirements Document  
## Sprint 2 – Advanced Editing & AI Highlight Extraction  
**Version:** 0.2.0 (Windows Build, Tauri v1)  
**Deployment Target:** Packaged native `.exe` via Tauri v1 bundler  

---

## Executive Summary  

**ClipForge Sprint 2** expands the MVP into a fully featured desktop video editor with integrated AI capabilities.  
This release implements all core items from the original specification except for stretch goals, while introducing a **headline AI feature** — *Automatic Highlight Extraction*.  

Users will be able to:
- Record screen, webcam, and microphone audio directly within ClipForge  
- Import multiple clips and arrange them on a multi-track timeline  
- Add overlays, transitions, and text  
- Automatically extract “viral moment” highlights using AI transcription and semantic analysis  
- Export full edits or AI-selected clips directly to MP4  

The AI system leverages **Whisper** for transcription and **OpenAI’s GPT-4o-mini** to identify and set highlight gates automatically.  

All functionality must remain fully compatible with **Tauri v1**, ensuring stability, native performance, and secure local operations.

---

## User Stories  

### Recording & Capture  
- **As a user**, I want to record my screen, webcam, and microphone, so I can capture footage without external tools.  
- **As a user**, I want to record both my screen and webcam simultaneously in picture-in-picture mode.  
- **As a user**, I want audio synchronized automatically with the video tracks.  

### Timeline & Editing  
- **As a user**, I want to import multiple clips and arrange them in sequence.  
- **As a user**, I want to drag clips across multiple tracks (main, overlay, audio).  
- **As a user**, I want to apply basic transitions and text overlays.  
- **As a user**, I want to adjust clip order and timing precisely with snapping and zoom.  
- **As a user**, I want real-time preview playback to remain smooth even with multiple tracks.  

### Export & Project Management  
- **As a user**, I want to export my timeline to MP4 with progress tracking.  
- **As a user**, I want to choose resolution options (720p, 1080p, or source).  
- **As a user**, I want to save and reload project state seamlessly.  

### AI Highlight Extraction (Headline Feature)  
- **As a user**, I want to transcribe a clip’s audio into text with timestamps.  
- **As a user**, I want to see the transcript for review and editing.  
- **As a user**, I want to click “Find Highlights” and let the AI automatically select the most engaging clip segment.  
- **As a user**, I want ClipForge to automatically set the start and end trim handles based on the AI’s suggested timestamps.  
- **As a user**, I want an error message if the LLM API fails or if there’s no internet connection.  

---

## Feature Requirements  

### 1. Screen, Webcam, and Audio Recording  
**Priority:** P0 (Blocker)  

**Requirements:**  
- Record full screen or window using Windows.Graphics.Capture API  
- Webcam capture via `navigator.mediaDevices.getUserMedia()`  
- Simultaneous recording supported (screen + webcam overlay)  
- Audio captured via microphone input with synchronization  
- Save recording as MP4 or WebM directly to local storage  

**Technical Implementation:**  
- Rust backend for screen capture (Tauri command invokes native Windows API)  
- Frontend uses web APIs for webcam preview and audio visualization  
- Combined streams muxed via FFmpeg during recording stop  

**Acceptance Criteria:**  
- [ ] Screen and webcam capture operate concurrently  
- [ ] Audio synchronized within 100 ms  
- [ ] Output playable and importable into timeline  

---

### 2. Multi-Clip Timeline Editing  
**Priority:** P0  

**Requirements:**  
- Multiple video clips and audio tracks  
- Drag-and-drop rearrangement across tracks  
- Snap-to-grid and zoom functionality  
- Overlays and text layers supported  
- Transition effects (crossfade, fade to black, slide)  

**Technical Implementation:**  
- Konva.js canvas-based track visualization  
- Each track rendered as layer group  
- Transition handling via FFmpeg filters during export  
- Project state serialized to JSON  

**Acceptance Criteria:**  
- [ ] Timeline supports at least 5 concurrent clips  
- [ ] Transitions preview correctly in real-time  
- [ ] State loads and saves without corruption  

---

### 3. AI Highlight Extraction Panel  
**Priority:** P0 (Headline Feature)  

**Requirements:**  
- “AI Tools” panel accessible from right-side toolbar  
- Buttons for **Transcribe Audio** and **Find Highlights**  
- Transcription performed via Whisper (local or API)  
- LLM (GPT-4o-mini) analyzes transcript and identifies high-engagement segment  
- LLM returns structured JSON tool call:
  ```json
  {
    "tool": "setClipHighlight",
    "args": { "start_time": 12.34, "end_time": 24.87 }
  }
  ```
- Frontend interprets and applies these timestamps to trim handles automatically  
- Errors (network, malformed response) reported in UI  

**Technical Implementation:**  
- Whisper invoked via Rust subprocess or API request  
- Transcription JSON saved under `/project_root/transcripts/<clip_id>.json`  
- LLM request sent through Rust `reqwest` to OpenAI API  
- Tauri event bridge emits result to React; React dispatches `setTrimPoints()`  
- All API calls wrapped in error handling for network loss or rate limits  

**Acceptance Criteria:**  
- [ ] Transcription generates timestamped text  
- [ ] “Find Highlights” updates trim handles automatically  
- [ ] LLM call returns valid structured response  
- [ ] UI shows descriptive error messages on failure  

---

### 4. Export & Rendering Enhancements  
**Priority:** P1  

**Requirements:**  
- Multi-track composition export via FFmpeg filter complex graph  
- Progress bar in export dialog  
- Audio normalization and fade in/out  
- Resolution selector (720p, 1080p, source)  

**Technical Implementation:**  
- FFmpeg sidecar invoked with filter graph generated dynamically  
- Rust command emits periodic progress updates via events  
- Save file selection handled via Tauri’s `dialog::save_file()`  

**Acceptance Criteria:**  
- [ ] Multi-track export renders without errors  
- [ ] Audio and video remain synchronized  
- [ ] Progress feedback accurate  

---

### 5. Project Persistence & Metadata  
**Priority:** P1  

**Requirements:**  
- Project JSON includes clips, positions, track types, trims, transitions, transcripts  
- Autosave after every major edit  
- Manual Save/Load from File menu  

**Technical Implementation:**  
- Serialized JSON stored under `/projects/*.clipforge.json`  
- Version field for forward compatibility  
- Path resolution handled via Tauri v1 `path` API  

**Acceptance Criteria:**  
- [ ] Projects save and reload successfully  
- [ ] File version compatibility maintained  

---

### 6. Optional Stretch Goals  
**Priority:** P2 (Nice-to-Have)  
- Text overlays with animations  
- Audio fade tools  
- Export presets for YouTube, TikTok  
- Keyboard shortcuts and undo/redo  

---

## Technical Stack  

### Frontend  
- **Framework:** React + TypeScript (Vite)  
- **Canvas Engine:** Konva.js  
- **AI Tools Panel:** Custom React component using hooks for API communication  
- **Styling:** Tailwind CSS  

### Backend  
- **Framework:** Tauri v1 (Rust)  
- **APIs:**  
  - Screen capture via Windows.Graphics.Capture (Rust)  
  - FFmpeg (sidecar binary) for processing and muxing  
  - Whisper (via subprocess or API) for transcription  
  - OpenAI GPT-4o-mini (via HTTPS `reqwest`) for LLM highlight detection  

---

## Key Architectural Decisions  

1. Maintain Full Tauri v1 Compatibility  
2. Sidecar-First Design  
3. AI Tool Modularity  
4. Event-Driven Synchronization  
5. Structured Tool Calls from LLM  

---

## Testing Requirements  

### Functional  
1. Record screen, webcam, and microphone simultaneously.  
2. Import multiple clips and edit on multi-track timeline.  
3. Export full timeline to MP4 with accurate trimming.  
4. Transcribe clip → find highlights → update trim automatically.  
5. Handle OpenAI API failure gracefully.  

### Performance  
- Maintain ≥30 fps timeline performance with 10 clips.  
- Export 2-minute multi-track video under 60 seconds.  
- LLM response time under 10 seconds for 2-minute transcript.  

---

## Development Stages  
1. Recording & Capture  
2. Multi-Track Timeline  
3. AI Highlight System  
4. Export & QA  

---

## Success Metrics  
- [ ] Screen, webcam, and audio capture functional  
- [ ] Multi-clip timeline supports drag, trim, and transitions  
- [ ] AI Tools panel transcribes and detects highlights correctly  
- [ ] Export outputs playable MP4 with highlight clip option  
- [ ] All components fully Tauri v1 compliant  
- [ ] Packaged `.exe` runs standalone  

---

## Known Limitations  
- Whisper latency proportional to clip length  
- Single-clip highlight detection only  
- Internet required for AI  
