# ClipForge Sprint 2 – Parallel Task Blocks (Revised)

## Overview
All task chains are now dependency-consistent.  
- **Parallelizable:** Blocks A (Recording) and B (Timeline) can run concurrently because they serve distinct pipelines (input capture vs. editing).  
- **AI Features (Block C)** depends on both A and B.  
- **Export (Block D)** depends on B (and indirectly on A via shared media inputs).  
- **Testing & Packaging (Block E)** depends on all P0/P1 blocks.  
- **Stretch Goal Blocks (F1–F3)** depend *only* on completion of Block E and are mutually parallel.

---

## 🔴 BLOCK A: Recording & Capture Chain
**Dependencies:** None – Start Immediately  
**Parallelization:** Runs in parallel with Block B  

### PR #1: Screen Recording (Windows.Graphics.Capture)
**Prerequisites:** None  

#### Tasks
- Implement Rust module for screen/window capture using Windows.Graphics.Capture  
- Provide list of available windows/screens via Tauri command  
- Add “Record Screen” button and source selector in UI  
- Stream captured frames to temporary file (H.264 or VP9)  
- Integrate start/stop buttons and visual state indicator  

#### Files Created
- `src-tauri/src/recording.rs`  
- `src/hooks/useRecorder.ts`  
- `src/components/Recorder/ScreenRecorder.tsx`  

#### Files Modified
- `tauri.conf.json` – add capture permissions  
- `src/App.tsx` – add UI entrypoint  

#### Validation
- Selectable source list works  
- Screen capture functions on Windows 10/11  
- Video playable and importable into timeline  

---

### PR #2: Webcam Recording
**Prerequisites:** PR #1 complete  

#### Tasks
- Implement webcam preview using `navigator.mediaDevices.getUserMedia()`  
- Record webcam video (H.264) to local file  
- Sync start/stop with screen recording if both active  
- Allow independent webcam-only recording  

#### Files Created
- `src/components/Recorder/WebcamRecorder.tsx`  

#### Validation
- Webcam preview and capture work correctly  
- File saved and playable  
- Works concurrently with screen capture  

---

### PR #3: Microphone Audio Capture
**Prerequisites:** PR #1 (Screen Recording)  

#### Tasks
- Record microphone audio using `navigator.mediaDevices.getUserMedia({ audio: true })`  
- Mux audio into recording file via FFmpeg subprocess  
- Add microphone source selector  
- Provide visual waveform for input activity  

#### Files Created
- `src/components/Recorder/AudioMeter.tsx`  
- `src-tauri/src/audio.rs`  

#### Validation
- Audio recorded cleanly without clipping  
- Audio syncs to video within 100 ms  
- Output muxed MP4 playable with audio/video aligned  

---

### PR #4: Combined Recording Session Management
**Prerequisites:** PR #1–3 complete  

#### Tasks
- Merge streams (screen + webcam + audio)  
- Provide overlay layout selector (e.g., PiP corner)  
- Handle simultaneous start/stop operations  
- Store recording metadata for timeline import  

#### Files Modified
- `src/components/Recorder/RecorderPanel.tsx`  
- `src-tauri/src/recording.rs`  

#### Validation
- Combined recording stable for 15+ minutes  
- Audio sync maintained  
- Output file ready for editing  

---

## 🟢 BLOCK B: Multi-Clip Timeline Editing Chain
**Dependencies:** None – Start Immediately  
**Parallelization:** Runs in parallel with Block A  

### PR #5: Multi-Track Timeline Infrastructure
**Prerequisites:** None  

#### Tasks
- Extend timeline for multiple video/audio tracks  
- Implement drag/drop between tracks  
- Maintain per-track ordering and metadata  
- Add snapping and zoom  
- Persist project state with multiple tracks  

#### Files Created
- `src/components/Timeline/TrackLayer.tsx`  
- `src/context/TimelineContext.tsx`  

#### Validation
- Multiple tracks functional  
- Snap-to-grid and zoom responsive  
- Timeline JSON saves/loads correctly  

---

### PR #6: Transitions & Overlays (Base)
**Prerequisites:** PR #5 complete  

#### Tasks
- Add “Add Transition” and “Add Overlay” buttons  
- Implement crossfade and fade-to-black  
- Add static text overlays (no animation)  
- Apply effects in preview and export  

#### Files Created
- `src/components/Timeline/TransitionMenu.tsx`  
- `src/components/Timeline/OverlayMenu.tsx`  

#### Validation
- Transitions apply correctly  
- Overlays visible in preview/export  
- Playback performance unaffected  

---

## 🔵 BLOCK C: AI Features Implementation
**Dependencies:** BLOCK A + BLOCK B  
**Parallelization:** Starts after A and B; runs alongside Block D  

### PR #7: Transcription (Whisper Integration)
**Prerequisites:** PR #4 (Recording complete)  

#### Tasks
- Integrate Whisper binary or API  
- Extract per-word timestamps  
- Save transcripts to `/transcripts/<clip_id>.json`  
- Add “Transcribe Audio” button to AI Tools panel  
- Render transcript view  

