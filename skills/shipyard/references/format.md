# Shipyard folder format (version 2)

Read this when you need a field that `shipyard.py` doesn't expose, or when you
must read or edit the files directly because no share can be started.

## Layout

```text
my-projects/
  shipyard.json        {"format": "shipyard-folder", "version": 2, ...}; never edit
  workspaces/<id>.md
  projects/<id>.md
  boards/<id>.md
  columns/<id>.md
  tasks/<id>.md
  subtasks/<id>.md
  statuses/<id>.md
  connections/<id>.md  arrows drawn between tasks or columns on a board
  tags/<id>.md         optional tag palette; tasks keep their own tag copies
  assets/<id>.<ext>    images used in task notes (png, jpg, gif, webp, bmp)
  .shipyard/           sync queue; never edit
```

The file name is `<id>.md` and must match the `id` field. Ids may contain only
`A-Z a-z 0-9 - _ .`, must not start with `.`, and are at most 200 characters.
The app uses `<kind>-<12 hex>` (e.g. `task-02b2652b6ceb`) or UUIDs.

## Record files

YAML front matter holds the fields. For tasks the `notes` field, and for
projects and boards the `description` field, is the Markdown body after the
front matter instead:

```markdown
---
id: task-02b2652b6ceb
title: Fix dashboard charts
boardId: board-5f3d635d0d65
columnId: column-5f3d635d0d65
order: 0
deadline: 1794700764759
status:
  id: __in_progress__
  name: In Progress
  color: '#f59e0b'
tags:
- id: tag-11608bdd7cda
  name: Bug
  color: '#ef4444'
connectedTaskIds: []
connectedColumnIds: []
createdAt: 1794000000000
updatedAt: 1794000000000
---

## Context

- [ ] Deploy to staging
- [x] Write spec
```

Times (`createdAt`, `updatedAt`, `deadline`) are Unix milliseconds. Colours
are quoted hex strings (`'#ef4444'`). Quote any string YAML could misread
(`'yes'`, `'2024'`, values containing `: ` or `#`).

## Fields

| Record | Fields |
|---|---|
| workspace | `id`, `name`, `color`, `parentWorkspaceId` (null at top level), `createdAt` |
| project | `id`, `name`, `workspaceId` (null = Unassigned), `boardIds` (list, in display order), `tags` (list of strings), `color`, `githubRepo`, `createdAt`, `updatedAt`; body = description |
| board | `id`, `name`, `projectId`, `tags` (list of strings), `color`, `createdAt`, `updatedAt`; body = description |
| column | `id`, `name`, `boardId`, `order` (0-based, left to right), `color`, `createdAt`, `updatedAt` |
| task | `id`, `title`, `columnId`, `boardId`, `order` (0-based within the column, top to bottom), `description` (short plain text), `color`, `deadline` (ms or null), `status` (object or null), `tags` (list of `{id, name, color}`), `connectedTaskIds`, `connectedColumnIds`, `githubLinks` (list of `{kind: issue\|commit, repo, number?, sha?}`), `createdAt`, `updatedAt`; body = notes |
| subtask | `id`, `title`, `completed` (true/false; 1/0 also read), `taskId`, `createdAt` |
| status | `id`, `name`, `color`, `boardId`, `isDefault: false`, `createdAt`, `updatedAt` |
| connection | `id`, `boardId`, `fromId`, `toId`, `type` (`task-to-task` or `column-to-column`), `points` (list of `{x, y}`) |

A task's `status` is a copy of the status, not a reference: `{id, name, color}`
plus `boardId` for board statuses. The built-in ones, not stored as records, are:

| id | name | color |
|---|---|---|
| `__todo__` | To Do | `#6b7280` |
| `__in_progress__` | In Progress | `#f59e0b` |
| `__done__` | Done | `#10b981` |

Subtasks live only in `subtasks/` (linked by `taskId`), not inside the task.

## Notes Markdown

Standard Markdown (headings, lists, `- [ ]` / `- [x]` checklists, quotes, code,
tables, links) plus `++underline++`, `==highlight==` and `[[Wiki Link]]`. Images
use `![alt](shipyard-asset:<id>.<ext>)` for files in `assets/`. A coloured
highlight or resized image is written as inline HTML
(`<mark data-color="#fde68a">…</mark>`, `<img … width="240">`).

## Editing files directly

Only when no share is available. The app re-reads files that change on disk.

1. Write a whole file at a time: write to a temporary file in the same
   folder, then rename it over the target, so the app never reads half a file.
2. Keep every field you didn't mean to change, and set `updatedAt` to the current
   time in ms (not on workspaces, subtasks, tags or connections).
3. New records need a fresh unique id, a file name matching it, and `createdAt`.
4. Keep relationships consistent yourself:
   - Creating a board: add its id to the project's `boardIds`.
   - New tasks or columns: give them `order` = the current maximum + 1.
   - Moving a task: change `columnId` (and `boardId` if it changes board), then
     renumber `order` in the old and new columns.
5. Deleting: remove the children too (see the cascade in SKILL.md), remove a
   deleted board's id from its project's `boardIds`, and set `workspaceId: null`
   on the projects of a deleted workspace.
6. Changes made this way don't reach Firebase or server sync, because the
   sync queue isn't updated. Mention this if the user uses sync.
