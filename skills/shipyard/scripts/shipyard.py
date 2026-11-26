#!/usr/bin/env python3
"""Command-line client for a Shipyard folder (Python 3.8+, standard library only).

It talks to a running Shipyard share (`shipyard-serve`, or the desktop app's
Settings > Data folder > Share on network) over its JSON API, so every write
goes through the app's own storage code: files are written atomically,
timestamps are set and deletes cascade exactly as they do in the app.

Connection, from the environment or flags:
  SHIPYARD_URL    default http://127.0.0.1:7420   (--url)
  SHIPYARD_TOKEN  the share's access token        (--token)

Anything that takes a workspace, project, board or column accepts its id or
its exact name (case-insensitive). Run `shipyard.py <command> -h` for details.
"""

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

DEFAULT_URL = "http://127.0.0.1:7420"

# The app's built-in statuses; they are not stored as records.
DEFAULT_STATUSES = [
    {"id": "__todo__", "name": "To Do", "color": "#6b7280", "isDefault": True},
    {"id": "__in_progress__", "name": "In Progress", "color": "#f59e0b", "isDefault": True},
    {"id": "__done__", "name": "Done", "color": "#10b981", "isDefault": True},
]
TAG_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"]
JSON_LIST_FIELDS = ("tags", "connectedTaskIds", "connectedColumnIds", "boardIds")


class ShipyardError(Exception):
    pass


# ── API ──


