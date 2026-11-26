---
name: shipyard
description: Manage projects, Kanban boards, tasks, subtasks, deadlines and notes in a Shipyard folder (the local-first Markdown project manager). Use when the user asks to look at, plan, create, update, move, triage or report on their Shipyard workspaces, projects, boards or tasks, e.g. "what's overdue", "add these tasks to the Sprint board", "move X to Done", "write up the status of project Y".
---

# Shipyard

Shipyard keeps everything in a folder of plain Markdown files, one per record:

```
workspace ─┬─ sub-workspace ...
           └─ project ── board ─┬─ column ── task ── subtask
                                └─ status (board-specific task statuses)
```

Projects with no workspace show under **Unassigned Projects**. Tasks carry a
title, Markdown notes, an optional deadline, a status, tags and subtasks.

## How to work with it

Use the bundled client, `scripts/shipyard.py` (Python 3.8+, no dependencies).
It talks to a running Shipyard share, so every write goes through the app's
own storage code: atomic writes, correct timestamps, cascading deletes. Prefer
it over editing files by hand.

### 1. Connect

The client needs `SHIPYARD_URL` (default `http://127.0.0.1:7420`) and
`SHIPYARD_TOKEN`. Find out which situation applies:

- **The app is already sharing the folder** (Settings › Data folder › Share on
  network): ask the user for the address and token.
- **Otherwise**, start a local share yourself, bound to this machine only, in
  the background:

  ```bash
  shipyard-serve /path/to/folder --host 127.0.0.1 --port 7420 --token "$SHIPYARD_TOKEN"
  ```

  `shipyard-serve` is built from the Shipyard repo with `npm run build:serve`
  (output: `src-tauri/target/release/shipyard-serve`). The folder is the one
  the user opened in Shipyard; ask if you don't know it. It's safe to run while
  the desktop app has the same folder open: the app picks up changed files.

Then check the connection: `python3 scripts/shipyard.py info`.

If neither is possible, read and edit the files directly following
`references/format.md`. Reading is always safe; for writes, follow that
file's rules exactly.

### 2. Look before you change

```bash
S="python3 scripts/shipyard.py"        # path is relative to this skill
$S tree                     # workspaces › projects › boards, with ids
$S board "Sprint Board"     # columns and their tasks, in order
$S task task-36847f1b36c2   # one task: notes, subtasks, column
$S find "login"             # search names, descriptions and notes
$S due --days 7             # overdue and upcoming tasks
```

Add `--json` (before or after the command) for machine-readable output.
Names are matched exactly and case-insensitively; when a name is ambiguous
the client lists the matching ids. Use the id then. Column names are only
unique within a board, so pass `--board` with a column name, or use its id.

### 3. Make changes

```bash
$S add-workspace "Clients"                       # --parent for a sub-workspace
$S add-project "Website" --workspace "Clients" --description "Relaunch in Q1"
$S add-board "Sprint 1" --project "Website"      # columns: To Do, In Progress, Done
$S add-board "Bugs" --project "Website" --columns "New,Triaged,Fixing,Fixed"
$S add-column "Blocked" --board "Sprint 1"

$S add-task "Design hero section" --board "Sprint 1" --column "To Do" \
   --deadline 2026-12-05 --status "In Progress" --tag Design \
   --subtask "Wireframe" --subtask "Review with marketing" \
   --notes $'## Goal\n\nA clearer first screen.'
$S update-task <task-id> --append-notes "Agreed copy with marketing."
$S update-task <task-id> --deadline none --add-tag Urgent --remove-tag Design
$S move-task <task-id> --column "Done" --status Done   # --position 0 = top
$S add-subtask <task-id> "Write tests"
$S check <subtask-id>                                  # --undo to uncheck

$S update project "Website" --data '{"name": "Website 2.0", "workspace": "Clients"}'
$S update board "Sprint 1" --data '{"name": "Sprint 2"}'
$S delete task <id> --yes
```

Long text (`--notes`, `--description`, `--data`) can be `@file.md` or `-` to
read stdin. Deadlines are `YYYY-MM-DD` (stored as the end of that day, local
time). Statuses: `To Do`, `In Progress` and `Done` are built in; any other
name is created as a status on that board.

For anything not covered, `$S raw <operation> --table <t> --id <id> --data '<json>'`
sends a query directly. Operations: `findAll`, `findById`, `create`, `update`,
`delete`, `getBoardWithDetails`, `getProjectsWithWorkspaces`.

## Rules

- **Read before writing.** Look at the board or task first so you work from
  current ids and don't create duplicates (`find` before `add-task`).
- **Deletes cascade and can't be undone.** Deleting a workspace deletes its
  sub-workspaces (its projects become Unassigned); a project deletes its boards;
  a board deletes its columns, statuses and tasks; a column deletes its tasks; a
  task deletes its subtasks. Always confirm with the user first, naming what will
  go, then pass `--yes`. Prefer moving tasks to a Done column over deleting them.
- **Bulk changes:** say what you're about to do (how many tasks, which board)
  before doing it, unless the user already spelled it out.
- **Notes are Markdown.** Headings, lists, `- [ ]` checklists, code, links and
  images work, plus `++underline++`, `==highlight==` and `[[Wiki Link]]`. Use
  `--append-notes` to add to notes without losing what's there.
- **Shares are plain HTTP.** Bind `shipyard-serve` to `127.0.0.1` unless the user
  wants it on the network, and don't print or store the token anywhere it
  wasn't already. Stop any server you started when you're done.
- **Report what changed**, with names and ids, so the user can find it in the app.
  Open views refresh when the user next opens them.

## Typical requests

- *"What's on my plate this week?"* → `due --days 7`, group by board, call out
  overdue items first.
- *"Plan out feature X"* → `tree` to find the project, create or pick a board,
  add tasks with subtasks and deadlines, then show the result with `board`.
- *"Status report for project Y"* → `tree --json` for its boards, `board --json`
  for each, then summarise tasks per column, overdue items and blockers.
- *"Triage the bugs board"* → `board`, propose tags, statuses and order, apply
  after the user agrees, using `update-task` and `move-task --position`.

See `references/format.md` for every record's fields and the on-disk format.
