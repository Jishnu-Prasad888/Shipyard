# Shipyard

Shipyard is a local-first desktop application for project management, Kanban planning, notes, and task tracking. There is no database: you point it at a folder and it reads and writes plain Markdown files there. Folders can live anywhere (a USB drive, a synced drive, a network share, a git repo) and can be opened from other computers by IP address. Optional Firebase or self-hosted server synchronization is still available.

## Organization Model

Shipyard uses standard project-management terminology throughout the application:

- **Workspaces** organize related projects and can contain sub-workspaces.
- **Projects** group one or more boards.
- **Boards** provide Kanban views for a project.
- **Columns** represent workflow stages such as To Do, In Progress, and Done.
- **Tasks** contain descriptions, notes, deadlines, tags, statuses, links, and subtasks.
- **Subtasks** track the individual steps required to complete a task.

Projects that do not belong to a workspace remain available under **Unassigned Projects**.

## Features

- Workspace overview with recent boards and project grouping
- Nested workspaces and drag-and-drop project organization
- Kanban boards with reorderable columns and tasks
- Project Calendar with month, week, and agenda views
- Global search across workspaces, projects, and boards
- Rich task notes powered by Tiptap
- Markdown, task lists, tables, links, images, and code formatting
- Tags, custom colors, deadlines, statuses, task connections, and subtasks
- JSON, CSV, and Markdown exports
- Light and dark themes with a system font picker
- Folder-based storage: one readable Markdown file per record (YAML front matter, notes as the body)
- Open folders shared from another computer by IP address
- Portable mode: keep the app and its data together on a USB drive
- Optional Firebase and server synchronization

## Technology

- Tauri 2 and Rust
- React 18, TypeScript, and Vite
- Tailwind CSS
- Redux Toolkit
- Plain Markdown files (no database), shared over HTTP with `tiny_http`
- Firebase Firestore
- Optional Go sync server backed by PostgreSQL and Redis
- Tiptap and dnd-kit

## Requirements