class Client:
    def __init__(self, url, token):
        self.url = url.rstrip("/")
        if "://" not in self.url:
            self.url = "http://" + self.url
        self.token = token
        self._cache = {}

    def _request(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.url + path, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if self.token:
            request.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            try:
                payload = json.loads(error.read() or b"{}")
            except ValueError:
                payload = {}
            raise ShipyardError(payload.get("error") or f"HTTP {error.code}") from None
        except urllib.error.URLError as error:
            raise ShipyardError(
                f"cannot reach Shipyard at {self.url} ({error.reason}). Start a share "
                "with `shipyard-serve <folder> --host 127.0.0.1 --token <token>` or "
                "Settings > Data folder > Share on network in the app."
            ) from None
        if payload.get("ok") is False:
            raise ShipyardError(payload.get("error") or "request failed")
        return payload.get("data")

    def info(self):
        return self._request("GET", "/api/info")

    def query(self, operation, table=None, id=None, data=None):
        body = {"operation": operation}
        if table is not None:
            body["table"] = table
        if id is not None:
            body["id"] = id
        if data is not None:
            body["data"] = data
        if operation in ("create", "update", "delete"):
            self._cache.pop(table, None)
        return self._request("POST", "/api/query", body)

    def all(self, table):
        if table not in self._cache:
            self._cache[table] = self.query("findAll", table) or []
        return self._cache[table]

    def get(self, table, id):
        return self.query("findById", table, id=id)

    def create(self, table, data):
        return self.query("create", table, data=data)

    def update(self, table, id, data):
        record = self.query("update", table, id=id, data=data)
        if record is None:
            raise ShipyardError(f"no {table[:-1]} with id {id}")
        return record

    def delete(self, table, id):
        return self.query("delete", table, id=id)


# ── Helpers ──


def now_ms():
    return int(time.time() * 1000)


def new_id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def as_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except ValueError:
            return []
    return []


def as_obj(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except ValueError:
            return None
    return None


def is_done(value):
    return value is True or value == 1 or value == "1" or value == "true"


def label(record):
    return record.get("title") or record.get("name") or record.get("id")


def resolve(client, table, ref, within=None):
    """Finds a record by id, else by exact (case-insensitive) name or title.

    `within` is an optional (field, value) pair that limits the name match,
    e.g. ("boardId", board_id) for a column name.
    """
    if not ref:
        raise ShipyardError(f"a {table[:-1]} is required")
    records = client.all(table)
    for record in records:
        if record.get("id") == ref:
            return record
    wanted = ref.strip().lower()
    matches = [
        r
        for r in records
        if label(r).strip().lower() == wanted and (within is None or r.get(within[0]) == within[1])
    ]
    if len(matches) == 1:
        return matches[0]
    kind = table[:-1]
    if not matches:
        hint = " on that board" if within else ""
        raise ShipyardError(f"no {kind} named or with id {ref!r}{hint}")
    ids = ", ".join(m["id"] for m in matches)
    raise ShipyardError(f"{len(matches)} {table} are named {ref!r} ({ids}); use the id")


def board_of_task(client, task):
    if task.get("boardId"):
        return task["boardId"]
    column = client.get("columns", task.get("columnId") or "")
    return (column or {}).get("boardId")


def parse_deadline(text):
    """YYYY-MM-DD (end of that day, local time, as the app stores it),
    or "none" to clear."""
    if text is None:
        return None
    if text.strip().lower() in ("", "none", "clear"):
        return "clear"
    try:
        day = dt.datetime.strptime(text.strip(), "%Y-%m-%d")
    except ValueError:
        raise ShipyardError(f"deadline must be YYYY-MM-DD or 'none', not {text!r}") from None
    end = day.replace(hour=23, minute=59, second=59, microsecond=999000)
    return int(end.timestamp() * 1000)


def format_deadline(value):
    if not isinstance(value, (int, float)):
        return None
    return dt.datetime.fromtimestamp(value / 1000).strftime("%Y-%m-%d")


def resolve_status(client, board_id, name):
    """A status for a task: a built-in one, a board status, or a new board status."""
    wanted = name.strip().lower()
    for status in DEFAULT_STATUSES:
        if status["name"].lower() == wanted or status["id"] == name:
            return dict(status)
    for status in client.all("statuses"):
        if status.get("boardId") == board_id and (
            status.get("name", "").lower() == wanted or status.get("id") == name
        ):
            return {k: status[k] for k in ("id", "name", "color", "boardId") if k in status}
    created = client.create(
        "statuses",
        {"id": new_id("status"), "name": name.strip(), "color": "#64748b", "boardId": board_id, "isDefault": False},
    )
    return {k: created[k] for k in ("id", "name", "color", "boardId")}


def tag_for(client, name, existing):
    """A tag object for a task, reusing the colour of a tag with that name."""
    wanted = name.strip().lower()
    for tag in client.all("tags"):
        if str(tag.get("name", "")).lower() == wanted:
            return {"id": tag["id"], "name": tag["name"], "color": tag.get("color", TAG_COLORS[0])}
    for task in client.all("tasks"):
        for tag in as_list(task.get("tags")):
            if isinstance(tag, dict) and str(tag.get("name", "")).lower() == wanted:
                return {"id": str(tag.get("id") or new_id("tag")), "name": tag["name"], "color": tag.get("color", TAG_COLORS[0])}
    return {"id": new_id("tag"), "name": name.strip(), "color": TAG_COLORS[len(existing) % len(TAG_COLORS)]}


def next_order(records, field, value):
    orders = [r.get("order") for r in records if r.get(field) == value]
    return max([int(o) + 1 for o in orders if isinstance(o, (int, float))] or [0])


def read_text(value):
    """`@path` reads a file, `-` reads stdin, anything else is the text itself."""
    if value is None:
        return None
    if value == "-":
        return sys.stdin.read()
    if value.startswith("@"):
        with open(value[1:], encoding="utf-8") as handle:
            return handle.read()
    return value


# ── Output ──


def emit(args, data, text_lines):
    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print("\n".join(text_lines))


def task_line(task, subtasks):
    parts = [f"- {task.get('title') or '(untitled)'}  [{task['id']}]"]
    status = as_obj(task.get("status"))
    if status:
        parts.append(f"status: {status.get('name')}")
    deadline = format_deadline(task.get("deadline"))
    if deadline:
        parts.append(f"due {deadline}")
    tags = [t.get("name") for t in as_list(task.get("tags")) if isinstance(t, dict)]
    if tags:
        parts.append("tags: " + ", ".join(tags))
    if subtasks:
        done = sum(1 for s in subtasks if is_done(s.get("completed")))
        parts.append(f"subtasks {done}/{len(subtasks)}")
    return "  ".join(parts)


# ── Commands ──


def cmd_info(client, args):
    info = client.info()
    counts = {table: len(client.all(table)) for table in ("workspaces", "projects", "boards", "tasks")}
    data = {**info, "counts": counts}
    lines = [f"Folder: {info.get('name')}  (format v{info.get('version')}"
             + (", read-only" if info.get("readOnly") else "") + ")"]
    lines += [f"{table}: {n}" for table, n in counts.items()]
    emit(args, data, lines)


def cmd_tree(client, args):
    workspaces = client.all("workspaces")
    projects = client.all("projects")
    boards = client.all("boards")
    ws_ids = {w["id"] for w in workspaces}

    def node_project(project):
        return {
            "id": project["id"],
            "name": project.get("name"),
            "boards": [{"id": b["id"], "name": b.get("name")} for b in boards if b.get("projectId") == project["id"]],
        }

    def node_workspace(ws):
        return {
            "id": ws["id"],
            "name": ws.get("name"),
            "workspaces": [node_workspace(c) for c in workspaces if c.get("parentWorkspaceId") == ws["id"]],
            "projects": [node_project(p) for p in projects if p.get("workspaceId") == ws["id"]],
        }

    roots = [w for w in workspaces if not w.get("parentWorkspaceId") or w.get("parentWorkspaceId") not in ws_ids]
    unassigned = [p for p in projects if not p.get("workspaceId") or p.get("workspaceId") not in ws_ids]
    data = {"workspaces": [node_workspace(w) for w in roots], "unassignedProjects": [node_project(p) for p in unassigned]}

    lines = []

    def draw_project(node, depth):
        lines.append("  " * depth + f"project {node['name']}  [{node['id']}]")
        for board in node["boards"]:
            lines.append("  " * (depth + 1) + f"board {board['name']}  [{board['id']}]")

    def draw_workspace(node, depth):
        lines.append("  " * depth + f"workspace {node['name']}  [{node['id']}]")
        for child in node["workspaces"]:
            draw_workspace(child, depth + 1)
        for project in node["projects"]:
            draw_project(project, depth + 1)

    for node in data["workspaces"]:
        draw_workspace(node, 0)
    if data["unassignedProjects"]:
        lines.append("Unassigned projects")
        for node in data["unassignedProjects"]:
            draw_project(node, 1)
    emit(args, data, lines or ["(empty folder)"])


def cmd_board(client, args):
    board = resolve(client, "boards", args.board)
    details = client.query("getBoardWithDetails", id=board["id"])
    lines = [f"Board {details.get('name')}  [{details['id']}]"]
    for column in details.get("columns", []):
        tasks = column.get("tasks", [])
        lines.append(f"\n## {column.get('name')}  [{column['id']}]  ({len(tasks)})")
        for task in tasks:
            lines.append(task_line(task, task.get("subtasks") or []))
    emit(args, details, lines)


def cmd_task(client, args):
    task = client.get("tasks", args.task)
    if not task:
        raise ShipyardError(f"no task with id {args.task}")
    subtasks = [s for s in client.all("subtasks") if s.get("taskId") == task["id"]]
    subtasks.sort(key=lambda s: (s.get("createdAt") or 0, s["id"]))
    column = client.get("columns", task.get("columnId") or "") or {}
    data = {**task, "subtasks": subtasks, "columnName": column.get("name")}
    lines = [task_line(task, subtasks), f"  column: {column.get('name')}  [{task.get('columnId')}]"]
    for sub in subtasks:
        lines.append(f"  [{'x' if is_done(sub.get('completed')) else ' '}] {sub.get('title')}  [{sub['id']}]")
    if task.get("description"):
        lines += ["", "Description:", task["description"]]
    if task.get("notes"):
        lines += ["", "Notes:", task["notes"]]
    emit(args, data, lines)


def cmd_find(client, args):
    wanted = args.text.lower()
    results = []
    for table, field in (("projects", "name"), ("boards", "name"), ("tasks", "title")):
        for record in client.all(table):
            haystack = " ".join(str(record.get(k) or "") for k in (field, "description", "notes")).lower()
            if wanted in haystack:
                results.append({"type": table[:-1], "id": record["id"], "name": record.get(field)})
    lines = [f"{r['type']:<8} {r['name']}  [{r['id']}]" for r in results[: args.limit]]
    emit(args, results[: args.limit], lines or ["no matches"])


def cmd_due(client, args):
    horizon = now_ms() + args.days * 86400000
    columns = {c["id"]: c for c in client.all("columns")}
    boards = {b["id"]: b for b in client.all("boards")}
    rows = []
    for task in client.all("tasks"):
        deadline = task.get("deadline")
        status = (as_obj(task.get("status")) or {}).get("name", "")
        if not isinstance(deadline, (int, float)) or deadline > horizon:
            continue
        if not args.include_done and status.lower() == "done":
            continue
        column = columns.get(task.get("columnId"), {})
        board = boards.get(task.get("boardId") or column.get("boardId"), {})
        rows.append({
            "id": task["id"], "title": task.get("title"), "deadline": format_deadline(deadline),
            "overdue": deadline < now_ms(), "status": status or None,
            "column": column.get("name"), "board": board.get("name"),
        })
    rows.sort(key=lambda r: r["deadline"])
    lines = [
        f"{r['deadline']}{' OVERDUE' if r['overdue'] else ''}  {r['title']}  "
        f"({r['board']} / {r['column']}{', ' + r['status'] if r['status'] else ''})  [{r['id']}]"
        for r in rows
    ]
    emit(args, rows, lines or [f"nothing due in the next {args.days} days"])


def cmd_add_workspace(client, args):
    data = {"id": new_id("workspace"), "name": args.name, "color": args.color, "parentWorkspaceId": None}
    if args.parent:
        data["parentWorkspaceId"] = resolve(client, "workspaces", args.parent)["id"]
    created = client.create("workspaces", data)
    emit(args, created, [f"created workspace {created['name']}  [{created['id']}]"])


def cmd_add_project(client, args):
    workspace_id = resolve(client, "workspaces", args.workspace)["id"] if args.workspace else None
    created = client.create("projects", {
        "id": new_id("project"), "name": args.name, "description": read_text(args.description) or "",
        "workspaceId": workspace_id, "tags": [], "color": args.color, "boardIds": [],
    })
    emit(args, created, [f"created project {created['name']}  [{created['id']}]"])


def cmd_add_board(client, args):
    project = resolve(client, "projects", args.project)
    board = client.create("boards", {
        "id": new_id("board"), "name": args.name, "description": read_text(args.description) or "",
        "projectId": project["id"], "color": args.color, "tags": [],
    })
    board_ids = [i for i in as_list(project.get("boardIds")) if i != board["id"]] + [board["id"]]
    client.update("projects", project["id"], {"boardIds": board_ids})
    names = [n.strip() for n in args.columns.split(",") if n.strip()] if args.columns else []
    columns = [
        client.create("columns", {"id": new_id("column"), "name": n, "boardId": board["id"], "order": i, "color": "#64748b"})
        for i, n in enumerate(names)
    ]
    emit(args, {**board, "columns": columns},
         [f"created board {board['name']}  [{board['id']}]"]
         + [f"  column {c['name']}  [{c['id']}]" for c in columns])


def cmd_add_column(client, args):
    board = resolve(client, "boards", args.board)
    created = client.create("columns", {
        "id": new_id("column"), "name": args.name, "boardId": board["id"],
        "order": next_order(client.all("columns"), "boardId", board["id"]), "color": args.color,
    })
    emit(args, created, [f"created column {created['name']}  [{created['id']}]"])


def find_column(client, column_ref, board_ref):
    board_id = resolve(client, "boards", board_ref)["id"] if board_ref else None
    return resolve(client, "columns", column_ref, ("boardId", board_id) if board_id else None)


def cmd_add_task(client, args):
    column = find_column(client, args.column, args.board)
    board_id = column["boardId"]
    tags = []
    for name in args.tag or []:
        tags.append(tag_for(client, name, tags))
    deadline = parse_deadline(args.deadline)
    created = client.create("tasks", {
        "id": new_id("task"), "title": args.title, "description": read_text(args.description) or "",
        "columnId": column["id"], "boardId": board_id,
        "order": next_order(client.all("tasks"), "columnId", column["id"]),
        "color": args.color, "deadline": None if deadline in (None, "clear") else deadline,
        "status": resolve_status(client, board_id, args.status) if args.status else None,
        "notes": read_text(args.notes) or "", "tags": tags,
        "connectedTaskIds": [], "connectedColumnIds": [],
    })
    for title in args.subtask or []:
        client.create("subtasks", {"id": new_id("subtask"), "title": title, "completed": False, "taskId": created["id"]})
    emit(args, created, [f"created task {created['title']}  [{created['id']}] in {column['name']}"])


def cmd_update_task(client, args):
    task = client.get("tasks", args.task)
    if not task:
        raise ShipyardError(f"no task with id {args.task}")
    changes = {}
    if args.title is not None:
        changes["title"] = args.title
    if args.description is not None:
        changes["description"] = read_text(args.description)
    if args.notes is not None:
        changes["notes"] = read_text(args.notes)
    if args.append_notes is not None:
        current = (task.get("notes") or "").rstrip("\n")
        addition = read_text(args.append_notes).strip("\n")
        changes["notes"] = f"{current}\n\n{addition}" if current else addition
    if args.color is not None:
        changes["color"] = args.color
    deadline = parse_deadline(args.deadline)
    if deadline == "clear":
        changes["deadline"] = None
    elif deadline is not None:
        changes["deadline"] = deadline
    if args.status is not None:
        clear = args.status.strip().lower() in ("", "none", "clear")
        changes["status"] = None if clear else resolve_status(client, board_of_task(client, task), args.status)
    if args.add_tag or args.remove_tag:
        tags = [t for t in as_list(task.get("tags")) if isinstance(t, dict)]
        removing = {n.lower() for n in args.remove_tag or []}
        tags = [t for t in tags if str(t.get("name", "")).lower() not in removing]
        for name in args.add_tag or []:
            if not any(str(t.get("name", "")).lower() == name.lower() for t in tags):
                tags.append(tag_for(client, name, tags))
        changes["tags"] = tags
    if not changes:
        raise ShipyardError("nothing to change; pass at least one option")
    updated = client.update("tasks", task["id"], changes)
    emit(args, updated, [f"updated task {updated.get('title')}  [{updated['id']}]: " + ", ".join(changes)])


def cmd_move_task(client, args):
    task = client.get("tasks", args.task)
    if not task:
        raise ShipyardError(f"no task with id {args.task}")
    board_ref = args.board or board_of_task(client, task)
    column = find_column(client, args.column, board_ref)
    siblings = sorted(
        (t for t in client.all("tasks") if t.get("columnId") == column["id"] and t["id"] != task["id"]),
        key=lambda t: (t.get("order") if isinstance(t.get("order"), (int, float)) else 0, t.get("createdAt") or 0),
    )
    position = len(siblings) if args.position is None else max(0, min(args.position, len(siblings)))
    siblings.insert(position, task)
    for index, sibling in enumerate(siblings):
        if sibling["id"] == task["id"]:
            changes = {"order": index, "columnId": column["id"], "boardId": column["boardId"]}
            if args.status:
                changes["status"] = resolve_status(client, column["boardId"], args.status)
            client.update("tasks", task["id"], changes)
        elif sibling.get("order") != index:
            # Renumbering a neighbour is not an edit of it; keep its updatedAt.
            client.update("tasks", sibling["id"], {"order": index, "updatedAt": sibling.get("updatedAt") or now_ms()})
    emit(args, {"id": task["id"], "columnId": column["id"], "order": position},
         [f"moved {task.get('title')} to {column['name']} at position {position}"])


def cmd_add_subtask(client, args):
    task = client.get("tasks", args.task)
    if not task:
        raise ShipyardError(f"no task with id {args.task}")
    created = client.create("subtasks", {"id": new_id("subtask"), "title": args.title, "completed": False, "taskId": task["id"]})
    emit(args, created, [f"added subtask {created['title']}  [{created['id']}]"])


def cmd_check(client, args):
    subtask = client.get("subtasks", args.subtask)
    if not subtask:
        raise ShipyardError(f"no subtask with id {args.subtask}")
    updated = client.update("subtasks", subtask["id"], {"completed": not args.undo})
    emit(args, updated, [f"{'unchecked' if args.undo else 'checked'} {updated.get('title')}"])


# What else a delete removes, as the store cascades it.
CASCADE = {
    "workspaces": "also deletes its sub-workspaces; their projects become Unassigned.",
    "projects": "also deletes its boards with their columns, statuses, tasks and subtasks.",
    "boards": "also deletes its columns, statuses, connections, tasks and subtasks.",
    "columns": "also deletes its tasks and their subtasks.",
    "tasks": "also deletes its subtasks.",
    "subtasks": "removes it from its task.",
    "statuses": "removes it from the board (tasks keep their copy).",
    "connections": "removes the arrow from the board.",
    "tags": "removes it from the tag list (tasks keep their copy).",
}

DELETE_TABLES = {
    "workspace": "workspaces", "project": "projects", "board": "boards", "column": "columns",
    "task": "tasks", "subtask": "subtasks", "status": "statuses", "connection": "connections", "tag": "tags",
}


def cmd_delete(client, args):
    table = DELETE_TABLES[args.kind]
    record = resolve(client, table, args.id)
    if not args.yes:
        raise ShipyardError(
            f"deleting {args.kind} {label(record)!r} {CASCADE[table]} It cannot be undone. "
            "Re-run with --yes."
        )
    if table == "boards":
        project = client.get("projects", record.get("projectId") or "")
        if project:
            ids = [i for i in as_list(project.get("boardIds")) if i != record["id"]]
            client.update("projects", project["id"], {"boardIds": ids})
    client.delete(table, record["id"])
    emit(args, {"deleted": record["id"]}, [f"deleted {args.kind} {label(record)}"])


def cmd_update(client, args):
    data = json.loads(read_text(args.data))
    if not isinstance(data, dict):
        raise ShipyardError("--data must be a JSON object")
    table = DELETE_TABLES.get(args.kind, args.kind)
    if table == "projects" and "workspace" in data:
        ref = data.pop("workspace")
        data["workspaceId"] = resolve(client, "workspaces", ref)["id"] if ref else None
    updated = client.update(table, resolve(client, table, args.id)["id"], data)
    emit(args, updated, [f"updated {args.kind} {label(updated)}: " + ", ".join(data)])


def cmd_raw(client, args):
    data = json.loads(read_text(args.data)) if args.data else None
    result = client.query(args.operation, args.table, id=args.id, data=data)
    print(json.dumps(result, indent=2, ensure_ascii=False))


# ── CLI ──


def build_parser():
    parser = argparse.ArgumentParser(prog="shipyard.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("--url", default=os.environ.get("SHIPYARD_URL", DEFAULT_URL))
    parser.add_argument("--token", default=os.environ.get("SHIPYARD_TOKEN", ""))
    parser.add_argument("--json", action="store_true", help="print JSON instead of text")
    sub = parser.add_subparsers(dest="command", required=True)

    def command(name, func, help_text):
        p = sub.add_parser(name, help=help_text, description=help_text)
        p.set_defaults(func=func)
        # Allow --json after the command name too.
        p.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
        return p

    command("info", cmd_info, "Folder name, format and record counts")
    command("tree", cmd_tree, "Workspaces, projects and boards with their ids")
    p = command("board", cmd_board, "A board's columns and tasks in order")
    p.add_argument("board", help="board id or name")
    p = command("task", cmd_task, "One task with its notes and subtasks")
    p.add_argument("task", help="task id")
    p = command("find", cmd_find, "Search project, board and task names, descriptions and notes")
    p.add_argument("text")
    p.add_argument("--limit", type=int, default=50)
    p = command("due", cmd_due, "Tasks that are overdue or due soon")
    p.add_argument("--days", type=int, default=7, help="look this many days ahead (default 7)")
    p.add_argument("--include-done", action="store_true", help="include tasks whose status is Done")

    p = command("add-workspace", cmd_add_workspace, "Create a workspace")
    p.add_argument("name")
    p.add_argument("--parent", help="parent workspace id or name, for a sub-workspace")
    p.add_argument("--color", default="#64748b")
    p = command("add-project", cmd_add_project, "Create a project")
    p.add_argument("name")
    p.add_argument("--workspace", help="workspace id or name (omit for Unassigned)")
    p.add_argument("--description", help="Markdown text, @file or - for stdin")
    p.add_argument("--color", default="#0ea5e9")
    p = command("add-board", cmd_add_board, "Create a board in a project, optionally with columns")
    p.add_argument("name")
    p.add_argument("--project", required=True, help="project id or name")
    p.add_argument("--columns", default="To Do,In Progress,Done",
                   help='comma-separated column names (default "To Do,In Progress,Done"; "" for none)')
    p.add_argument("--description", help="Markdown text, @file or - for stdin")
    p.add_argument("--color", default="#8b5cf6")
    p = command("add-column", cmd_add_column, "Add a column at the end of a board")
    p.add_argument("name")
    p.add_argument("--board", required=True, help="board id or name")
    p.add_argument("--color", default="#64748b")

    p = command("add-task", cmd_add_task, "Create a task at the bottom of a column")
    p.add_argument("title")
    p.add_argument("--column", required=True, help="column id, or its name together with --board")
    p.add_argument("--board", help="board id or name, to find the column by name")
    p.add_argument("--notes", help="Markdown notes, @file or - for stdin")
    p.add_argument("--description", help="short plain-text summary")
    p.add_argument("--deadline", help="YYYY-MM-DD")
    p.add_argument("--status", help="status name, e.g. 'In Progress' (created on the board if new)")
    p.add_argument("--tag", action="append", help="tag name (repeatable)")
    p.add_argument("--subtask", action="append", help="subtask title (repeatable)")
    p.add_argument("--color", default="#3b82f6")
    p = command("update-task", cmd_update_task, "Change a task's fields")
    p.add_argument("task", help="task id")
    p.add_argument("--title")
    p.add_argument("--description")
    p.add_argument("--notes", help="replace the notes: Markdown text, @file or - for stdin")
    p.add_argument("--append-notes", help="add a paragraph to the end of the notes")
    p.add_argument("--deadline", help="YYYY-MM-DD, or none to clear")
    p.add_argument("--status", help="status name, or none to clear")
    p.add_argument("--add-tag", action="append")
    p.add_argument("--remove-tag", action="append")
    p.add_argument("--color")
    p = command("move-task", cmd_move_task, "Move a task to a column (and position)")
    p.add_argument("task", help="task id")
    p.add_argument("--column", required=True, help="column id or name (on the task's board unless --board)")
    p.add_argument("--board", help="board id or name, to move to another board")
    p.add_argument("--position", type=int, help="0-based position in the column (default: bottom)")
    p.add_argument("--status", help="also set this status")
    p = command("add-subtask", cmd_add_subtask, "Add a subtask to a task")
    p.add_argument("task", help="task id")
    p.add_argument("title")
    p = command("check", cmd_check, "Mark a subtask done (or not, with --undo)")
    p.add_argument("subtask", help="subtask id")
    p.add_argument("--undo", action="store_true")

    p = command("update", cmd_update, "Change any record's fields from a JSON object")
    p.add_argument("kind", choices=sorted(DELETE_TABLES))
    p.add_argument("id", help="id, or exact name")
    p.add_argument("--data", required=True, help='JSON object, @file or -, e.g. \'{"name": "New name"}\'')
    p = command("delete", cmd_delete, "Delete a record and everything inside it")
    p.add_argument("kind", choices=sorted(DELETE_TABLES))
    p.add_argument("id", help="id, or exact name")
    p.add_argument("--yes", action="store_true", help="confirm the delete")
    p = command("raw", cmd_raw, "Send one query to the API as-is (findAll, findById, ...)")
    p.add_argument("operation")
    p.add_argument("--table")
    p.add_argument("--id")
    p.add_argument("--data", help="JSON, @file or -")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    client = Client(args.url, args.token)
    try:
        args.func(client, args)
    except ShipyardError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    except (ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
