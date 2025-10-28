# System Patterns: ClipForge

## Architecture Overview
ClipForge uses a **two-tier architecture**:
- **Frontend**: React SPA with TypeScript, rendered in WebView2
- **Backend**: Tauri (Rust) process handling file operations and FFmpeg execution

## Communication Pattern
**Event-based IPC** via Tauri:
- Frontend → Backend: Commands (invoke functions)
- Backend → Frontend: Events (progress updates, status)

```mermaid
React UI ←→ Tauri Commands ←→ Rust Backend
    ↑                              ↓
    └────── Tauri Events ──────────┘
```

## Key Technical Decisions

### 1. Native FFmpeg Sidecar
- **Decision**: Bundle FFmpeg as native binary sidecar
- **Rationale**: Guarantees offline functionality, predictable behavior
- **Pattern**: Use `tauri::api::process::Command` to execute FFmpeg operations

### 2. Konva.js for Timeline
- **Decision**: Use Konva.js for GPU-accelerated 2D canvas
- **Rationale**: Performance for interactive timeline operations
- **Pattern**: React components wrap Konva layers (grid, clips, playhead)

### 3. Component Architecture
- **Structure**: Feature-based with shared contexts
- **Components**: MenuBar, MainView, ErrorBoundary, VideoPlayer (planned), Timeline (planned)
- **Contexts**: TauriContext for app-wide actions, TimelineContext (planned)

### 4. Playback Strategy (Tauri v1)
- **Preferred**: Use WebM preview files and play them via Blob URLs.
  - Read bytes with `@tauri-apps/api/fs.readBinaryFile(path)`; construct `Blob("video/webm")`.
  - Avoids asset.localhost and OS codec variability.
- **Legacy/static**: Use `convertFileSrc()` for thumbnails/static assets as needed.
- **CSP**: `blob:` present in `media-src` and `img-src`.
- **State**: Library rows store original `path` and `preview_path`; UI prefers `preview_path` for playback.

### Media Loading Flow (Implementation)
1. Import returns `{ path, name }` from the Rust dialog command.
2. `useImport` validates format, adds a `ProjectClip` to context, and probes metadata via `probe_video_metadata`.
3. `VideoPlayer` logic:
   - For `.webm` previews: read bytes → Blob URL → `<video>` with typed `<source>`.
   - For legacy `.mp4`: attempt asset URL, then Blob fallback as last resort.
   - Register media event listeners and log ready/network state.

### Allowlist (Tauri v1)
- Configure permissions via `tauri.conf.json` under `tauri.allowlist`.
- Example (v1) to allow reading files and asset protocol:
  ```json
  {
    "tauri": {
      "allowlist": {
        "all": false,
        "dialog": { "open": true, "save": true },
        "fs": { "readFile": true, "scope": ["**"] },
        "protocol": { "asset": true, "assetScope": ["**"] }
      }
    }
  }
  ```
- Avoid v2 Capabilities JSON; this project is strictly Tauri v1.

### Observed Dev-Mode Behavior
- On some environments, WebView2 refuses `asset.localhost` in dev, causing `net::ERR_CONNECTION_REFUSED` on the asset GET/HEAD.
- This is non-fatal: the player immediately falls back to Blob and playback works. Production builds typically do not exhibit this refusal.


### 5. Error Handling
- **Pattern**: ErrorBoundary at root level, try-catch in commands
- **Logging**: Console logging in Rust, console.error in React
- **User Feedback**: Toast notifications for errors

## Component Relationships

### Current Structure
```
App.tsx (root)
├── ErrorBoundary
└── TauriProvider
    └── MenuBar
        ├── showImportDialog (stub)
        ├── showExportDialog (stub)
        └── showHelpDialog (working)
    └── MainView
        └── (placeholder content)
```

### Planned Structure (Post-MVP)
```
App.tsx
├── ErrorBoundary
├── TauriProvider
├── TimelineProvider
└── MainView
    ├── VideoPlayer
    └── Timeline
        └── TrimHandles
```

## Design Patterns in Use

### 1. Context Pattern
- **TauriContext**: Provides centralized access to backend commands
- **Hook**: `useTauriContext()` for component-level access
- **Benefit**: Avoids prop drilling for app-wide functions

### 2. Error Boundary Pattern
- **Implementation**: React ErrorBoundary at root
- **Behavior**: Catches React errors, displays fallback UI, logs to console
- **Prevents**: White screen of death crashes

### 3. Command Pattern (Rust)
- **Implementation**: Tauri commands as entry points
- **Current**: `test_ipc()`, `open_import_dialog()`, `open_export_dialog()`
- **Future**: `import_file()`, `extract_metadata()`, `export_video()`

### 4. Event-Driven Progress (Planned)
- **Pattern**: Tauri events for long-running operations
- **Use Case**: FFmpeg export progress updates
- **Benefit**: Non-blocking UI updates

## State Management Strategy

### Frontend State
- **Tool**: React hooks (useState, useReducer)
- **Scope**: Component-level + Context providers
- **Persistence**: Local JSON (planned)

### Backend State
- **Tool**: Rust structs and Tauri app state
- **Scope**: Process-level during operations
- **Persistence**: Not stored between sessions

## IPC Communication Flow

### Import Flow (Planned)
```
1. User clicks Import → React calls useTauriContext().showImportDialog()
2. Frontend invokes open_import_dialog()
3. Rust opens file picker, returns path
4. Frontend invokes extract_metadata(path)
5. Rust runs FFprobe, returns metadata JSON
6. Frontend updates state with clip + metadata
```

### Export Flow (Planned)
```
1. User sets trim points → Frontend updates state
2. User clicks Export → React calls showExportDialog()
3. Frontend invokes export_video(input, output, start, end)
4. Rust executes FFmpeg with progress events
5. Frontend listens to events, updates progress bar
6. Export completes, shows success message
```

## Security Patterns
- **Allowlist**: Minimal Tauri permissions (fs, dialog, path, process)
- **File Access**: All file operations require user dialog approval
- **Sandbox**: WebView2 sandboxed from system by default
- **Validation**: Validate file formats before processing

## Performance Patterns
- **Caching**: Konva layer caching for timeline redraws
- **Lazy Loading**: Components load on demand
- **Efficient Updates**: React memo where needed
- **Batch Operations**: Batch FFmpeg operations when possible

## Dependency Chain
```
Frontend Dependencies: React → Tauri API → IPC → Tauri Backend
Backend Dependencies: Tauri → FFmpeg Sidecar → File System
```



