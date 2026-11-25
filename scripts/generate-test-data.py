#!/usr/bin/env python3
"""Generate fake Shipyard data in a folder (default: ./data_test).

Writes the same layout the app uses: a shipyard.json marker plus one JSON file
per record under workspaces/, projects/, boards/, columns/, statuses/, tasks/,
subtasks/, connections/ and tags/.

Usage:
    python3 scripts/generate-test-data.py [options]

Options:
    --out DIR        output folder (default: ./data_test in the current directory)
    --seed N         random seed, for repeatable data (default: random)
    --workspaces N   top-level workspaces (default: 3)
    --projects N     projects per workspace (default: 3)
    --boards N       max boards per project (default: 3)
    --tasks N        max tasks per column (default: 6)
    --keep           add to the folder instead of wiping it first

Only the Python standard library is needed.
"""

import argparse
import json
import random
import shutil
import sys
import time
import uuid
from pathlib import Path

TABLES = [
    "workspaces",
    "projects",
    "boards",
    "columns",
    "tasks",
    "subtasks",
    "statuses",
    "connections",
    "tags",
]

DAY = 86_400_000

COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
    "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
    "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
]

WORKSPACE_NAMES = [
    "Engineering", "Marketing", "Operations", "Design", "Research",
    "Customer Success", "Finance", "Personal", "Side Projects", "Platform",
]
SUB_WORKSPACE_NAMES = ["Frontend", "Backend", "Infra", "Growth", "Labs", "Archive"]

PROJECT_ADJ = ["Apollo", "Nimbus", "Atlas", "Orion", "Falcon", "Mercury", "Juniper",
               "Cobalt", "Horizon", "Beacon", "Quartz", "Summit", "Vertex", "Harbor"]
PROJECT_NOUN = ["Redesign", "Migration", "Launch", "Revamp", "Initiative", "Rollout",
                "Platform", "Overhaul", "Pilot", "Expansion"]

BOARD_NAMES = ["Sprint Board", "Roadmap", "Bug Triage", "Release Train", "Backlog",
               "Research", "Content Calendar", "Q4 Planning", "Ops Runbook", "Hiring"]

COLUMN_SETS = [
    [("To Do", "#64748b"), ("In Progress", "#3b82f6"), ("Review", "#f59e0b"), ("Done", "#22c55e")],
    [("Backlog", "#64748b"), ("Ready", "#0ea5e9"), ("Doing", "#8b5cf6"), ("Done", "#10b981")],
    [("Ideas", "#a855f7"), ("Prototype", "#06b6d4"), ("Shipped", "#22c55e")],
    [("Triage", "#ef4444"), ("Investigating", "#f97316"), ("Fixed", "#10b981"), ("Won't Fix", "#64748b")],
]

STATUS_SET = [("Not Started", "#64748b"), ("In Progress", "#3b82f6"),
              ("Blocked", "#ef4444"), ("In Review", "#f59e0b"), ("Done", "#22c55e")]

TAGS = [("Bug", "#ef4444"), ("Feature", "#3b82f6"), ("UX", "#6366f1"),
        ("Performance", "#0ea5e9"), ("Customer", "#f59e0b"), ("Docs", "#64748b"),
        ("Security", "#dc2626"), ("Tech Debt", "#a855f7"), ("Urgent", "#f43f5e"),
        ("Research", "#14b8a6"), ("Design", "#d946ef"), ("Infra", "#f97316")]

VERBS = ["Implement", "Fix", "Refactor", "Design", "Write", "Review", "Investigate",
         "Migrate", "Document", "Optimize", "Test", "Prototype", "Clean up", "Add"]
OBJECTS = ["login flow", "settings page", "search indexing", "export to CSV",
           "onboarding tour", "dark mode", "API rate limiting", "billing webhook",
           "dashboard charts", "notification emails", "mobile layout", "cache layer",
           "error reporting", "drag and drop", "keyboard shortcuts", "audit log",
           "file uploads", "user invites", "release notes", "load tests",
           "accessibility audit", "database backups", "CI pipeline", "pricing page"]
SUBTASK_STEPS = ["Write spec", "Get design sign-off", "Implement backend", "Implement UI",
                 "Add unit tests", "Update docs", "QA pass", "Deploy to staging",
                 "Collect feedback", "Ship to production", "Monitor metrics"]