- Node.js 20 or newer
- npm
- Rust stable toolchain
- Platform dependencies required by [Tauri](https://v2.tauri.app/start/prerequisites/)

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build:renderer
npm run test:rust
```

Build the desktop application for the current platform:

```bash
npm run build
```

## Data Folders

On first launch Shipyard asks you to **open a folder**. Pick an empty folder to start fresh, or one you have used before. You can switch folders any time from **Settings › Data folder**, and recent folders are listed on the open screen.

A folder looks like this:

```text
my-projects/
  shipyard.json          folder marker and format version
  workspaces/<id>.md
  projects/<id>.md
  boards/<id>.md
  columns/<id>.md
  tasks/<id>.md
  subtasks/<id>.md
  statuses/<id>.md
  connections/<id>.md
  tags/<id>.md
  assets/<id>.<ext>      images added to task notes
  .shipyard/             pending sync changes (only used by Firebase/server sync)
```

Every record is its own Markdown file, written atomically. Its fields are in a YAML front-matter block; a task's notes (and a project's or board's description) are the Markdown body, so the folder can be read and edited in any Markdown editor:

```markdown
---
id: task-02b2652b6ceb
title: Fix dashboard charts
columnId: column-5f3d635d0d65
deadline: 1794700764759
status:
  name: In Review
  color: '#f59e0b'
tags:
- name: Bug
  color: '#ef4444'
---

## Context

Customers have been asking for this.

- [ ] Deploy to staging
- [x] Write spec
```

Notes use standard Markdown plus `++underline++`, `==highlight==` and `[[wiki links]]`; a coloured highlight or a resized image is written as inline HTML. Folders from Shipyard versions that stored JSON files (format version 1) are not read; Shipyard refuses to open them rather than showing them empty. Files are re-read when they change on disk, so edits made outside the app (or by another computer using the same network share) show up when you next open that view. Copying the folder copies everything; deleting a file deletes that record.

Images pasted, dropped or picked into task notes are saved under `assets/` (PNG, JPEG, GIF, WebP or BMP, up to 20 MB each) and work over a network share too. Firebase and server sync do not copy images yet.

Per-device settings (theme, font, recent folders, sharing options) are stored separately in the app config directory, not in the data folder.

### Choosing a folder at launch

- `shipyard --data /path/to/folder` or the `SHIPYARD_DATA_DIR` environment variable opens a folder directly.
- **Portable mode:** create a folder named `shipyard-data` next to the Shipyard executable. Shipyard then opens it automatically and keeps its settings inside it, so the app and data can travel together.

### Opening a folder on another computer (by IP)

**From the desktop app:** on the computer that has the folder, open it and go to **Settings › Data folder › Share on network**. Choose a port (default `7420`), keep or regenerate the access token, optionally tick *Read-only*, and click **Start sharing**. The panel shows the address to use, for example `192.168.1.20:7420`.

**Headless (NAS, server, Raspberry Pi):** build and run the small `shipyard-serve` binary; it needs no desktop session.

```bash
npm run build:serve            # outputs src-tauri/target/release/shipyard-serve
shipyard-serve /srv/projects --port 7420 --token my-secret-token
# options: --host 0.0.0.0  --read-only   (token can also come from SHIPYARD_TOKEN)
```

On the other computer, choose **Connect to a shared folder** on the open screen and enter the IP address (with `:port` if it is not 7420) and the token. Every change goes straight to the files on the sharing computer.

Shares use plain HTTP with a bearer token. Use them on networks you trust, or over a VPN such as Tailscale or WireGuard. A folder on an SMB/NFS network share can also be opened directly with **Open folder…**.

### Moving data from an older version

Earlier versions stored data in a SQLite database (`shipyard.db`). Copy it into a folder with the bundled script (needs only Python 3; the database is opened read-only):

```bash
python3 scripts/sqlite-to-folder.py ~/my-projects
# or give the database path explicitly:
python3 scripts/sqlite-to-folder.py /path/to/shipyard.db ~/my-projects
```

Then open `~/my-projects` in Shipyard. Without a path, the script looks in the default location for your OS (`~/.local/share/com.shipyard.app/` on Linux, `~/Library/Application Support/com.shipyard.app/` on macOS, `%APPDATA%\com.shipyard.app\` on Windows).

## AI Agent Skill

`skills/shipyard/` is an [Agent Skill](https://agentskills.io) that lets an AI agent (Claude Code, Claude Desktop or any agent that reads `SKILL.md` files) look at and manage your workspaces, projects, boards and tasks. Copy the folder into your agent's skills directory, for example:

```bash
cp -r skills/shipyard ~/.claude/skills/
```

The agent uses the bundled `scripts/shipyard.py` (Python 3, no dependencies), which talks to a Shipyard share: either `shipyard-serve` on `127.0.0.1`, or the desktop app's **Share on network**. Writes therefore go through the same storage code as the app. Try asking "what's due this week in Shipyard?" or "add these tasks to the Sprint board".

## Firebase Sync

Create a Firebase web application and Firestore database, then enter the Firebase Web SDK configuration under **Settings > Firebase Sync**.

Records are stored in Firestore collections named after each record type (`workspaces`, `projects`, `boards`, `columns`, `tasks`, `subtasks`, `statuses`, `connections`, `tags`).

## Self-Hosted Sync Server

The optional server requires Go 1.22+, PostgreSQL, and Redis.

```bash
cd server
go run .
```

Configure `DATABASE_URL`, `REDIS_ADDR`, `REDIS_PASSWORD`, `REDIS_DB`, and `PORT` as needed. Supported endpoints are:

- `GET /health`
- `GET /sync/status`
- `POST /sync`
- `POST /sync/push`

The server accepts schema v2 operations for the record types listed above.

## License

Shipyard is licensed under the MIT License.
