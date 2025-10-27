# ClipForge Product Requirements Document

## Tauri + React (Konva) Implementation

**Project Type**: Lightweight Desktop Video Editor\
**Target Platform**: Windows (x64)\
**Development Framework**: Tauri (Rust backend) + React + Konva.js +
FFmpeg\
**Timeline**: MVP (first release), followed by incremental updates\
**Deployment**: Packaged native `.exe` build via Tauri bundler

------------------------------------------------------------------------

## Executive Summary

ClipForge is a lightweight, native Windows desktop video editor designed
for speed, simplicity, and stability.\
The MVP centers on the core workflow: **import → preview → trim →
export**, providing users with a fast and intuitive editing loop.

Unlike traditional non-linear editors that are heavy and complex,
ClipForge leverages a **Rust backend** for high-performance media
handling and a **React/Konva frontend** for smooth visual editing.\
Future iterations will expand functionality to include screen and webcam
recording, multi-track editing, and AI-assisted workflows---but the MVP
focuses exclusively on the essential editing experience.

------------------------------------------------------------------------

## User Stories

### Core Video Workflow

-   **As a user**, I want to import video files into the editor, so I
    can begin editing my media.\
-   **As a user**, I want to preview my imported clips in a video
    player, so I can see what I'm editing.\
-   **As a user**, I want to trim clips by setting start and end points,
    so I can remove unwanted portions.\
-   **As a user**, I want to export my trimmed video as an MP4 file, so
    I can share or archive it.\
-   **As a user**, I want the app to feel responsive and fast, so
    editing remains smooth even on modest hardware.

### File Handling

-   **As a user**, I want to drag and drop files or use a file picker to
    import videos.\
-   **As a user**, I want to see clip metadata (duration, resolution,
    file size) for reference.

### Project State

-   **As a user**, I want my trim settings and imported clips to persist
    until I clear them manually, so I can safely close and reopen the
    app.

------------------------------------------------------------------------

## MVP Feature Requirements

### 1. Application Shell

**Priority**: P0 (Blocker)

**Requirements** - Windows desktop application built with Tauri\
- Main window hosts the React frontend\
- Toolbar or menu bar with Import, Export, and Help\
- App branding (icon, title, version)

**Technical Implementation** - Tauri main process using Rust and
WebView2\
- React frontend bundled via Vite\
- Minimal Tauri allowlist (`fs`, `dialog`, `path`, `process`)

**Acceptance Criteria** - \[ \] App launches cleanly on Windows 10/11\
- \[ \] Window displays React UI correctly\
- \[ \] Toolbar/menu items are responsive\
- \[ \] App exits without error messages

------------------------------------------------------------------------

### 2. Video Import

**Priority**: P0 (Blocker)

**Requirements** - Import via drag-and-drop or "Import File" button\
- Supported formats: `.mp4`, `.mov`, `.webm`\
- Extract and display metadata (duration, resolution, file size)

**Technical Implementation** - Use Tauri `dialog::FileDialog` and Rust's
FFmpeg `ffprobe` for metadata\
- Return structured metadata to frontend via Tauri command\
- Frontend stores clip data in React state

**Acceptance Criteria** - \[ \] User can import videos by drag/drop or
picker\
- \[ \] Metadata appears accurately\
- \[ \] Unsupported formats trigger error message\
- \[ \] Import is stable and repeatable

------------------------------------------------------------------------

### 3. Video Preview Player

**Priority**: P0 (Blocker)

**Requirements** - Play, pause, and scrub through video\
- Display current playback position and total duration\
- Keep playhead synced with timeline

**Technical Implementation** - HTML5 `<video>` element in React\
- Local file paths resolved using `convertFileSrc()`\
- Playback time bound to timeline state

**Acceptance Criteria** - \[ \] Video playback is smooth (≥30 fps)\
- \[ \] Timeline cursor syncs accurately with playback\
- \[ \] User controls (play/pause/seek) respond instantly\
- \[ \] No playback lag or audio desync

------------------------------------------------------------------------

