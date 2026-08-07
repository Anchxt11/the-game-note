# The Game Note — Infinite Canvas Board App

A **native Linux desktop alternative to Milanote**, built with Tauri, Rust, and React. No subscriptions, no cloud sync limits, no card limits. Your data lives in a local SQLite database on your machine.

---

## ✨ Features

### Canvas Elements
- **Notes** — Rich text notes with full text styling (Large Heading, Normal Heading, Normal Text, Small Text, Code Block, Callout, Quote Block)
- **Task Lists (Checklists)** — Draggable, reorderable to-do items with drag-to-detach and merge
- **Columns** — Organizer lanes that cards can snap into
- **Nested Boards** — Full sub-board navigation with breadcrumbs
- **Link Cards** — Visual web bookmark cards (with live YouTube and Steam thumbnail fetching)
- **Image Cards** — Upload local images or pick from curated Unsplash stock library
- **Comment Cards** — Pinnable annotation cards (pin to elements or float freely)
- **Lines / Connectors** — Annotated directional arrows between elements
- **Tables** — Editable multi-row/column data tables with cell action sidebar

### Canvas Experience
- **Infinite Pan & Zoom** — Smooth trackpad and mouse-wheel canvas navigation
- **Multi-Select** — Click-drag lasso selection or Shift+click for multi-select
- **Drag & Drop** — Drag tools from toolbar to canvas to create elements; drag elements between boards and the breadcrumb trail
- **Undo / Redo** — Full 30-step undo/redo stack (Ctrl+Z / Ctrl+Shift+Z)
- **Copy, Cut, Paste** — Full clipboard support with offset paste
- **Context Menu** — Right-click menu with duplicate, recolor, move to board, delete, etc.
- **Board Background** — Per-board background color picker
- **Unsorted Drawer** — Slide-out tray for cards without a canvas position

### Sidebar & Navigation
- **Board Tree Sidebar** — Collapsible sidebar with nested board hierarchy view
- **Full-Text Search** — SQLite-powered FTS search across boards, notes, and task items
- **Breadcrumb Navigation** — Top bar breadcrumb for sub-board navigation with drag-to-move
- **Top Bar** — Undo/Redo buttons, view menu (zoom controls), presentation mode toggle

### Text Styling (Notes)
- Large Heading, Normal Heading, Normal Text, Small Text
- Code Block (monospace styling)
- Callout (highlighted panel)
- Quote Block (with non-removable `"` decorators)
- Text Color palette
- Bold, Italic, Underline

### Card Theming
- 6 color tints per card: Default Gray, Warm Gold, Muted Crimson, Forest Green, Deep Sky Blue, Royal Violet

---

## 🏗️ Architecture

```
the-game-note/
├── src/                        # React/TypeScript frontend
│   ├── App.tsx                 # Root component — state, keyboard shortcuts, board navigation
│   ├── types.ts                # Shared TypeScript type definitions
│   ├── index.css               # Global styles, design tokens, all component CSS
│   ├── components/
│   │   ├── Canvas.tsx          # Infinite canvas engine (~3600 lines) — pan, zoom, drag, render
│   │   ├── Toolbar.tsx         # Left-side tool palette with drag-preview ghost system
│   │   ├── TextEditSubSidebar.tsx # Rich text formatting sidebar (text styles, color)
│   │   ├── TaskListCard.tsx    # Checklist element component with drag-reorder
│   │   ├── CommentCard.tsx     # Pinnable annotation card
│   │   ├── Sidebar.tsx         # Board tree sidebar with FTS search
│   │   ├── TopBar.tsx          # Top navigation bar
│   │   ├── SearchModal.tsx     # Global search modal
│   │   ├── ContextMenu.tsx     # Right-click context menu
│   │   ├── UnsortedDrawer.tsx  # Unsorted elements slide-out tray
│   │   ├── UnsortedTray.tsx    # Tray icon/toggle button
│   │   └── *ActionSidebar.tsx  # Per-element-type right-side action panels
│   └── services/
│       └── ipc.ts              # Tauri IPC bridge — all DB calls go through here
│
├── src-tauri/                  # Tauri host (Rust)
│   └── src/
│       ├── main.rs             # App bootstrap, DB init, seed check, command registration
│       └── commands.rs         # All #[tauri::command] endpoints exposed to frontend
│
└── crates/
    └── core/                   # milanote-core Rust library
        └── src/
            ├── db.rs           # All rusqlite database operations (CRUD, batch, search)
            ├── models.rs       # Rust structs: Board, Element, TaskListItem, Connector, etc.
            ├── error.rs        # Custom AppError type with thiserror
            ├── opengraph.rs    # OpenGraph scraping for link card previews
            ├── seed.rs         # Demo data seeder (runs once on first launch)
            └── storage.rs      # Local filesystem storage for uploaded images
```

### Data Flow
```
React Component
    ↓  ipcService.someMethod()
src/services/ipc.ts
    ↓  invoke('command_name', { ...args })
Tauri IPC Bridge
    ↓  #[tauri::command] fn in commands.rs
milanote-core Database struct
    ↓  rusqlite
~/.local/share/com.antigravity.milanote/milanote.db
```

---

## 🗄️ Database Schema

The SQLite database (stored at `~/.local/share/com.antigravity.milanote/milanote.db`) has the following schema:

| Table | Purpose |
|---|---|
| `boards` | All boards with title, parent, and color theme |
| `elements` | All canvas elements — position, type, content (JSON), style (JSON) |
| `task_list_items` | Checklist items belonging to task_list elements |
| `connectors` | Arrow/line connectors between elements |

---

## 🚀 Getting Started

### Prerequisites
- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) v18+
- [Tauri v2 system dependencies](https://tauri.app/start/prerequisites/) for Linux (libwebkit2gtk, libgtk, etc.)

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/Anchxt11/the-game-note.git
cd the-game-note

# Install JS dependencies
npm install

# Run in development mode (hot reload)
npm run tauri dev
```

### First-Time Launch
On first launch, if the database is empty, `seed.rs` automatically populates a **Welcome Board** with demo elements (a note, image, link card, task list, column, sub-board, and a connector) so you can immediately see all features in action.

### Build for Production

```bash
npm run tauri build
```

The compiled `.AppImage` and `.deb` installer will appear in `src-tauri/target/release/bundle/`.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | [Tauri v2](https://tauri.app/) |
| Frontend | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Build Tool | [Vite 5](https://vitejs.dev/) |
| Backend | [Rust](https://www.rust-lang.org/) |
| Database | [rusqlite](https://github.com/rusqlite/rusqlite) (SQLite, bundled) |
| Icons | [Lucide React](https://lucide.dev/) |
| Styling | Vanilla CSS (custom design system in `index.css`) |

---

## v2 Changes (Aug 2026)
- **Migrated from localStorage to native rusqlite SQLite** — all data now persists in a real database file
- **New Tauri IPC commands** — `update_element_content`, `update_element_style`, `update_element_board_id`, `sync_board_state`
- **Proper UUID v4 element IDs** — using `crypto.randomUUID()` for native SQLite compatibility
- **`ipc.ts` rewritten** — fully replaced the in-memory mock with native `invoke()` calls
- **Root board resolver** — transparent `'root-board'` → real UUID mapping on first boot

---

## License
MIT
