# Shipyard Data and Terminology Migration

Shipyard runs on Tauri 2 and uses a Rust-managed SQLite database. This document describes the automatic migration from the legacy nautical data model to the canonical project-management model.

## Canonical Model

| Legacy schema | Canonical schema |
|---|---|
| `folders` | `workspaces` |
| `folders.parentId` | `workspaces.parentWorkspaceId` |
| `docks` | `projects` |
| `docks.folderId` | `projects.workspaceId` |
| `boards.dockId` | `boards.projectId` |
| `lists` | `columns` |
| `cards` | `tasks` |
| `cards.listId` | `tasks.columnId` |
| `subcards` | `subtasks` |
| `subcards.cardId` | `subtasks.taskId` |
| `connectedCardIds` | `connectedTaskIds` |
| `connectedListIds` | `connectedColumnIds` |
| `card-to-card` | `task-to-task` |
| `list-to-list` | `column-to-column` |

The `boards`, `statuses`, `connections`, `tags`, `settings`, and `sync_queue` concepts remain part of the schema.

## Startup Migration

`src-tauri/src/db/mod.rs` checks `PRAGMA user_version` when Shipyard starts.

For a legacy database, Shipyard:

1. Creates a consistent backup using SQLite `VACUUM INTO`.
2. Starts a transaction.
3. Renames legacy tables and relationship columns.
4. Adds optional fields that may be absent in older installations.
5. Recreates canonical indexes.
6. Converts connection types and known built-in workflow labels.
7. Converts unsynced queue table names and payload fields.
8. Sets the schema version.
9. Commits only after all operations succeed.

Nested folders become nested workspaces. Projects with no workspace keep a null `workspaceId` and appear under **Unassigned Projects**. Existing record IDs are intentionally preserved even when an old ID contains a legacy prefix.

The application continues using the existing `shipyard.db` and `shipyard-dev.db` filenames and the `com.shipyard.app` application identifier.

## Backup Files

Before migrating a legacy database, Shipyard creates a backup beside the database with a name similar to:

```text
shipyard.db.v0-backup-<timestamp>.db
```

Keep this file until the migrated installation and synchronization targets have been verified.

## Sync Schema Compatibility

Desktop sync requests use `schemaVersion: 2`. Pending local schema v1 operations are converted during the SQLite migration.

The Go server accepts both schema versions on `POST /sync` and `POST /sync/push`. It preserves the original event table and payload for auditing while storing canonical table names and payloads in `records_state`. Existing legacy state is reconciled by record timestamp during server startup.

Firebase compatibility performs the following behavior:

- Reads canonical and legacy collection aliases.
- Normalizes legacy relationship fields in memory.
- Chooses the newest record by `_lastModified`.
- Prefers the canonical record when timestamps are equal.
- Writes updates and deletes to both collection aliases during the compatibility period.

## Export Compatibility

Canonical JSON exports use schema v2:

```json
{
  "$schema": "shipyard-export",
  "schemaVersion": 2,
  "product": "Shipyard",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "workspaces": [],
  "projects": [],
  "boards": [],
  "columns": [],
  "tasks": [],
  "subtasks": []
}
```

The export dialog also provides Legacy v1 output for existing integrations.

## Verification

Run the automated checks:

```bash
npm run typecheck
npm test
npm run build:renderer
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cd server && go test ./... && go vet ./...
```

For a migrated database copy, verify SQLite integrity:

```bash
sqlite3 migrated.db "PRAGMA user_version; PRAGMA integrity_check; PRAGMA foreign_key_check;"
sqlite3 migrated.db ".tables"
```

Expected canonical tables include `workspaces`, `projects`, `boards`, `columns`, `tasks`, and `subtasks`. Legacy table names should only remain in migration code, compatibility adapters, tests, or legacy export output.
