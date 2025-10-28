# Technical Context: ClipForge

## Technology Stack

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Canvas Library**: Konva.js (for timeline)
- **Video Playback**: HTML5 `<video>` element
- **State Management**: React Context + Hooks

### Backend
- **Framework**: Tauri v1 (Rust)
- **IPC**: Tauri Commands & Events
- **Media Processing**: FFmpeg + FFprobe (native sidecars)
- **File Handling**: Tauri FS & Dialog APIs (`@tauri-apps/api`)

### Platform
- **OS**: Windows 10/11
- **Target**: Windows x64
- **WebView**: WebView2 (Chromium-based)
- **Build Output**: Native `.exe` via Tauri bundler

## Development Setup

### Prerequisites
1. **Node.js** (v18 or higher) - for npm and frontend
2. **Rust** (latest stable) - for Tauri backend
3. **MSVC Build Tools** - for Windows compilation
4. **Git** - for version control

### Development Commands
```bash
npm install          # Install dependencies
npm run dev         # Development mode (hot reload)
npm run build       # Production build
npm run tauri dev   # Run with Tauri (with hot reload)
npm run tauri build # Generate Windows .exe
```

## File Structure
```
ClipForge/
├── memory-bank/           # Memory bank files
├── docs/                  # Documentation
│   └── architecture/      # PRD, tasks, diagrams
├── src/                   # Frontend React app
│   ├── components/        # UI components
│   ├── context/           # React contexts
│   ├── utils/             # Utilities
│   └── main.tsx          # Entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   └── main.rs       # Tauri entry point
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── public/                # Static assets
└── package.json           # Node dependencies
```

## Dependencies

### Frontend (package.json)
- React 19
- TypeScript
- Vite
- Tailwind CSS
- @tauri-apps/api
- Konva.js
- react-konva

### Backend (Cargo.toml)
- tauri (v1)
- serde / serde_json
- tokio (async runtime)
- anyhow (error handling)
- rusqlite (bundled)

## Technical Constraints

### Development
- **Windows Development**: Must use Windows for development (MSVC requirement)
- **FFmpeg**: Must bundle native binaries as sidecars
- **WebView2**: Requires system WebView2 runtime
- **Tauri v1**: Using v1 allowlist and path resolver

### Runtime
- **Offline Operation**: No internet required for MVP
- **Single Process**: Tauri runs in single process with WebView2
- **File System**: Direct file access via Tauri APIs
- **Memory**: Efficient Rust backend + React frontend

### Build
- **Bundler**: Cargo Tauri bundler
- **Output Format**: Windows `.exe`
- **Sidecars**: FFmpeg binaries bundled with executable
- **Permissions**: Minimal allowlist configuration

## Build Process

### Development Build
```
npm run tauri dev
```
1. Vite builds React bundle
2. Tauri launches window with dev server
3. Hot reload active for both frontend and backend

### Production Build
```
npm run tauri build
```
1. Vite builds optimized React bundle
2. Cargo builds optimized Rust backend
3. Bundler packages everything into `.exe`
4. Sidecars (FFmpeg) bundled with executable
5. Assets (icons, config) embedded

## Key Configuration Files

### tauri.conf.json
- Window configuration
- Allowlist and CSP (`media-src` must include `asset:` and `blob:`)
- Sidecar definitions (FFmpeg)
- Bundle settings

### vite.config.ts
- Vite build configuration
- React plugin setup

### Cargo.toml
- Rust dependencies
- Build configuration
- Metadata (name, version)

## Development Workflow

### Current State
- ✅ Tauri app shell (PR #1 complete)
- ✅ Frontend bridge established
- ✅ Basic UI components (MenuBar, MainView)
- ✅ FFprobe integration (PR #2)

### Next Steps
1. Add FFmpeg sidecars and wrappers
2. Implement file import (PR #3)
3. Build video preview player (PR #5)
4. Create Konva timeline (PR #6)
5. Add trim handles (PR #7)
6. Implement export pipeline (PR #8)

## Testing Approach

### Manual Testing (MVP)
- Import various video formats
- Verify metadata extraction
- Test playback functionality
- Validate trim accuracy
- Confirm export quality

### Performance Targets
- Launch time: <5 seconds
- Timeline latency: <50ms
- Playback frame rate: ≥30 fps
- Export 1-minute clip: <15 seconds

## Known Technical Challenges
1. **FFmpeg Bundle**: Ensuring sidecar paths resolve correctly in production
2. **WebView2 Compatibility**: Requires system runtime
3. **File Path Handling**: Windows path encoding and permissions
4. **Progress Updates**: Event-driven progress without blocking UI

## Resources
- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Konva.js Documentation](https://konvajs.org/docs/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)



