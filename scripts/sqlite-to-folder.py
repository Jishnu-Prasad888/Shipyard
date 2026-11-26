#!/usr/bin/env python3
"""Copy data from an old Shipyard SQLite database into a Shipyard folder.

Earlier versions stored everything in ``shipyard.db``. This script reads that
database (it is never modified) and writes one Markdown file per record (YAML
front matter, notes as the body) into a folder you can then open in Shipyard.
Notes from old databases are HTML; they are kept as HTML inside the Markdown
body, which the editor reads.

Usage:
    python3 scripts/sqlite-to-folder.py [path/to/shipyard.db] <output-folder>

When the database path is omitted, the default location for this OS is used:
    Linux    ~/.local/share/com.shipyard.app/shipyard.db
    macOS    ~/Library/Application Support/com.shipyard.app/shipyard.db
    Windows  %APPDATA%\\com.shipyard.app\\shipyard.db

Only the Python standard library is needed.
"""

import json
import os
import re
import sqlite3
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shipyard_md import write_marker, write_record  # noqa: E402

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
JSON_FIELDS = {
    "tags",
    "subtasks",
    "status",
    "connectedTaskIds",
    "connectedColumnIds",
    "boardIds",
    "points",
}
SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,200}$")


def default_db_path() -> Path:
    home = Path.home()
    if sys.platform == "darwin":
        base = home / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", home / ".local" / "share"))
    return base / "com.shipyard.app" / "shipyard.db"


def decode(field: str, value):
    if field in JSON_FIELDS and isinstance(value, str) and value.strip()[:1] in ("[", "{"):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value



def main(argv) -> int:
    if len(argv) == 2:
        db_path, out = default_db_path(), Path(argv[1])
    elif len(argv) == 3:
        db_path, out = Path(argv[1]), Path(argv[2])
    else:
        print(__doc__)
        return 2

    if not db_path.is_file():
        print(f"Database not found: {db_path}")
        return 1

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    existing = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "projects" not in existing and "docks" in existing:
        print("This database uses the pre-1.0 layout. Open it once with Shipyard 1.0.1 to")
        print("upgrade it, then run this script again.")
        return 1

    if not (out / "shipyard.json").exists():
        write_marker(out, int(time.time() * 1000))

    total = 0
    for table in TABLES:
        (out / table).mkdir(parents=True, exist_ok=True)
        if table not in existing:
            continue
        count = skipped = 0
        for row in conn.execute(f'SELECT * FROM "{table}"'):
            record = {key: decode(key, row[key]) for key in row.keys()}
            record_id = str(record.get("id") or "")
            if not SAFE_ID.match(record_id) or record_id.startswith("."):
                skipped += 1
                continue
            record["id"] = record_id
            write_record(out, table, record)
            count += 1
        total += count
        note = f" ({skipped} skipped: unsafe id)" if skipped else ""
        print(f"{table:12} {count:6} records{note}")

    (out / ".shipyard").mkdir(exist_ok=True)
    print(f"\nWrote {total} records to {out.resolve()}")
    print("Open this folder in Shipyard to continue where you left off.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
