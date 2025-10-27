# ClipForge MVP – Parallel Task Blocks

## Overview
Tasks are organized into **dependency chains** that can be developed in parallel.  
Each block is independent unless explicitly marked with prerequisites.

**Goal:** Deliver a functional MVP implementing the full `Import → Preview → Trim → Export` loop, packaged as a native `.exe` via Tauri.

---

## 🔴 BLOCK A: Core Framework & Infrastructure Chain
**Dependencies:** None – start immediately  
**Critical Path:** All other blocks depend on this foundation  

---

### PR #1: Tauri App Shell & Frontend Bridge
**Prerequisites:** None  

#### Tasks
- [x] Initialize Tauri + React (Vite) project structure  
- [x] Configure WebView2 integration and Rust entry point  
- [x] Implement main window with menu bar (Import, Export, Help)  
- [x] Set up secure Tauri allowlist (`fs`, `dialog`, `path`, `process`)  
- [x] Implement Tauri → React IPC using commands and events  
- [x] Set up error boundary and logging to Rust console  

#### Files Created
- `src-tauri/src/main.rs`  
- `src/App.tsx`  
- `src/utils/tauriBridge.ts`  

#### Files Modified
- `tauri.conf.json` – allowlist and sidecar definitions  
- `src-tauri/Cargo.toml` – dependencies (`tauri`, `serde`, `tokio`)  

#### Testing (Manual)
- [x] App launches on Windows 10/11 without errors  
- [x] Menu bar options respond without crashes  
- [x] Frontend loads React bundle in WebView2  

#### Validation
- [x] Stable app shell launches successfully  
- [x] IPC commands work both ways  
- [x] Secure allowlist configuration verified  

---

### PR #2: FFmpeg Sidecar Integration
**Prerequisites:** PR #1 (App Shell)  

#### Tasks
- [x] Bundle native FFmpeg and FFprobe binaries as sidecars  
- [x] Verify process execution via `tauri::api::process::Command`  
- [x] Implement basic command wrapper in Rust (`execute_ffmpeg`, `probe_metadata`)  
- [x] Emit stdout/stderr as events to frontend  
- [x] Add error handling and status codes  

#### Files Created
- `src-tauri/src/ffmpeg.rs`  
- `src/hooks/useFFmpeg.ts`  

#### Files Modified
- `tauri.conf.json` – sidecar paths  
- `Cargo.toml` – add `anyhow`, `serde_json`  

#### Testing (Manual)
- [x] FFprobe returns duration and codec info for sample file  
- [x] FFmpeg command executes successfully (e.g., trim 5 seconds)  

#### Validation
- [x] FFmpeg and FFprobe accessible through Tauri  
- [x] No crashes when invoked multiple times  

---

## 🟢 BLOCK B: Media Import & Metadata Chain
**Dependencies:** BLOCK A (Core Framework & FFmpeg)  

---

### PR #3: File Import System
**Prerequisites:** PR #1 and PR #2  

#### Tasks
- [x] Implement drag-and-drop import zone  
- [x] Integrate Tauri `dialog::FileDialog` for manual import  
- [x] Filter for `.mp4`, `.mov`, `.webm`  
- [x] Return absolute path to Rust backend for validation  
- [x] Handle unsupported formats gracefully  

#### Files Created
- `src/components/ImportDialog.tsx`  
- `src/hooks/useImport.ts`  

#### Files Modified
- `src/App.tsx` – add import button/zone  

#### Testing (Manual)
- [x] Drag-and-drop works on Windows desktop  
- [x] Invalid formats show error toast  
- [x] Paths resolve correctly through Tauri  

#### Validation
- [x] Import pipeline stable  
- [x] Files validated before metadata probe  

---

### PR #4: Metadata Extraction (FFprobe)
**Prerequisites:** PR #2 (FFmpeg Integration)  

#### Tasks
- [x] Invoke `ffprobe` to fetch duration, resolution, bitrate  
- [x] Return JSON object to frontend  
- [x] Display metadata under clip thumbnail  
- [x] Add basic type definitions (`VideoMetadata`)  

#### Files Created
- `src-tauri/src/metadata.rs`  
- `src/types/media.ts`  

#### Files Modified
- `src/components/ImportDialog.tsx` – show metadata  

#### Testing (Manual)
- [x] Metadata matches Windows Explorer properties  
- [x] Multiple imports display correctly  

#### Validation
- [x] Metadata accurate and formatted  
- [x] Handles non-UTF8 filenames  

---

## 🔵 BLOCK C: Timeline & Preview Chain
**Dependencies:** BLOCK A (Core) + BLOCK B (Media Import)  

---

### PR #5: HTML5 Video Preview
**Prerequisites:** PR #3 (File Import)  

#### Tasks
- [x] Embed HTML5 `<video>` element with custom controls  
- [x] Convert file paths via `convertFileSrc()`  
- [x] Bind play/pause/seek events to state  
- [x] Display current time / duration  
- [x] Handle invalid source gracefully  

#### Files Created
- `src/components/VideoPlayer.tsx`  

#### Files Modified
- `src/App.tsx` – wire player component  

#### Testing
- [x] Playback 30 fps+ without stutter  
- [x] Seek and pause responsive  
- [x] No security errors from local file access  

#### Validation
- [x] Preview synchronizes with imported clip  

---

### PR #6: Konva Timeline Editor
**Prerequisites:** PR #5 (Video Preview)  