### 4. Timeline View (Konva.js)

**Priority**: P0 (Blocker)

**Requirements** - Display clip segment on a horizontal timeline canvas\
- Allow resizing of handles to set trim in/out points\
- Show playhead indicator and time grid\
- Provide zoom control for precision editing

**Technical Implementation** - Konva.js layers for grid, clip track, and
playhead\
- Time scaling logic managed via React state\
- Cached layers for high performance

**Acceptance Criteria** - \[ \] Timeline renders cleanly\
- \[ \] Trimming handles move smoothly\
- \[ \] Playhead position accurately mirrors playback\
- \[ \] No redraw lag or input delay

------------------------------------------------------------------------

### 5. Trim Functionality

**Priority**: P0 (Blocker)

**Requirements** - Set trim in/out points on a single clip\
- Store trim settings in React state and project JSON\
- Export operation uses trim parameters

**Technical Implementation** - Frontend sends trim data (start/end time
in seconds) to Rust\
- Rust invokes FFmpeg using `-ss` and `-to` flags\
- Emit progress and success events through Tauri

**Acceptance Criteria** - \[ \] Trim range reflects in both preview and
export\
- \[ \] Exported clip duration matches trim precisely\
- \[ \] Progress updates visible during processing

------------------------------------------------------------------------

### 6. Export to MP4

**Priority**: P0 (Blocker)

**Requirements** - Export trimmed segment to MP4\
- Show progress bar and completion message\
- User selects save location

**Technical Implementation** - FFmpeg executed from Rust using
`tauri::api::process::Command`\
- Progress parsed from stderr and emitted as events\
- Save path handled via `dialog::save_file()`

**Acceptance Criteria** - \[ \] Exported file playable in standard
Windows players\
- \[ \] Progress bar updates accurately\
- \[ \] No crashes or incomplete renders

------------------------------------------------------------------------

### 7. Build & Packaging

**Priority**: P0 (Blocker)

**Requirements** - Generate `.exe` build via `cargo-tauri build`\
- Bundle FFmpeg as a native sidecar\
- Validate all paths in packaged mode

**Technical Implementation** - Sidecar defined in `tauri.conf.json`\
- Build tested with Windows Defender SmartScreen compliance\
- Resource paths resolved dynamically via `app_handle.path_resolver()`

**Acceptance Criteria** - \[ \] Packaged build runs standalone on
Windows\
- \[ \] FFmpeg executes successfully\
- \[ \] No missing files or permission issues

------------------------------------------------------------------------

## Technical Stack

### Frontend

-   **Language**: TypeScript\
-   **Framework**: React + Vite\
-   **Canvas Engine**: Konva.js\
-   **State Management**: React hooks (useState/useReducer)\
-   **Video Playback**: HTML5 `<video>` element\
-   **Styling**: Tailwind CSS or simple CSS Modules

### Backend

-   **Language**: Rust\
-   **Framework**: Tauri\
-   **Media Processor**: FFmpeg (native sidecar binary)\
-   **IPC Communication**: Tauri Commands & Events\
-   **File Handling**: Tauri FS & Dialog APIs

### Build & Deployment

-   **Build Tool**: Cargo + Tauri bundler\
-   **Target**: Windows x64 `.exe`\
-   **Versioning**: Semantic (v0.1.0-mvp)

------------------------------------------------------------------------

## Key Architectural Decisions

### 1. Native FFmpeg Integration

**Decision**: Ship FFmpeg as a bundled sidecar binary.\
**Rationale**: Guarantees full functionality offline and ensures
predictable behavior on Windows systems.

### 2. Konva.js Timeline Rendering

**Decision**: Use Konva.js for GPU-accelerated 2D editing UI.\
**Rationale**: Provides performant canvas operations and intuitive
interaction for trimming and playhead control.

### 3. Project State Serialization

**Decision**: Store clip and trim data in local JSON.\
**Rationale**: Enables future autosave and project reopening features
without database complexity.

### 4. Secure Windows Context

