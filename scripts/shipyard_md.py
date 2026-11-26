"""Write Shipyard records as Markdown files (standard library only).

Shared by the data scripts. The format matches the app (see
src-tauri/core/src/record_md.rs): fields in a YAML front-matter block, and one
long-text field per table (a task's notes, a project's or board's
description) as the Markdown body.
"""

import json
import re
from pathlib import Path

FORMAT_VERSION = 2

BODY_FIELDS = {"tasks": "notes", "projects": "description", "boards": "description"}
LEADING_FIELDS = ["id", "title", "name"]

_PLAIN = re.compile(r"^[A-Za-z_][A-Za-z0-9 _./()&,-]*$")
_RESERVED = {"true", "false", "yes", "no", "on", "off", "null", "y", "n", "~"}
_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _needs_escape(char: str) -> bool:
    code = ord(char)
    return code < 0x20 or 0x7F <= code <= 0x9F or code in (0x2028, 0x2029, 0xFEFF)


def _scalar(value) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return json.dumps(value)
    text = str(value)
    if _PLAIN.match(text) and text == text.strip() and text.lower() not in _RESERVED:
        return text
    if any(_needs_escape(c) for c in text):
        # JSON string escapes are valid in YAML double-quoted scalars; ASCII
        # output escapes line breaks and control characters YAML would
        # reject or fold (DEL, C1 controls, NEL, U+2028/U+2029).
        return json.dumps(text, ensure_ascii=True)
    return "'" + text.replace("'", "''") + "'"


def _key(key: str) -> str:
    return key if _KEY.match(key) else _scalar(key)


def _emit(value, indent: str, lines: list) -> None:
    """Appends YAML lines for a mapping or sequence value at `indent`."""
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, (dict, list)) and item:
                lines.append(f"{indent}{_key(key)}:")
                # Sequences sit at the key's indent, mappings one level in.
                _emit(item, indent if isinstance(item, list) else indent + "  ", lines)
            else:
                lines.append(f"{indent}{_key(key)}: {_inline(item)}")
    else:
        for item in value:
            if isinstance(item, (dict, list)) and item:
                sub: list = []
                _emit(item, indent + "  ", sub)
                lines.append(f"{indent}- {sub[0].lstrip()}")
                lines.extend(sub[1:])
            else:
                lines.append(f"{indent}- {_inline(item)}")


def _inline(value) -> str:
    if isinstance(value, dict):
        return "{}"
    if isinstance(value, list):
        return "[]"
    return _scalar(value)


def encode(table: str, record: dict) -> str:
    body_key = BODY_FIELDS.get(table)
    body = record.get(body_key) if body_key else None
    if not isinstance(body, str):
        body = None
    fields = {k: v for k, v in record.items() if not (k == body_key and body is not None)}
    ordered = {k: fields[k] for k in LEADING_FIELDS if k in fields}
    ordered.update({k: fields[k] for k in sorted(fields) if k not in ordered})

    lines: list = []
    _emit(ordered, "", lines)
    out = "---\n" + "".join(line + "\n" for line in lines) + "---\n"
    body = (body or "").strip("\n")
    if body:
        out += "\n" + body + "\n"
    return out


def write_record(folder: Path, table: str, record: dict) -> None:
    path = folder / table / f"{record['id']}.md"
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(encode(table, record), encoding="utf-8")
    tmp.replace(path)


def write_marker(folder: Path, created_at: int) -> None:
    marker = folder / "shipyard.json"
    tmp = marker.with_name(".shipyard.json.tmp")
    tmp.write_text(
        json.dumps({"format": "shipyard-folder", "version": FORMAT_VERSION, "createdAt": created_at},
                   indent=2),
        encoding="utf-8",
    )
    tmp.replace(marker)