#### Tasks
- [x] Set up Konva stage and layers (grid, clips, playhead)  
- [x] Render clip block representing duration  
- [x] Implement scroll + zoom  
- [x] Add playhead tracking linked to video time  
- [x] Cache layers for performance  

#### Files Created
- `src/components/Timeline.tsx`  
- `src/context/TimelineContext.tsx`  

#### Testing (Manual)
- [x] Playhead moves in sync with preview  
- [x] Zoom does not introduce lag  
- [x] Multiple imports render sequentially  

#### Validation
- [x] Timeline operational and responsive  

---

## 🟡 BLOCK D: Trimming & Export Chain
**Dependencies:** BLOCK C (Timeline) + BLOCK B (FFmpeg Integration)  

---

### PR #7: Trim Handles & In/Out Points
**Prerequisites:** PR #6 (Timeline Editor)  

#### Tasks
- [x] Add drag-based handles to timeline clip  
- [x] Show tooltip with timestamp on hover  
- [x] Persist trim points to React state / JSON  
- [x] Reflect trim in video preview  

#### Files Created
- `src/components/TrimHandles.tsx`  

#### Files Modified
- `src/context/TimelineContext.tsx` – add trim state  

#### Testing
- [x] Handles move smoothly  
- [x] Trim range saves and loads correctly  

#### Validation
- [x] User can set in/out points visually  

---

### PR #8: FFmpeg Export Pipeline
**Prerequisites:** PR #7 (Trim Handles)  

#### Tasks
- [x] Send trim data to Rust backend  
- [x] Execute FFmpeg with `-ss` and `-to` flags  
- [x] Emit progress events to frontend  
- [x] Display progress bar and completion dialog  
- [x] Handle errors with fallback message  

#### Files Created
- `src-tauri/src/export.rs`  
- `src/hooks/useExport.ts`  

#### Files Modified
- `src/components/ExportDialog.tsx`  

#### Testing
- [x] Exported clip matches trim range exactly  
- [x] Progress updates accurately  
- [x] Output file plays in Windows Media Player  

#### Validation
- [x] Export flow complete and stable  

---

## 🟣 BLOCK E: Packaging & QA Chain
**Dependencies:** All previous blocks  

---

### PR #9: Windows Build & Resource Validation
**Prerequisites:** PR #8 (Export Pipeline)  

#### Tasks
- [x] Configure Tauri for Windows build target (`cargo-tauri build --target x86_64-pc-windows-msvc`)  
- [x] Validate FFmpeg sidecar paths  
- [x] Sign and test binary launch  
- [x] Verify SmartScreen trust flow  
- [x] Package assets (icon, version metadata)  

#### Files Modified
- `tauri.conf.json` – Windows bundle settings  
- `src/assets/icon.ico`  

#### Testing
- [x] Executable runs standalone  
- [x] No missing resources or permission errors  

#### Validation
- [x] Shippable binary produced  

---

### PR #10: QA Testing & Stability Checklist
**Prerequisites:** PR #9 (Build Complete)  

#### Tasks
- [x] Execute MVP test scenarios (import, preview, trim, export)  
- [x] Stress-test timeline with 10+ clips  
- [x] Monitor memory usage for 15 minutes  
- [x] Verify launch time < 5 s  
- [x] Document known issues in `docs/KNOWN_ISSUES.md`  

#### Files Created
- `docs/TEST_REPORT.md`  
- `docs/KNOWN_ISSUES.md`  

#### Validation
- [x] All MVP criteria met  
- [x] QA documentation complete  

---

## 📊 Dependency Graph

```
INDEPENDENT BLOCK (Start Immediately)
└─ BLOCK A: Core Framework & FFmpeg Integration
      ├─ PR #1 (App Shell & Frontend Bridge)
      └─ PR #2 (FFmpeg Sidecar Integration)

MEDIA PIPELINE CHAIN
└─ BLOCK B: Import & Metadata
      ├─ PR #3 (File Import)
      └─ PR #4 (Metadata Extraction)

TIMELINE & PREVIEW CHAIN
└─ BLOCK C: Timeline & Preview
      ├─ PR #5 (Video Preview)
      └─ PR #6 (Konva Timeline Editor)

EXPORT CHAIN
└─ BLOCK D: Trimming & Export
      ├─ PR #7 (Trim Handles)
      └─ PR #8 (FFmpeg Export Pipeline)

PACKAGING & QA CHAIN
└─ BLOCK E: Packaging & Testing
      ├─ PR #9 (Windows Build Validation)
      └─ PR #10 (QA Testing & Stability)
```

---

## Recommended Execution Strategy

### Phase 1 – Foundation
- Start **BLOCK A** immediately (core infrastructure).  
- Once FFmpeg is integrated, begin BLOCK B for import and metadata.

### Phase 2 – Editing Core
- Parallelize **BLOCK C** (Timeline & Preview) and **BLOCK D** (Trim & Export) after import pipeline is stable.  
- Ensure IPC events between Rust and React are synchronous before export work.

### Phase 3 – Packaging & QA
- When the export pipeline passes functional tests, start **BLOCK E** for build and validation.  
- Run the MVP test suite and document performance metrics.

### Critical Success Factors
1. **FFmpeg integration** must be rock-solid before timeline work.  
2. **Timeline latency** under 50 ms is essential for perceived responsiveness.  
3. **Packaged .exe** should run without runtime dependencies.  
4. **QA docs** ensure verifiability for submission.
