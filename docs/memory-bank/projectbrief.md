# ClipForge - Project Brief

Goal: Lightweight desktop video editor for Windows using Tauri (Rust backend) and React (frontend).

MVP scope:
- Import a single video, preview playback, show key metadata.
- Timeline and trimming (subsequent PRs), export via FFmpeg.

Key constraints/decisions:
- Target Windows 11; prioritize reliability over footprint.
- Use Tauri v1 (stable) with WebView2; React + TypeScript UI.
- Bundle FFmpeg/FFprobe as sidecars.

Current architecture highlights:
- Media import persistency via SQLite; thumbs and preview files stored in AppData.
- Playback uses a transcode-to-WebM preview to avoid OS codec variability.
# Project Brief: ClipForge

## Overview
ClipForge is a lightweight, native Windows desktop video editor built with Tauri (Rust backend) and React frontend. The MVP focuses on the core video editing workflow: **Import → Preview → Trim → Export**.

## Core Mission
Deliver a fast, responsive, and stable desktop video editing experience that performs well on modest hardware. Unlike heavy non-linear editors, ClipForge prioritizes simplicity and speed for basic video trimming tasks.

## Target Platform
- **OS**: Windows (x64)
- **Deployment**: Native `.exe` via Tauri bundler
- **Framework**: Tauri v2 + React + Vite
- **Media Processing**: FFmpeg (bundled as sidecar)

## MVP Scope
The first release (v0.1.0-mvp) implements:
1. Video file import (drag-and-drop or file picker)
2. HTML5 video preview with play/pause/seek controls
3. Konva.js timeline with trim handles for setting in/out points
4. Export trimmed segments to MP4 using FFmpeg

## Success Criteria
- App launches successfully on Windows 10/11
- Full import → preview → trim → export workflow functions end-to-end
- Timeline remains responsive at ≥30 fps
- Exported clips are playable and correctly trimmed
- No runtime crashes or FFmpeg failures
- Packaged `.exe` runs without external dependencies

## Future Scope (Post-MVP)
- Screen and webcam recording
- Multi-track timeline editing
- Transitions, overlays, and effects
- AI-assisted workflows
- Cloud export and sharing integration

## Project Timeline
Currently in early development. PR #1 (App Shell & Frontend Bridge) is complete. Next milestone is FFmpeg integration (PR #2).

## Key Constraints
- Windows-only for MVP (future cross-platform support possible)
- Single-track timeline only
- No recording features in MVP
- Supported formats: MP4, MOV, WebM
- No undo/redo or autosave in MVP



