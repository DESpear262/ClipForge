# Active Context: ClipForge

## Current Work Focus
**Primary Task**: Stabilize video import/preview pipeline on Tauri v2 using asset URLs via convertFileSrc()

## Recent Changes
- ✅ Read and analyzed existing project documentation
- ✅ Reviewing PRD, MVP tasks, and architecture diagrams
- ✅ Examining current codebase state (App.tsx, main.rs, TauriContext.tsx)
- ✅ Creating memory bank structure with core files

## Active Development
**PR Status**: PR #1 (App Shell & Bridge) ✅, PR #2 (FFmpeg Probe) ✅, PR #3 (File Import) ✅, PR #5 (Video Preview) ✅

### What Works
- Tauri application launches successfully (v2)
- React frontend renders in WebView2
- Import via native file dialog; supported formats validated (mp4/mov/webm)
- FFprobe metadata extraction via Rust sidecar wrappers
- HTML5 video preview using asset URLs via `convertFileSrc()`
- Blob fallback path when asset host is unavailable in dev
- CSP allows `asset:` and `blob:` media sources
- Error boundary catches React errors gracefully
- IPC bridge and context wiring

### Current State
- **ProjectContext** stores clips and playback state
- **useImport** invokes `open_file_dialog`, validates format, adds clip, triggers probe
- **useFFmpeg** invokes `probe_video_metadata` to read metadata
- **VideoPlayer** uses asset URLs with time/seek controls, rich diagnostics, and Blob fallback
- **CSP** allows `asset:` and `blob:` media sources

### Next Immediate Steps
1. Implement timeline (Konva) and sync playhead
2. Implement trim UI/state and export pipeline with FFmpeg
3. Continue Memory Bank maintenance
4. Optional: preflight-and-gate asset attempts in dev to prevent console noise

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
- Timeline component not implemented
- Trim/export pipeline not implemented

### Upcoming Challenges
- FFmpeg sidecar path resolution in production
- Implementing Konva.js timeline efficiently
- Handling large video files without lag
- Progress feedback during FFmpeg operations
 - Keeping dev console noise low while still logging useful diagnostics

## Work in Progress
- Initializing memory bank (this work)
- Preparing for FFmpeg integration (next PR)
- Setting up proper documentation structure

## Immediate Action Items
1. Complete memory bank initialization
2. Review current code structure for next PR
3. Plan FFmpeg sidecar integration approach
4. Prepare for file import system (PR #3)

## Notes
- Project is in early stages with solid foundation
- Architecture is well-planned and documented
- Focus remains on MVP deliverables
- No blockers currently identified



