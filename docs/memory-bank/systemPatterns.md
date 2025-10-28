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

### 4. File Path Resolution
- **Primary**: Use `convertFileSrc()` to expose local files via the asset protocol (Tauri v2).
  - Produces URLs like `http://asset.localhost/C%3A%5Cpath%5Cto%5Cfile.mp4`.
  - Allowed by CSP via `media-src ... asset:` (already configured).
- **Fallback**: If the asset host is not reachable in dev (e.g., WebView2 returns `net::ERR_CONNECTION_REFUSED`), fall back to a Blob URL:
  - Read bytes with `@tauri-apps/plugin-fs.readFile(path)` under capability `fs:read-all` with a permissive `fs:scope`.
  - Construct a `Blob` with the correct MIME based on extension (mp4/webm/mov).
  - Assign `video.src = blobUrl`.
- **CSP**: `blob:` must be present in `media-src` (configured). This is required for the fallback path.
- **State**: Store clip path/name + metadata in `ProjectContext`; the player derives the source from `clip.filePath` at render time.

### Media Loading Flow (Implementation)
1. Import returns `{ path, name }` from the Rust dialog command.
2. `useImport` validates format, adds a `ProjectClip` to context, and probes metadata via `probe_video_metadata`.
3. `VideoPlayer` logic:
   - Build asset URL via `convertFileSrc(filePath)` and assign to `<video src>`.
   - In dev, perform a HEAD to the asset URL for visibility; log status/headers. This HEAD is best-effort and non-blocking.
   - If the `<video>` element emits `error`, log ready/network state and fall back to Blob by reading the file with plugin-fs, then set `src` to the Blob URL.
   - Register rich media event listeners (e.g., `canplay`, `loadedmetadata`, `stalled`, `waiting`, `progress`) to log `readyState` and `networkState`.

### Capabilities
- Capability file `src-tauri/capabilities/fs-read.json`:
  - Include `"fs:read-all"` to enable read commands.
  - Add a permissive global scope using `fs:scope`:
    ```json
    {
      "identifier": "fs-read",
      "windows": ["main"],
      "permissions": [
        "core:default",
        "fs:read-all",
        { "identifier": "fs:scope", "allow": ["**", "C:\\**", "D:\\**", "C:/**", "D:/**"] }
      ]
    }
    ```
  - Note: Using `scope` inside `fs:allow-read-file` is not supported; use `fs:scope` instead.

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



