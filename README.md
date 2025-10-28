# ClipForge - Desktop Video Editor

A lightweight Windows desktop video editor built with Tauri v2 + React + Konva.js + FFmpeg.

## Project Status

**Current PR**: PR #2 - FFmpeg Sidecar Integration (COMPLETE)

## MVP Goal

Implement the complete workflow: **Import → Preview → Trim → Export**

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Konva.js
- **Backend**: Tauri v2 (Rust) + FFmpeg
- **Platform**: Windows x64
- **Output**: Native `.exe` via Tauri bundler

## Development Setup

### Prerequisites

1. **Node.js** (v18 or higher)
2. **Rust** (latest stable)
3. **MSVC** (for Windows compilation)

### Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Build executable
npm run tauri build
```

## Project Structure

```
ClipForge/
├── docs/                      # Architecture and planning docs
│   └── architecture/
├── src/                       # Frontend React app
│   ├── components/           # React components
│   ├── context/              # React context providers
│   ├── hooks/                # React hooks
│   ├── types/                # TypeScript definitions
│   ├── utils/                # Utility functions
│   └── main.tsx              # App entry point
├── src-tauri/                # Rust backend (Tauri)
│   ├── bin/                  # FFmpeg binaries (ffmpeg.exe, ffprobe.exe)
│   ├── src/
│   │   ├── lib.rs           # Tauri entry point
│   │   └── ffmpeg.rs        # FFmpeg wrapper functions
│   └── Cargo.toml           # Rust dependencies
├── public/                    # Static assets
└── tauri.conf.json           # Tauri configuration
```

## Development Progress

See `docs/architecture/ClipForge-MVP-Tasks.md` for detailed task breakdown.

### PR #1: Tauri App Shell & Frontend Bridge ✅
- [x] Initialize Tauri + React (Vite) project structure
- [x] Configure WebView2 integration and Rust entry point
- [x] Implement main window with menu bar (Import, Export, Help)
- [x] Set up secure Tauri allowlist (fs, dialog, path, process)
- [x] Implement Tauri → React IPC using commands and events
- [x] Set up error boundary and logging to Rust console

### PR #2: FFmpeg Sidecar Integration ✅
- [x] Bundle native FFmpeg and FFprobe binaries as sidecars
- [x] Verify process execution via `tauri::api::process::Command`
- [x] Implement basic command wrapper in Rust (execute_ffmpeg, probe_metadata)
- [x] Add error handling with anyhow
- [x] Create frontend hook (useFFmpeg) for metadata probing
- [x] Add type definitions for media structures

### Next: PR #3 - File Import System

## Architecture

See `docs/architecture/ClipForge-Architecture.mermaid` for system architecture diagram.

## Documentation

- **Product Requirements**: `docs/architecture/ClipForge-PRD.md`
- **Development Tasks**: `docs/architecture/ClipForge-MVP-Tasks.md`
- **Architecture Diagram**: `docs/architecture/ClipForge-Architecture.mermaid`

## License

Proprietary - ClipForge Development Team
