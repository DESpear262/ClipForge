# Active Context: ClipForge

## Current Work Focus
**Primary Task**: Final QA and Sprint 2 Block A/B. Import/preview, Konva timeline (PR #6), trim handles (PR #7), export pipeline (PR #8), and packaging/startup flow are complete on Tauri v1. PR #1 (Screen Recording) implemented using FFmpeg gdigrab with start/stop/events and UI entrypoint. PR #2 (Webcam Recording) implemented via MediaRecorder → WebM → backend transcode (MP4) with auto-import. Recording controls moved to a right-hand toolbar with tabs (Recording, AI placeholder). Voiceover flow added: reuse Mic Recorder and mux onto screen capture after stop; screen control has a checkbox to enable.

## Recent Changes
- ✅ Aligned documentation to Tauri v1 (removed v2 references)
- ✅ Implemented Konva Timeline (single-clip) with playhead sync and zoom
- ✅ Added `TimelineContext` and integrated under `MediaLibrary`
- ✅ Exposed `onReady` control API from `VideoPlayer` (seek/play/pause)
- ✅ Fixed timeline format-time init bug and seek registration bug
- ✅ Implemented PR #7: trim handles, selection drag, snapping, keyboard precision, loop toggle
- ✅ Dynamic min zoom so full clip fits at minimum zoom
- ✅ After setting gates, playhead snaps to in-point if outside
- ✅ Fixed provider-order/hook usage and removed noisy logs
- ✅ Implemented PR #8: export pipeline with progress events using FFmpeg (`-progress pipe:1`)
- ✅ Frontend export UI (button in preview panel) with progress percent and error display
- ✅ Menu bar: replaced Export with Delete button; dispatches `request-delete` custom event
- ✅ Media library: delete handler with confirmation, reload, next-item selection, and last-selected fallback to handle transient deselection
- ✅ Rust fix: import `tauri::Manager` to enable `emit_all` on `AppHandle`
 - ✅ Packaging: corrected Tauri custom protocol enablement and startup
   - Cargo features: `default=["custom-protocol"]`, `custom-protocol=["tauri/custom-protocol"]`
   - Window creation in code: prod → `WindowUrl::App("index.html")`, dev → `WindowUrl::External("http://localhost:1420")`
   - Vite `base:'./'` to ensure relative asset paths in production
   - Verified embedded assets load; no `chrome-error://chromewebdata/`
 - ✅ UI polish: centered header title, full-window layout, metadata card, tidy in/out/len box
 - ✅ Progress toasts: import success, preview start/progress/success, export percent + success
- ✅ JSON persistence: trims per path, timeline zoom, loop toggle, last-selected path
- ✅ Right-hand toolbar: new `RightToolbar` with tabs; Recording tab hosts stacked, labeled controls
- ✅ Microphone preview/record stability: preserved state, debounced getUserMedia, resume AudioContext
- ✅ Mic recorder lifecycle: start (no timeslice), stop waits for final chunk; UI flags wired onstart/onstop
- ✅ Added timeline injection for mic-only audio to track A1 at playhead
- ✅ Backend logging: ffmpeg args + stderr forwarded over `record:ffmpeg`; chosen system audio device printed
- ✅ Screen voiceover: checkbox in Screen Record starts mic capture; on stop, backend muxes mic M4A onto screen MP4 to produce `_vo.mp4`, then imports that
- ✅ System audio level meter in Screen Record (tries loopback-like audioinput); shows hint if unavailable
- ✅ Allowlist update: enabled `tauri.path` for appDataDir
 - ✅ Allowlist update: enabled `fs.exists` to support post-record existence check before import
- ✅ Timeline warning fix: defer `setClipTrim` via `queueMicrotask` to avoid cross-provider setState
- ✅ PR #5 (Sprint 2 – Block B): Multi-track timeline infrastructure
  - Tracks: V1 (video), A1 (audio), O1 (overlay)
  - Timeline items with media refs, start/end, trimIn/trimOut
  - Drag between tracks and along time with snapping and no-overlap guard
  - Persistence: `timelineDoc` (tracks + items) in project state
  - UI: Add-to-timeline button in preview panel
 - ✅ PR #6: Transitions & Overlays (preview)
   - Transition model with crossfade/fade-to-black between adjacent items (default 1s)
   - TransitionMenu to add transitions near playhead (V1)
   - OverlayMenu to add text overlays on O1 with position/color/size
   - TimelinePreview stacks players to visualize crossfade; fade-to-black via black overlay
   - Overlays rendered as HTML in preview; persisted with timelineDoc
 - ↩ Media Library tabs reverted
   - Attempted Video/Audio tabs and audio library; reverted per product decision
   - Library now displays videos only; code comment left in `MediaLibrary.tsx` as breadcrumb to revisit later

## Active Development
**PR Status**: PR #1 (App Shell & Bridge) ✅, PR #2 (FFmpeg Probe) ✅, PR #3 (File Import) ✅, PR #5 (Video Preview) ✅, PR #6 (Konva Timeline) ✅, PR #7 (Trim Handles) ✅, PR #8 (Export Pipeline) ✅, PR #5 (Sprint 2 Block B – Multi-track) ✅, PR #6 (Transitions & Overlays preview) ✅, PR #7 (Transcription) 🚧

### What Works
- Tauri application launches successfully (v1)
- React frontend renders in WebView2
- Import via native file dialog; supported formats validated (mp4/mov/webm)
- FFprobe metadata extraction via Rust sidecar wrappers
- HTML5 video preview uses WebM previews (generated on import) and Blob playback
- Asset is used only for static assets/thumbs; playback does not depend on asset in dev
- CSP allows `asset:` and `blob:` media sources
- Error boundary catches React errors gracefully
- IPC bridge and context wiring
 - Konva timeline renders grid/clip, playhead syncs with playback
 - Bi-directional control: clicking/dragging timeline seeks the video
 - Zoom slider adjusts px/second with dynamic min so full video fits
 - Trim handles with snapping (whole seconds, playhead), Alt disables snapping
 - Keyboard precision on handles (0.05s, Shift=0.5s)
 - Loop trim toggle; playback pauses at out if loop off

### Current State
- **ProjectContext** stores clips, playback state, and per-clip trim ranges
- **TimelineContext** provides `currentTime`, `duration`, `pxPerSecond`, trim state, `requestSeek`, and multi-track state (`tracks`, `items`) with CRUD and serialize/hydrate hooks
- **Timeline** renders shared grid/playhead and multiple `TrackLayer` rows; global selection trim preserved; items draggable with seconds/playhead snapping and overlap prevention per track
- **useImport** invokes `open_file_dialog`, validates format, adds clip, triggers probe
- **useFFmpeg** invokes `probe_video_metadata` to read metadata
- **VideoPlayer** uses Blob URLs for `.webm` previews, exposes `onReady` control API
- **CSP** allows `asset:` and `blob:` media sources
- **Export** uses original source path with accurate re-encode defaults (H.264/AAC); emits `export:start|progress|success`
- **Menu/Delete** uses `request-delete` event and last-selected clip fallback to avoid deselection race

### AI Tools (Sprint 2 – Block C)
- 🚧 PR #7: Transcription (Whisper API)
  - Backend: `transcribe_media_cmd` Tauri command calls `whisper::transcribe_media`
  - Audio preprocessing: FFmpeg to mono 16 kHz WAV
  - OpenAI `audio/transcriptions` with `verbose_json` and word/segment timestamps
  - JSON persisted under `app_data_dir()/transcripts/<media_id>.json`
  - Events: `transcript:start|progress|success|error`
  - Frontend: AI Tools panel with "Transcribe Audio" and segment viewer in `RightToolbar` → `AIToolsPanel`
- 🚧 PR #8: Highlight Extraction (GPT-4o-mini)
  - Backend: `find_highlight_cmd` calls `highlight::find_highlight`
  - Loads transcript, sends segments to GPT-4o-mini (json_object), expects `{ tool: setClipHighlight, args: { start_time, end_time } }`
  - Validates and clamps within 5–90s and clip duration, persists `*.highlight.json`
  - Events: `ai:highlight:start|success|error`
  - Frontend: AI Tools panel adds "Find Highlights" and renders suggested range; Preview button seeks to start (no trim changes yet)

### Next Immediate Steps
1. Complete PR #7 (Transcription): finalize Whisper API path and segment viewer polish
2. Start PR #8 (Highlight Extraction): GPT-4o-mini tool call and schema validation
3. QA test pass, performance checks, and docs (PR #10)
4. Optional: add export success actions (Open/Play) and cancel support
5. Continue Memory Bank maintenance

## Active Decisions

### Memory Bank Organization
- **Location**: `memory-bank/` directory at project root
- **Structure**: Six core files (projectbrief, productContext, systemPatterns, techContext, activeContext, progress)
- **Purpose**: Maintain project knowledge between sessions

### Development Strategy
- Follow parallel task blocks from MVP tasks document
- Complete foundation (BLOCK A) before moving to media pipeline (BLOCK B)
- Ensure FFmpeg integration solid before timeline work
- Package and QA as final step (BLOCK E)

## Current Considerations

### Code Quality
- Code is well-documented with inline comments
- Functions are under 75 lines (following user rules)
- Types defined for better TypeScript safety

### Known Gaps
- Screen/window enumeration returns desktop only (Windows list pending)
- Webcam: no progress events during transcode (fast for short clips)
- System-audio loopback is device-dependent; explicit system-audio device selector is planned; without loopback, voiceover checkbox is the supported path

### Upcoming Challenges
- FFmpeg sidecar path resolution in production
- Handling large video files without lag
- Progress feedback during FFmpeg operations
- Keeping dev console noise low while still logging useful diagnostics

## Work in Progress
- Preparing trim handle UI and wiring
- Designing export command interface
- Maintaining documentation

## Immediate Action Items
1. Build `TrimHandles` and state storage
2. Define export command parameters and events
3. Add progress UI to export dialog

## Notes
- Project is in early stages with solid foundation
- Architecture is well-planned and documented
- Focus remains on MVP deliverables
- No blockers currently identified



