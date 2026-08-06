# The Game Note 📝

A highly interactive, locally-persisted digital canvas built using React, Vite, and Tauri. Designed for infinite canvas note-taking, rich text editing, and free-form organization.

## Features ✨
- **Infinite Canvas:** Drag, drop, and arrange notes freely on an expansive 2D grid.
- **Rich Text Editing:** Professional-grade text formatting with completely custom blocks, headings, callouts, and code blocks.
- **Auto-Persistence:** Your workspace instantly saves your content and navigation state to local storage across sessions.
- **Fast & Native:** Wrapped in Tauri for a lightweight desktop-class experience.

## Tech Stack 🛠️
- **Frontend:** React, TypeScript, Vite
- **Styling:** Vanilla CSS
- **Backend/Container:** Tauri, Rust (for file and DB management)

## Getting Started 🚀

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [Rust](https://www.rust-lang.org/tools/install) installed, along with the Tauri prerequisites for your OS.

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Anchxt11/the-game-note.git
cd the-game-note
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run tauri dev
```

4. Build for production:
```bash
npm run tauri build
```

## Contributing 🤝
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License 📄
[MIT](https://choosealicense.com/licenses/mit/)