**Decision**: Minimize Windows permissions and sandbox API access.\
**Rationale**: Reduces security risks while retaining full file system
functionality for imports/exports.

### 5. Event-Based Communication

**Decision**: Use Tauri event bus for progress updates and IPC.\
**Rationale**: Keeps Rust tasks isolated and frontend reactive without
blocking the main thread.

------------------------------------------------------------------------

## Testing Requirements

### MVP Test Scenarios

1.  **Import**: Import multiple supported video formats and verify
    metadata accuracy.\
2.  **Preview**: Confirm smooth playback and playhead synchronization.\
3.  **Trim**: Adjust in/out points and verify playback and exported
    range match.\
4.  **Export**: Export to MP4, confirm file integrity and correct trim.\
5.  **Build**: Launch packaged `.exe` and confirm sidecar paths resolve
    correctly.\
6.  **Performance**: Verify timeline remains responsive with multiple
    clips imported.

------------------------------------------------------------------------

## Development Stages

### Stage 1: Foundation

**Goal**: Launchable app with import and metadata display.\
**Tasks** - Initialize Tauri + React project\
- Integrate FFmpeg sidecar\
- Implement import and metadata extraction

**Deliverable**: Running desktop app that imports and displays clip info

------------------------------------------------------------------------

### Stage 2: Preview & Timeline

**Goal**: Implement video preview and timeline visualization.\
**Tasks** - Add HTML5 video player\
- Create Konva-based timeline\
- Sync playhead with playback

**Deliverable**: Visual timeline and responsive preview

------------------------------------------------------------------------

### Stage 3: Trim & Export

**Goal**: Enable trimming and export workflow.\
**Tasks** - Implement trim handles and data storage\
- Execute FFmpeg trim/export from Rust\
- Add progress events and notifications

**Deliverable**: User can trim and export a working MP4 file

------------------------------------------------------------------------

### Stage 4: Packaging & QA

**Goal**: Build shippable Windows executable.\
**Tasks** - Build `.exe` via Tauri bundler\
- Validate FFmpeg sidecar execution\
- Run all MVP test cases\
- Document known issues

**Deliverable**: Stable, distributable MVP build

------------------------------------------------------------------------

## Success Metrics

### MVP Success Criteria

-   [ ] App launches successfully on Windows\
-   [ ] Import, preview, trim, and export workflows all function
    end-to-end\
-   [ ] Exported clips are playable and correctly trimmed\
-   [ ] Timeline remains responsive at ≥30 fps\
-   [ ] No runtime crashes or FFmpeg failures\
-   [ ] Packaged `.exe` build runs without dependencies

### Performance Targets

-   Launch time: \<5 seconds\
-   Timeline latency: \<50ms\
-   Playback frame rate: ≥30 fps\
-   Export 1-minute clip in \<15 seconds on typical CPU

------------------------------------------------------------------------

## Known Limitations (MVP)

-   No recording features (screen, webcam, audio)\
-   No transitions, overlays, or effects\
-   Single-track timeline only\
-   No undo/redo or autosave\
-   Supported formats limited to MP4, MOV, WebM\
-   No cloud export or sharing integration

------------------------------------------------------------------------

## Security & Permissions (Windows)

-   Tauri app manifest declares access to video, audio, and file APIs\
-   FFmpeg executed within controlled process scope\
-   File read/write limited to user-selected directories via dialogs\
-   No elevated privileges required for operation

**Rationale**: Ensures safe execution and compliance with Windows UAC
standards while maintaining full functionality for local media
operations.

------------------------------------------------------------------------

## Resources

-   [Tauri Documentation](https://tauri.app/v1/guides/)\
-   [Konva.js Documentation](https://konvajs.org/docs/)\
-   [FFmpeg Official Docs](https://ffmpeg.org/documentation.html)\
-   [Microsoft WebView2
    Docs](https://learn.microsoft.com/en-us/microsoft-edge/webview2/)

------------------------------------------------------------------------

**Document Version**: 1.1\
**Last Updated**: October 27, 2025\
**Owner**: ClipForge Development Team
