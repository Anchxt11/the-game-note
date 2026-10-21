# The Game Note — Infinite Canvas Board App

A **native Linux desktop and Android alternative to Milanote**, built with Tauri v2, Rust, and React. 

**Local-first, private, and fast.** No subscriptions, no telemetry, no cloud lock-in, and no arbitrary card limits. Your data lives in a local SQLite database on your machine with peer-to-peer and encrypted cloud relay synchronization.

---

## 📦 Downloads & Installation

Pre-built binaries are available on the [GitHub Releases](https://github.com/Anchxt11/the-game-note/releases) page:

### 1. Pop!_OS / Ubuntu / Debian (`.deb`)
Download `GameNote_<version>_amd64.deb` and install via terminal or Eddy:
```bash
sudo dpkg -i GameNote_*_amd64.deb
# or install via apt to auto-resolve dependencies:
sudo apt install ./GameNote_*_amd64.deb
```

### 2. CachyOS / Arch Linux / Universal Linux (`.AppImage`)
Download `GameNote_<version>_amd64.AppImage`, make it executable, and run:
```bash
chmod +x GameNote_*_amd64.AppImage
./GameNote_*_amd64.AppImage
```
*(Tip: You can also manage it with [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) for desktop launcher integration).*

### 3. Android (`.apk`)
Download `GameNote-<version>-universal.apk` directly to your phone:
1. Open the downloaded `.apk` file.
2. If prompted, allow **"Install unknown apps"** for your browser or file manager.
3. Tap **Install**.

---

## 🔄 Device Pairing & Real-Time Sync

GameNote features an encrypted **Zero-Knowledge Sync Engine** powered by `cr-sqlite` (Conflict-free Replicated Relations). Sync works across Linux desktops and Android devices seamlessly.

### How Device Pairing Works
GameNote uses a **Shared Vault / Cryptographic Secret** model:
- **Same Pairing Secret** = Devices belong to the same workspace and share all boards.
- **Different Pairing Secrets** = Devices are completely private and isolated from each other.

---

### Sync Modes

#### Mode 1: Local Wi-Fi (P2P LAN) — *Zero Cloud, 100% Free*
If your devices (e.g. your laptop and your Android phone) are connected to the same Wi-Fi network:
1. On your computer: Open **Settings $\rightarrow$ Device Pairing & Sync $\rightarrow$ Start Pairing**.
2. On your phone: Tap the **Sync & Pairing** icon in the bottom navigation bar.
3. Scan the QR code displayed on your screen (or copy/paste the Pairing Code).
4. Tap **Pair Device**.
> **That's it!** GameNote uses mDNS auto-discovery on your local network (ports 19841/19842) to sync peer-to-peer. It requires **no internet connection**, consumes **zero cloud quota**, and transfers data directly device-to-device.

---

#### Mode 2: Remote Collaboration Across Different Networks (Cloudflare Mailbox)
When devices are on different networks (e.g. collaborating with a team member in another city or accessing your boards on cellular data):

1. **Host an Invite**:
   - Turn **Cloud Relay** ON in **Settings $\rightarrow$ Sync Settings**.
   - Click **Start Pairing** and send the generated Pairing Code to your collaborator.
2. **Collaborator Joins**:
   - The collaborator opens GameNote, opens **Device Pairing & Sync**, and pastes the code.
   - Their app automatically connects to the same encrypted channel and pulls down the workspace boards.
3. **End-to-End Encryption (E2EE)**:
   - All note texts, element positions, and images are encrypted with **XChaCha20-Poly1305** before leaving your device. The cloud relay only routes ciphertext blobs and cannot read your notes.

---

#### 🚀 Deploy Your Own Free Cloud Relay (Optional / Self-Hosting)
By default, GameNote operates 100% offline and locally so random installs never consume third-party servers. If you want your own personal 24/7 cloud relay for remote sync, you can deploy your own Cloudflare Worker in 1 minute for **$0/month** (Cloudflare free tier includes 100,000 requests/day):

```bash
# 1. Clone the repo and enter the mailbox directory
git clone https://github.com/Anchxt11/the-game-note.git
cd the-game-note/mailbox

# 2. Install dependencies & authenticate with Cloudflare
npm install
npx wrangler login

# 3. Deploy to your Cloudflare account
npx wrangler deploy
```

Wrangler will output your unique endpoint URL:
```text
Deployed gamenote-mailbox triggers:
  https://gamenote-mailbox.<your-subdomain>.workers.dev
```

Copy that URL into GameNote: **Settings $\rightarrow$ Cloud Relay Endpoint URL $\rightarrow$ Enable Cloud Relay**.

#### Syncing on Local WIFI/LAN

Requirements:
Run the following commands in your system

```bash
sudo ufw allow from 192.168.0.0/16 to any port 8766 proto udp comment "The Game Note Discovery (Private LAN only)"

sudo ufw allow from 192.168.0.0/16 to any port 8765 proto tcp comment "The Game Note Sync (Private LAN only)"

```


---

## ✨ Features

### Canvas Elements
- **Rich Text Notes** — Full heading levels, body text, callout cards, code blocks, quote blocks with decorators.
- **Checklists & Task Lists** — Drag-and-drop reordering, interactive check states, item detach and merge.
- **Organizer Columns** — Flexible vertical layout lanes that cards snap into.
- **Nested Sub-Boards** — Infinite depth board hierarchies with full breadcrumb navigation.
- **Visual Link Cards** — Rich OpenGraph visual bookmark previews (YouTube, Steam, GitHub, blogs).
- **Images & Media** — Local file upload or curated Unsplash stock library search.
- **Annotated Connectors** — Directional arrow lines and links between canvas cards.
- **Data Tables** — Editable multi-column tables with dynamic row and column manipulation.
- **Comments & Annotations** — Floating or pinned annotation cards.

### Interaction & Experience
- **Infinite Canvas** — Smooth 60fps pan and pinch/wheel zoom.
- **Multi-Select & Lasso** — Box select multiple items to move, recolor, or delete in bulk.
- **Undo / Redo** — Full 30-step historical undo/redo stack (`Ctrl+Z` / `Ctrl+Shift+Z`).
- **Clipboard** — System-wide copy, cut, and duplicate (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `Ctrl+D`).
- **Unsorted Drawer** — Slide-out tray holding newly dropped or unpositioned items.
- **Search** — Instant SQLite full-text search across all nested boards, notes, and task items.

---

## 💾 Data Storage & Automated Backups

All data, media files, and cryptographic keys are stored locally on your machine in the standard platform directory:
```text
~/.local/share/com.anchit.gameNote/
```

- `milanote.db` — Main SQLite database (contains all boards, notes, cards, and CRDT change history).
- `files/` — Content-addressed image and media storage.
- `backups/` — Automated rolling daily backups (rotates last 7 days of snapshots).
- `sync_secret.key` — Your private 32-byte master encryption key.

You can also create and export a manual database snapshot at any time from **Settings $\rightarrow$ Backups $\rightarrow$ Create & Export Backup**.

---

## 🛠️ Building from Source

### Prerequisites
- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) v18+
- [Tauri v2 dependencies](https://tauri.app/start/prerequisites/) (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`)

### Development Mode

```bash
# Clone repository
git clone https://github.com/Anchxt11/the-game-note.git
cd the-game-note

# Install frontend dependencies
npm install

# Run desktop app with hot-reload
npm run tauri dev
```

### Build Desktop Packages (Linux)
```bash
npm run tauri build
```
Binaries will be output to:
- `.deb`: `target/release/bundle/deb/`
- `.AppImage`: `target/release/bundle/appimage/`

### Build Android APK
Ensure `ANDROID_HOME` and `NDK_HOME` are set in your environment:
```bash
npm run tauri android build -- --apk
```
Unsigned release APK will be generated at:
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`

Sign the APK using `apksigner`:
```bash
apksigner sign --ks release.keystore --out GameNote-universal.apk <path-to-unsigned.apk>
```

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology | Details |
|---|---|---|
| **Shell** | [Tauri v2](https://tauri.app/) | Native windowing, IPC commands, Android wrapper |
| **Frontend** | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Infinite canvas engine, CSS variables design system |
| **Database** | [SQLite](https://www.sqlite.org/) + [`rusqlite`](https://github.com/rusqlite/rusqlite) | Local-first relational storage |
| **CRDT Engine** | [`cr-sqlite`](https://github.com/vlcn-io/cr-sqlite) | Conflict-free replicated tables & Hybrid Logical Clocks |
| **Encryption** | RustCrypto (`chacha20poly1305`, `hkdf`, `sha2`) | End-to-end encrypted sync payloads & tokens |
| **Relay** | [Cloudflare Workers](https://workers.cloudflare.com/) + Durable Objects | SQLite-backed ephemeral real-time relay |

---

## 📄 License
MIT License. Free and open source for personal and commercial use.