#### Validation
- Accurate 2-minute clip transcription  
- JSON includes timestamps  
- Transcript renders properly  

---

### PR #8: Highlight Extraction (LLM Tool Invocation)
**Prerequisites:** PR #7  

#### Tasks
- Add “Find Highlights” button to panel  
- Send transcript JSON to GPT-4o-mini (OpenAI API)  
- Parse response for tool call `setClipHighlight`  
- Validate schema and handle errors  

#### Validation
- Valid tool call JSON received  
- Graceful error handling  
- User toast on network failure  

---

### PR #9: Trim Handle Application
**Prerequisites:** PR #8  

#### Tasks
- Implement `setTrimPoints()`  
- Sync handles to timestamps  
- Update export range and visual bounds  

#### Validation
- Handles match timestamps  
- Export respects bounds  
- UI consistent  

---

### PR #10: AI Tools Panel Integration
**Prerequisites:** PR #7–9  

#### Tasks
- Build sidebar panel  
- Add buttons and loading states  
- Display errors and logs  

#### Validation
- Full pipeline functional  
- Errors user-friendly  
- End-to-end highlight extraction works  

---

## 🟣 BLOCK D: Export & Rendering Enhancements
**Dependencies:** BLOCK B + BLOCK C  
**Parallelization:** Concurrent with late-stage AI integration  

### PR #11: Multi-Track FFmpeg Export
**Prerequisites:** PR #5  

#### Tasks
- Build filter graph for multi-track export  
- Include transitions and overlays  
- Emit progress events  
- Support resolution selection  

#### Validation
- Successful export  
- Audio/video sync  
- Progress bar accurate  

---

### PR #12: Audio Enhancements (Normalization, Fades)
**Prerequisites:** PR #11  

#### Tasks
- Implement volume normalization + fade filters  
- Add sliders for volume/fade  
- Persist settings in project JSON  

#### Validation
- Normalization and fades render correctly  

---

## 🟠 BLOCK E: Testing, QA & Packaging
**Dependencies:** All P0/P1 Blocks (A–D)  
**Parallelization:** None  

### PR #13: Integration Testing & Bug Fixes
- Validate recording → timeline → AI → export  
- Check FPS, memory, export time  
- Fix sync and crashes  

### PR #14: Windows Build & Final QA
- Validate sidecar paths  
- Pass SmartScreen  
- Document issues and release notes  

---

## 🟡 BLOCK F1: Animated Text Overlays (Optional)
**Dependencies:** BLOCK E complete  
**Parallelization:** Independent  

### Tasks
- Add animated text layers  
- CSS transitions in preview; FFmpeg filters in export  

---

## 🟢 BLOCK F2: Export Presets (Optional)
**Dependencies:** BLOCK E complete  
**Parallelization:** Independent  

### Tasks
- Create YouTube/TikTok presets  
- Apply default resolutions and aspect ratios  

---

## 🔵 BLOCK F3: Keyboard Shortcuts & Undo/Redo (Optional)
**Dependencies:** BLOCK E complete  
**Parallelization:** Independent  

### Tasks
- Implement Ctrl+Z/Ctrl+Y  
- Add common shortcuts (cut, play, stop)  

---

## 📊 Dependency Graph

```
FOUNDATION (PARALLEL)
├─ BLOCK A – Recording & Capture
│   ├ PR #1 Screen Recording
│   ├ PR #2 Webcam Recording
│   ├ PR #3 Microphone Audio
│   └ PR #4 Combined Recording
└─ BLOCK B – Timeline Editing
    ├ PR #5 Multi-Track Infrastructure
    └ PR #6 Transitions & Overlays

MID-TIER (PARALLEL)
├ BLOCK C – AI Features
│   ├ PR #7 Transcription
│   ├ PR #8 Highlight Extraction
│   ├ PR #9 Trim Handles
│   └ PR #10 AI Panel
└ BLOCK D – Export
    ├ PR #11 Multi-Track Export
    └ PR #12 Audio Enhancements

FINAL INTEGRATION
└ BLOCK E – Testing & Packaging
    ├ PR #13 Integration Testing
    └ PR #14 Release

POST-RELEASE (OPTIONAL)
├ BLOCK F1 – Animated Text
├ BLOCK F2 – Export Presets
└ BLOCK F3 – Shortcuts & Undo/Redo
```

---

## 🧭 Execution Strategy

### Phase 1 – Foundations
Run **BLOCK A** and **BLOCK B** in parallel.  
Coordinate shared data formats early.  

### Phase 2 – AI and Export
Start **BLOCK C** and **BLOCK D** after A + B complete.  
Develop AI highlight pipeline and export simultaneously.  

### Phase 3 – QA and Packaging
Execute **BLOCK E** sequentially to ship v0.2.0.  

### Phase 4 – Optional Enhancements
After QA, run **F1–F3** concurrently.  

### Critical Success Factors
1. Whisper → GPT-4o-mini → Trim pipeline fully functional.  
2. Recording/export stable for ≥15 minutes.  
3. Timeline performance ≥30 fps.  
4. Packaged build standalone with sidecars.  
