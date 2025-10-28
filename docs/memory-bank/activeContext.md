# Active Context: ClipForge

## Current Work Focus
**Primary Task**: Trimming & export workflow. Import/preview and the Konva timeline (PR #6) are complete. The project is standardized on Tauri v1.

## Recent Changes
- ✅ Aligned documentation to Tauri v1 (removed v2 references)
- ✅ Implemented Konva Timeline (single-clip) with playhead sync and zoom
- ✅ Added `TimelineContext` and integrated under `MediaLibrary`
- ✅ Exposed `onReady` control API from `VideoPlayer` (seek/play/pause)
- ✅ Fixed timeline format-time init bug and seek registration bug

## Active Development
**PR Status**: PR #1 (App Shell & Bridge) ✅, PR #2 (FFmpeg Probe) ✅, PR #3 (File Import) ✅, PR #5 (Video Preview) ✅, PR #6 (Konva Timeline) ✅

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
 - Zoom slider adjusts px/second (10–1000)

### Current State
- **ProjectContext** stores clips and playback state
- **TimelineContext** provides `currentTime`, `duration`, `pxPerSecond`, and a `requestSeek` API
- **Timeline** component renders grid/clip/playhead; interaction overlay captures seeks
- **useImport** invokes `open_file_dialog`, validates format, adds clip, triggers probe
- **useFFmpeg** invokes `probe_video_metadata` to read metadata
- **VideoPlayer** uses Blob URLs for `.webm` previews, exposes `onReady` control API
- **CSP** allows `asset:` and `blob:` media sources

### Next Immediate Steps
1. Implement trim handles and in/out state (PR #7)
2. Implement FFmpeg export with `-ss`/`-to`, progress events (PR #8)
3. Continue Memory Bank maintenance
4. Optional: thumbnails via blob to avoid asset errors in dev

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
- Trim handles not implemented
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



