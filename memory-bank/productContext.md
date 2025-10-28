# Product Context: ClipForge

## Why This Project Exists
Many video editors are either too heavy (Premiere, DaVinci), web-based (Canva, CapCut - requiring internet), or mobile-focused. ClipForge targets Windows users who need a fast, offline, native desktop solution for basic video trimming without bloat.

## Problems It Solves
1. **Quick Video Trimming**: Users need to cut out unwanted portions from videos quickly
2. **Offline Editing**: No internet dependency for core editing tasks
3. **Windows Native**: First-class desktop experience, not a web wrapper
4. **Lightweight**: Fast launch and responsive on modest hardware
5. **No Learning Curve**: Simple timeline-based interface for basic operations

## How It Should Work
The user experience follows a linear workflow:
1. **Import**: Drag-and-drop video files or use file picker
2. **Preview**: Watch video in player, see current timestamp
3. **Trim**: Adjust start and end handles on timeline to set range
4. **Export**: Click export button, choose save location, get trimmed MP4

## User Experience Goals
- **Responsive**: No noticeable lag when interacting with timeline or preview
- **Intuitive**: Visual timeline makes trim points obvious
- **Fast**: Import and preview should be instant; export complete in reasonable time
- **Reliable**: No crashes or data loss during editing
- **Clean UI**: Modern dark theme, minimal clutter, focused workflow

## Target Users
- Content creators needing quick trims
- Users wanting local, offline editing
- People with modest hardware who need something lightweight
- Windows power users who prefer native apps

## Key Features (MVP)
1. **File Import**: Support MP4, MOV, WebM via drag-drop or picker
2. **Metadata Display**: Show duration, resolution, file size
3. **Video Preview**: HTML5 player with play/pause/seek
4. **Timeline Editor**: Konva.js-based timeline with trim handles
5. **Export Pipeline**: FFmpeg-powered trim and MP4 export
6. **Progress Feedback**: Progress bar during export

## User Stories (MVP)
- **As a user**, I want to import videos to start editing
- **As a user**, I want to preview my clips before editing
- **As a user**, I want to set trim points visually on a timeline
- **As a user**, I want to export trimmed segments as MP4 files
- **As a user**, I want the app to feel fast and responsive

## What It's NOT (MVP)
- Not a full-featured NLE (no multi-track, effects, transitions)
- Not a recorder (no screen/webcam capture in MVP)
- Not a collaboration tool (no cloud sync or sharing)
- Not cross-platform (Windows only for MVP)
- Not AI-powered (no automatic editing features)

## Brand Identity
- **Name**: ClipForge (forging/crafting video clips)
- **Tone**: Professional, efficient, accessible
- **Aesthetic**: Dark theme, modern UI, minimal chrome
- **Promise**: Fast, simple video trimming for Windows



