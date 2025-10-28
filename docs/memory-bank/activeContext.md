# Active Context: ClipForge

## Current Work Focus
**Primary Task**: Export workflow. Import/preview, Konva timeline (PR #6), and trim handles (PR #7) are complete. The project is standardized on Tauri v1.

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

## Active Development
**PR Status**: PR #1 (App Shell & Bridge) ✅, PR #2 (FFmpeg Probe) ✅, PR #3 (File Import) ✅, PR #5 (Video Preview) ✅, PR #6 (Konva Timeline) ✅, PR #7 (Trim Handles) ✅

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
- **TimelineContext** provides `currentTime`, `duration`, `pxPerSecond`, trim state, `requestSeek`
- **Timeline** component renders grid/clip/playhead; handles trim edit and selection move
- **useImport** invokes `open_file_dialog`, validates format, adds clip, triggers probe
- **useFFmpeg** invokes `probe_video_metadata` to read metadata
- **VideoPlayer** uses Blob URLs for `.webm` previews, exposes `onReady` control API
- **CSP** allows `asset:` and `blob:` media sources

### Next Immediate Steps
1. Implement FFmpeg export with `-ss`/`-to`, progress events (PR #8)
2. Continue Memory Bank maintenance
3. Optional: thumbnails via blob to avoid asset errors in dev

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
- Export pipeline not implemented

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



