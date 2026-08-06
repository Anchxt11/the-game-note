# Prompt for Antigravity: Build a Native Linux Milanote-style Board App (Rust)

## Project Overview
Build a native Linux desktop application that replicates the core functionality and UX of Milanote (app.milanote.com) — a visual, drag-and-drop tool where users arrange notes, images, links, and to-do lists freely on an infinite canvas "board," and nest boards inside each other. Key difference from the original: **no limit on board size, elements per board, or number of boards** (Milanote's free tier caps these — ours should not).

Do not copy Milanote's actual copyrighted assets, marketing copy, illustrations, or brand identity. Build original UI matching this functional spec, with our own visual style, native to Linux and COSMIC/GTK-friendly.

## Tech Stack

**Primary recommendation: Rust + Tauri**
- Core app logic, file I/O, and local database access in Rust (fast, memory-safe, matches the performance-first approach you already use for UE5/C++ work)
- UI layer: Tauri (Rust backend + a webview-rendered frontend) — gives you a genuinely native Linux binary (small footprint, uses the system webview, not a bundled Chromium like Electron) while letting the infinite-canvas UI be built in a canvas library that's much faster to iterate on than a native GUI toolkit
- Frontend inside the webview: TypeScript + a canvas rendering approach (raw HTML5 Canvas or a lightweight canvas library) — communicates with the Rust backend via Tauri's IPC commands
- Local database: SQLite via `rusqlite` or `sqlx`, stored in `~/.local/share/<appname>/`
- File/image storage: local filesystem under XDG data dir

**Alternative (fully native, no webview): Rust + `iced`**
- `iced` is the same GUI toolkit COSMIC itself is built on, so it'll feel right at home visually and technically on your system
- Pros: 100% native rendering, no webview dependency, tightest COSMIC integration
- Cons: building a smooth infinite pan/zoom canvas with free-form drag-and-drop, rich text editing, and image embedding is meaningfully more work in `iced` than in HTML canvas — expect slower initial development
- Mention this as Plan B if the Tauri approach hits a wall, or if a 100% native binary is a hard requirement

Default to the Tauri approach unless you have a strong reason to prefer pure `iced`.

## Packaging
- Ship as a `.deb` for Pop!_OS/Debian-based systems (primary target) and optionally a Flatpak manifest for broader Linux distribution
- Respect XDG base directory spec for config/data/cache locations
- App should integrate with COSMIC's app grid (proper `.desktop` file, icon, categories)

## Core Data Model
- **Board**: id, parent_board_id (nullable, self-referential — boards can live inside other boards), title, color/theme, created_at, updated_at
- **Element**: id, board_id, type (note | image | link | file | task_list | column | connector), x, y, width, height, z_index, content (JSON blob — text, checklist items, image path, link metadata), style (color, font size)
- **TaskListItem**: id, element_id, text, is_checked, order_index
- **Connector**: id, board_id, from_element_id, to_element_id, style

No hard caps anywhere on rows per board_id or elements per board — this is the explicit "no limit" differentiator from Milanote's free tier. Single-user local app, so no multi-tenant auth needed — optionally a simple app-level password/lock screen if you want privacy on a shared machine.

## Core Features to Implement

### 1. Infinite Canvas Board
- Pannable (click+drag or scroll), zoomable (scroll wheel/pinch, ctrl+scroll) canvas
- Grid or blank background, subtle dot-grid option
- Smooth performance even with hundreds of elements (only render/hit-test elements in or near the viewport)

### 2. Element Types
- **Note**: rich-text card (bold/italic/underline, bullet lists, headings), resizable, color-coded background
- **Image**: drag-and-drop or paste image from clipboard/file, resizable, optional caption
- **Link/Bookmark card**: paste a URL, fetch title/favicon/preview via a lightweight HTTP request from the Rust backend (using Open Graph metadata)
- **Task list**: checklist card with add/remove/reorder items, strikethrough on completion
- **Column**: vertical container other elements can be dropped into and reordered within
- **Nested board element**: represents a sub-board — double-click to "zoom into" that board
- **Arrows/connectors**: draw a line/arrow between two elements, freehand drawing tool
- Color tags per element

### 3. Board Hierarchy & Navigation
- Sidebar tree view of all boards and nested sub-boards, expandable/collapsible
- Breadcrumb trail at top of canvas (Home / Project X / Moodboard)
- Create, rename, delete (with confirmation), duplicate board
- Drag an element onto a nested-board thumbnail to move it inside that sub-board

### 4. Interaction & Editing
- Multi-select (marquee drag or shift-click) → move, delete, recolor as a group
- Copy/paste elements, including across boards
- Undo/redo (local action history stack)
- Keyboard shortcuts (Delete, Ctrl+Z/Ctrl+Shift+Z, Ctrl+D duplicate)
- Right-click context menu per element (duplicate, delete, bring to front/back, recolor)
- Full-text search across all boards

### 5. UI/UX Notes
- Left sidebar: board tree navigator + search
- Top bar: breadcrumb, zoom controls, inline-editable board title
- Left-edge tool palette to add elements (note, image, link, task list, column, connector) — click a tool then click canvas to place, mirroring Milanote's placement flow
- Clean, minimal, neutral default palette with per-board theming
- Follow COSMIC's design language where practical (spacing, corner radii, dark/light mode following system theme)

## Explicit Non-Goals for V1
- No cloud sync, accounts, or billing — this is a local single-user app
- No mobile app
- No AI features unless requested later

## Deliverables
1. Working local dev environment with build instructions (`cargo tauri dev`)
2. Seed/demo data script populating a sample board with one of each element type
3. README covering build, packaging (`.deb`), and install on Pop!_OS
4. Basic test coverage for the Rust backend's board/element CRUD logic

Build this iteratively: start with the Rust backend + SQLite data layer and Tauri IPC commands, then the canvas renderer, then each element type one at a time, then board hierarchy/navigation, then packaging last.
