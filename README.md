# Shipyard

Shipyard is a local-first desktop application for project management, Kanban planning, notes, and task tracking. It works offline with an embedded SQLite database and supports optional Firebase or self-hosted server synchronization.

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
- Canonical export schema v2 and legacy v1 export compatibility
- Light and dark themes with a system font picker
- Local SQLite storage with optional Firebase and server synchronization

## Technology

- Tauri 2 and Rust
- React 18, TypeScript, and Vite
- Tailwind CSS
- Redux Toolkit
- SQLite through `rusqlite`
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
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the desktop application for the current platform:

```bash
npm run build
```

## Data Migration

Existing installations are migrated automatically when the application starts. The migration:

- Creates a SQLite backup before changing a legacy database.
- Renames the legacy hierarchy to workspaces, projects, boards, columns, tasks, and subtasks.
- Preserves IDs, timestamps, nested workspaces, unassigned projects, and relationships.
- Converts pending synchronization operations to schema v2.
- Retains the Shipyard application identifier and database filenames.

See [`MIGRATION_to_tauri.md`](MIGRATION_to_tauri.md) for migration and compatibility details.

## Firebase Sync

Create a Firebase web application and Firestore database, then enter the Firebase Web SDK configuration under **Settings > Firebase Sync**.

During the schema transition, Shipyard reads and writes both canonical v2 collections and legacy v1 collection aliases. Canonical records win timestamp ties.

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

The server accepts legacy schema v1 and canonical schema v2 operations while storing canonical record state.

## License

Shipyard is licensed under the MIT License.
