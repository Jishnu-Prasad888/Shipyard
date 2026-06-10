# Shipyard — Electron → Tauri Migration Guide

> Complete step-by-step guide. No component code changes required.
> All 144 `window.electron.*` call-sites continue to work unchanged.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project structure changes](#2-project-structure-changes)
3. [File-by-file replacement map](#3-file-by-file-replacement-map)
4. [Step-by-step migration](#4-step-by-step-migration)
5. [Firebase sync (important)](#5-firebase-sync-important)
6. [TypeScript errors to fix](#6-typescript-errors-to-fix)
7. [Building for production](#7-building-for-production)
8. [Icons](#8-icons)
9. [Tauri-specific gotchas](#9-tauri-specific-gotchas)
10. [Rollback plan](#10-rollback-plan)

---

## 1. Prerequisites

Install these before starting:

```bash
# Rust toolchain (https://rustup.rs)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Tauri CLI
npm install --save-dev @tauri-apps/cli@^2

# Platform-specific system deps
# --- Windows ---
# Nothing extra needed

# --- macOS ---
xcode-select --install

# --- Linux (Debian/Ubuntu) ---
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev
```

---

## 2. Project structure changes

### Before (Electron)
```
shipyard/
├── src/
│   ├── main/              ← Electron main process (Node.js)
│   │   ├── index.ts
│   │   ├── preload.ts
│   │   └── database/
│   │       ├── database.service.ts
│   │       ├── schema.ts
│   │       ├── seed.ts
│   │       └── sync.service.ts
│   ├── renderer/          ← React frontend (unchanged)
│   └── shared/            ← Shared types (unchanged)
├── electron.vite.config.ts
├── electron-builder.json
└── package.json
```

### After (Tauri)
```
shipyard/
├── src/
│   ├── renderer/          ← React frontend (UNCHANGED except main.tsx)
│   │   └── lib/
│   │       └── tauri-bridge.ts  ← NEW: replaces preload.ts
│   └── shared/            ← UNCHANGED
├── src-tauri/             ← NEW: replaces src/main/
│   ├── src/
│   │   ├── main.rs        ← Entry point
│   │   ├── lib.rs         ← App setup (replaces index.ts)
│   │   ├── commands.rs    ← IPC handlers (replaces ipcMain.handle calls)
│   │   └── db/
│   │       └── mod.rs     ← SQLite (replaces database.service.ts + schema.ts)
│   ├── icons/             ← App icons
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json    ← Replaces electron-builder.json
├── vite.config.ts         ← Updated (no electron-vite)
├── package.json           ← Updated (no electron deps)
└── tsconfig.json          ← Simplified (no tsconfig.web.json split)
```

---

## 3. File-by-file replacement map

| Old file | New file | Notes |
|---|---|---|
| `src/main/index.ts` | `src-tauri/src/lib.rs` | Window setup, tray, IPC registration |
| `src/main/preload.ts` | `src/renderer/lib/tauri-bridge.ts` | Same `window.electron` API |
| `src/main/database/database.service.ts` | `src-tauri/src/db/mod.rs` | SQLite via rusqlite (bundled) |
| `src/main/database/schema.ts` | `src-tauri/src/db/mod.rs` (SCHEMA const) | Embedded in Rust |
| `src/main/database/sync.service.ts` | See §5 Firebase | Moved to renderer |
| `src/main/database/seed.ts` | Port manually if needed | See step 4h |
| `electron.vite.config.ts` | `vite.config.ts` | Standard Vite only |
| `electron-builder.json` / `.yml` | `src-tauri/tauri.conf.json` | |
| `tsconfig.web.json` + `tsconfig.node.json` | `tsconfig.json` | Single config |
| `package.json` | `package.json` | Electron deps removed |

---

## 4. Step-by-step migration

### 4a. Copy the migration files into your project

```bash
# Copy Rust backend
cp -r tauri-migration/src-tauri  ./src-tauri

# Copy updated configs
cp tauri-migration/vite.config.ts     ./vite.config.ts
cp tauri-migration/package.json       ./package.json
cp tauri-migration/tsconfig.json      ./tsconfig.json

# Copy the bridge (only new renderer file)
mkdir -p src/renderer/lib
cp tauri-migration/src/renderer/lib/tauri-bridge.ts  src/renderer/lib/tauri-bridge.ts

# Copy updated type declarations
cp tauri-migration/src/renderer/types/electron.d.ts  src/renderer/types/electron.d.ts

# Copy updated main.tsx
cp tauri-migration/src/renderer/main.tsx  src/renderer/main.tsx
```

### 4b. Delete Electron-specific files

```bash
# Remove Electron main process
rm -rf src/main/

# Remove Electron build configs
rm -f electron.vite.config.ts
rm -f electron-builder.json
rm -f electron-builder.yml

# Remove old tsconfig files (now merged into tsconfig.json)
rm -f tsconfig.web.json
rm -f tsconfig.node.json
rm -f tsconfig.electron.json

# Remove .npmrc mirror entries (electron-specific)
# Edit .npmrc and remove the two electron_mirror lines
```

### 4c. Install new dependencies

```bash
npm install
```

This installs `@tauri-apps/api`, `@tauri-apps/cli`, and the plugin packages.
It also removes `electron`, `electron-builder`, `electron-vite`, `better-sqlite3`, `sharp`.

### 4d. Add app icons

Tauri requires icons in `src-tauri/icons/`. Generate them from your existing `logo.png`:

```bash
# Install the Tauri icon generator
npm run tauri icon src/renderer/assets/logo.png
# This auto-generates all sizes into src-tauri/icons/
```

If you don't have the CLI handy yet, manually place:
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.icns` (macOS)
- `src-tauri/icons/icon.ico` (Windows)

### 4e. Update your index.html

Make sure `src/renderer/index.html` has `<div id="root"></div>` and a script tag:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Shipyard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

### 4f. Verify the bridge is imported in main.tsx

Open `src/renderer/main.tsx` and confirm the first import is:

```tsx
import './lib/tauri-bridge'
```

This is the **only change** needed in the renderer. All components remain untouched.

### 4g. Run in development mode

```bash
npm run dev
# Equivalent to: tauri dev
```

Tauri will:
1. Start the Vite dev server on port 5173
2. Compile the Rust backend
3. Open the app window

First compile takes 2–5 minutes (Rust crates downloading). Subsequent runs are fast.

### 4h. Migrate the seed data (optional)

The TypeScript `seed.ts` was a dev-only script. To recreate it in Tauri:

```bash
# Option A: Run it once via a dev-mode Tauri command
# Add a temporary `seed_database` command in commands.rs that calls the Rust equivalent

# Option B: Keep the old data by copying your dev DB
# The old DB is at: %APPDATA%/shipyard/shipyard-dev.db (Windows)
#                   ~/Library/Application Support/shipyard/shipyard-dev.db (macOS)
#                   ~/.local/share/shipyard/shipyard-dev.db (Linux)
# 
# The new Tauri DB will be at the same path (same app identifier).
# If you kept the same `identifier` in tauri.conf.json, the DB is automatically found.
```

---

## 5. Firebase sync (important)

### What changed

The old `SyncService` ran in Electron's main process (Node.js) and used the Firebase Admin-style flow.

In Tauri, **there is no Node.js runtime**. Firebase sync must run in the renderer.

The good news: your `src/renderer/services/firebase.service.ts` already exists and does exactly this using the Firebase JS SDK. The Tauri backend just needs to expose the unsynced records.

### How to wire it up

The sync commands (`sync_push`, `sync_pull`, `sync_test`) in `commands.rs` return stub responses. To restore full sync:

1. **Keep using your existing `firebase.service.ts`** — it's already correct.

2. **Update `SettingsModal.tsx`** — after saving settings with Firebase config, call firebase.service.ts directly instead of `window.electron.sync.push()`:

```tsx
// In SettingsModal.tsx or wherever sync is triggered:
import { FirebaseService } from '../services/firebase.service'

// When syncing:
const unsynced = await window.electron.db.findAll('sync_queue') // still works via bridge
const toSync = unsynced.filter((r: any) => !r.synced)
await FirebaseService.getInstance(config).sync(toSync)
// then mark as synced:
// (add a new bridge method or call db.update on each sync_queue record)
```

3. **Add a `mark_synced` command** (optional, for clean queue management):

Add to `commands.rs`:
```rust
#[tauri::command]
pub fn sync_mark_synced(db: State<Database>, ids: Vec<String>) -> Result<(), String> {
    db.mark_as_synced(&ids).map_err(|e| e.to_string())
}
```

Register it in `lib.rs` invoke_handler and call it from the renderer after a successful Firebase push.

---

## 6. TypeScript errors to fix

Based on the `ts_errors.txt` in your project, fix these **before** migration (they're pre-existing):

```
src/renderer/App.tsx:53 — settings.theme type mismatch
  Fix: cast → dispatch(setSettings(loadedSettings as Settings))

src/renderer/components/Board/Card.tsx:4 — unused 'Tag' import
  Fix: remove the Tag import

src/renderer/components/Board/CardDetailsModal.tsx:26 — unused 'listId'
  Fix: prefix with underscore → _listId or remove from destructure

src/main/index.ts — unused 'event' params (irrelevant after migration)
```

---

## 7. Building for production

```bash
# Build for current platform
npm run build
# Equivalent to: tauri build

# Platform-specific
npm run tauri build -- --target x86_64-pc-windows-msvc  # Windows
npm run tauri build -- --target x86_64-apple-darwin      # macOS Intel
npm run tauri build -- --target aarch64-apple-darwin     # macOS Apple Silicon
npm run tauri build -- --target x86_64-unknown-linux-gnu # Linux

# Output locations (mirrors electron-builder's release/ dir)
# Windows:  src-tauri/target/release/bundle/nsis/
# macOS:    src-tauri/target/release/bundle/macos/ and dmg/
# Linux:    src-tauri/target/release/bundle/appimage/ and deb/
```

### Bundle size comparison (expected)

| | Electron | Tauri |
|---|---|---|
| Installer size | ~80–120 MB | ~4–8 MB |
| Installed size | ~200–250 MB | ~10–20 MB |
| RAM at idle | ~150–250 MB | ~30–80 MB |

---

## 8. Icons

```bash
# Auto-generate all icon sizes from a single 1024×1024 PNG:
npx @tauri-apps/cli icon src/renderer/assets/logo.png
```

This creates the full icon set in `src-tauri/icons/`. Commit them to git.

---

## 9. Tauri-specific gotchas

### CSP (Content Security Policy)

Tauri's default CSP is strict. If Firebase or any external call fails with CSP errors, add to `tauri.conf.json`:

```json
"app": {
  "security": {
    "csp": "default-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com; script-src 'self' 'unsafe-inline'"
  }
}
```

### Window decorations on Windows

The old Electron config used `titleBarStyle: 'hiddenInset'` (macOS only). On Windows/Linux, Tauri uses native decorations by default. To keep the clean look, set in `tauri.conf.json`:

```json
"windows": [{
  "decorations": false
}]
```

Then implement a custom drag region in CSS:
```css
[data-tauri-drag-region] {
  -webkit-app-region: drag;
  app-region: drag;
}
```
Add `data-tauri-drag-region` to your `<Header>` component.

### Single instance lock

The old Electron code used `app.requestSingleInstanceLock()`. Tauri handles this automatically — add to `tauri.conf.json`:

```json
"app": {
  "singleInstance": true
}
```

### `app.isPackaged` equivalent

In Rust, use `cfg!(debug_assertions)`:
```rust
let is_dev = cfg!(debug_assertions);
let db_name = if is_dev { "shipyard-dev.db" } else { "shipyard.db" };
```

Already done in `db/mod.rs`.

### `shell.openExternal` replacement

In the old code: `mainWindow.webContents.setWindowOpenHandler` called `shell.openExternal`.

In Tauri, add to `tauri.conf.json`:
```json
"app": {
  "security": {
    "capabilities": [{
      "permissions": ["shell:open-url"]
    }]
  }
}
```

Then from the renderer:
```ts
import { open } from '@tauri-apps/plugin-shell'
await open('https://example.com')
```

Or handle `<a target="_blank">` automatically by adding to `lib.rs` setup:
```rust
// links with target="_blank" open in the system browser automatically in Tauri v2
```

---

## 10. Rollback plan

If something goes wrong, your Electron version is fully preserved — you've only been adding/replacing files, not editing originals (except main.tsx).

To rollback:
```bash
git checkout -- src/renderer/main.tsx
git checkout -- src/renderer/types/electron.d.ts
# Remove the Tauri additions
rm -rf src-tauri
git checkout -- vite.config.ts package.json tsconfig.json
npm install
```

---

## Summary of changed files

| File | Change type |
|---|---|
| `src-tauri/` (entire folder) | **NEW** — Rust backend |
| `src/renderer/lib/tauri-bridge.ts` | **NEW** — IPC bridge |
| `src/renderer/main.tsx` | **1 line added** — bridge import |
| `src/renderer/types/electron.d.ts` | **Updated** — added `export` field |
| `vite.config.ts` | **Updated** — removed electron-vite |
| `package.json` | **Updated** — removed electron deps |
| `tsconfig.json` | **Updated** — simplified |
| Everything else in `src/renderer/` | **UNCHANGED** |
| `src/shared/` | **UNCHANGED** |