SENTENCES = [
    "This came up in the last planning meeting.",
    "Customers have been asking for this for a while.",
    "Keep the scope small for the first iteration.",
    "Coordinate with the design team before starting.",
    "There is a related discussion in the team channel.",
    "Watch out for edge cases with empty states.",
    "Measure the impact after release.",
    "Blocked until the upstream change lands.",
    "Pair on this if it takes longer than a day.",
    "Should be behind a feature flag initially.",
]


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def write_json(path: Path, data) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


class Generator:
    def __init__(self, out: Path, rng: random.Random):
        self.out = out
        self.rng = rng
        self.now = int(time.time() * 1000)
        self.counts = {t: 0 for t in TABLES}

    def put(self, table: str, record: dict) -> dict:
        write_json(self.out / table / f"{record['id']}.json", record)
        self.counts[table] += 1
        return record

    def past(self, max_days: int = 60) -> int:
        return self.now - self.rng.randint(1, max_days) * DAY - self.rng.randint(0, DAY)

    def notes_html(self) -> str:
        r = self.rng
        parts = [f"<p>{' '.join(r.sample(SENTENCES, r.randint(1, 3)))}</p>"]
        if r.random() < 0.4:
            items = "".join(f"<li><p>{s}</p></li>" for s in r.sample(SUBTASK_STEPS, 3))
            parts.append(f"<ul>{items}</ul>")
        if r.random() < 0.2:
            parts.append("<p><strong>Note:</strong> check the <code>staging</code> config first.</p>")
        return "".join(parts)

    def run(self, n_workspaces: int, n_projects: int, max_boards: int, max_tasks: int) -> None:
        r = self.rng
        tags = [
            self.put("tags", {"id": uid("tag"), "name": n, "color": c, "createdAt": self.past(90)})
            for n, c in TAGS
        ]
        task_tags = [{"id": t["id"], "name": t["name"], "color": t["color"]} for t in tags]

        # Workspaces, some with a sub-workspace.
        workspaces = []
        for name in r.sample(WORKSPACE_NAMES, min(n_workspaces, len(WORKSPACE_NAMES))):
            ws = self.put("workspaces", {
                "id": uid("workspace"), "name": name, "color": r.choice(COLORS),
                "createdAt": self.past(90),
            })
            workspaces.append(ws)
            if r.random() < 0.5:
                workspaces.append(self.put("workspaces", {
                    "id": uid("workspace"), "name": r.choice(SUB_WORKSPACE_NAMES),
                    "color": r.choice(COLORS), "parentWorkspaceId": ws["id"],
                    "createdAt": self.past(80),
                }))

        # Projects: n per workspace, plus two unassigned.
        owners = [ws["id"] for ws in workspaces for _ in range(n_projects)] + [None, None]
        used_names = set()
        for ws_id in owners:
            name = f"{r.choice(PROJECT_ADJ)} {r.choice(PROJECT_NOUN)}"
            while name in used_names:
                name = f"{r.choice(PROJECT_ADJ)} {r.choice(PROJECT_NOUN)}"
            used_names.add(name)
            self.make_project(name, ws_id, max_boards, max_tasks, task_tags)

        (self.out / ".shipyard").mkdir(exist_ok=True)

    def make_project(self, name, ws_id, max_boards, max_tasks, task_tags) -> None:
        r = self.rng
        created = self.past(60)
        project_id = uid("project")
        board_ids = []
        for board_name in r.sample(BOARD_NAMES, r.randint(1, max_boards)):
            board_ids.append(self.make_board(board_name, project_id, created, max_tasks, task_tags))

        project = {
            "id": project_id, "name": name,
            "description": f"{r.choice(SENTENCES)}",
            "tags": r.sample(["planning", "delivery", "q4", "internal", "client", "mvp"], 2),
            "color": r.choice(COLORS), "boardIds": board_ids,
            "createdAt": created, "updatedAt": self.now - r.randint(0, 5) * DAY,
        }
        if ws_id:
            project["workspaceId"] = ws_id
        self.put("projects", project)

    def make_board(self, name, project_id, created, max_tasks, task_tags) -> str:
        r = self.rng
        board_id = uid("board")
        self.put("boards", {
            "id": board_id, "name": name, "description": r.choice(SENTENCES),
            "projectId": project_id, "color": r.choice(COLORS),
            "tags": r.sample(["sprint", "roadmap", "qa", "ops", "design"], 2),
            "createdAt": created, "updatedAt": self.now - r.randint(0, 3) * DAY,
        })

        statuses = [
            self.put("statuses", {
                "id": uid("status"), "name": n, "color": c, "boardId": board_id,
                "createdAt": created, "updatedAt": created,
            })
            for n, c in STATUS_SET
        ]

        columns = []
        for order, (col_name, col_color) in enumerate(r.choice(COLUMN_SETS)):
            columns.append(self.put("columns", {
                "id": uid("column"), "name": col_name, "boardId": board_id,
                "order": order, "color": col_color,
                "createdAt": created, "updatedAt": created,
            }))

        tasks = []
        last = len(columns) - 1
        for ci, column in enumerate(columns):
            for order in range(r.randint(0, max_tasks)):
                # Tasks further right lean towards "done".
                if ci == last:
                    status = statuses[-1]
                else:
                    status = r.choice(statuses[:-1])
                tasks.append(self.make_task(board_id, column["id"], order, status, task_tags))

        # Link a few tasks together, with a matching visual connection.
        for _ in range(min(len(tasks) // 4, 4)):
            a, b = r.sample(tasks, 2)
            a["connectedTaskIds"].append(b["id"])
            self.put("connections", {
                "id": uid("conn"), "fromId": a["id"], "toId": b["id"],
                "type": "task-to-task", "boardId": board_id,
                "points": [{"x": 80.0, "y": 90.0}, {"x": 220.0, "y": 130.0}],
            })
        for t in tasks:
            self.put("tasks", t)
        return board_id

    def make_task(self, board_id, column_id, order, status, task_tags) -> dict:
        r = self.rng
        task_id = uid("task")
        created = self.past(45)
        task = {
            "id": task_id,
            "title": f"{r.choice(VERBS)} {r.choice(OBJECTS)}",
            "description": r.choice(SENTENCES),
            "columnId": column_id, "boardId": board_id, "order": order,
            "color": r.choice(COLORS),
            "tags": r.sample(task_tags, r.randint(0, 3)),
            "status": {k: status[k] for k in ("id", "name", "color", "boardId")},
            "notes": self.notes_html() if r.random() < 0.7 else "",
            "connectedTaskIds": [], "connectedColumnIds": [],
            "createdAt": created, "updatedAt": max(created, self.now - r.randint(0, 10) * DAY),
        }
        # Deadlines spread across the past two weeks and next five, so the
        # calendar and overdue states have something to show.
        if r.random() < 0.75:
            task["deadline"] = self.now + r.randint(-14, 35) * DAY + r.randint(0, DAY)

        if r.random() < 0.5:
            done_all = status["name"] == "Done"
            for step in r.sample(SUBTASK_STEPS, r.randint(1, 5)):
                self.put("subtasks", {
                    "id": uid("subtask"), "title": step, "taskId": task_id,
                    "completed": done_all or r.random() < 0.4, "createdAt": created,
                })
        return task


def main() -> int:
    p = argparse.ArgumentParser(description="Generate fake Shipyard data.")
    p.add_argument("--out", default="data_test")
    p.add_argument("--seed", type=int)
    p.add_argument("--workspaces", type=int, default=3)
    p.add_argument("--projects", type=int, default=3)
    p.add_argument("--boards", type=int, default=3)
    p.add_argument("--tasks", type=int, default=6)
    p.add_argument("--keep", action="store_true")
    args = p.parse_args()

    out = Path(args.out).resolve()
    if out.exists() and not args.keep:
        # Only wipe folders that are clearly Shipyard data (or empty), never
        # an arbitrary directory passed by mistake.
        if any(out.iterdir()) and not (out / "shipyard.json").exists():
            print(f"Refusing to wipe {out}: it isn't a Shipyard folder. Use another --out.")
            return 1
        shutil.rmtree(out)

    out.mkdir(parents=True, exist_ok=True)
    for t in TABLES:
        (out / t).mkdir(exist_ok=True)
    marker = out / "shipyard.json"
    if not marker.exists():
        write_json(marker, {"format": "shipyard-folder", "version": 1,
                            "createdAt": int(time.time() * 1000)})

    rng = random.Random(args.seed)
    gen = Generator(out, rng)
    gen.run(args.workspaces, args.projects, args.boards, args.tasks)

    for t in TABLES:
        print(f"{t:12} {gen.counts[t]:5}")
    print(f"\nWrote {sum(gen.counts.values())} records to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
