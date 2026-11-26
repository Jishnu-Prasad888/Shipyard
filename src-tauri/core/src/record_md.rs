//! Records as Markdown files.
//!
//! Each record is a Markdown file whose fields sit in a YAML front-matter
//! block. One long-text field per table (a task's notes, a project's or
//! board's description) is the Markdown body instead, so the file reads like
//! a normal note:
//!
//! ```text
//! ---
//! id: task-1
//! title: Write the docs
//! columnId: column-1
//! order: 0
//! tags:
//! - name: docs
//!   color: '#2563eb'
//! ---
//!
//! Notes in **Markdown**.
//! ```

use serde_json::{Map, Value};

use crate::{Error, Result};

/// The file extension of record files.
pub const EXTENSION: &str = "md";

const FENCE: &str = "---";

/// The field stored as the Markdown body for a table, if any.
pub fn body_field(table: &str) -> Option<&'static str> {
    match table {
        "tasks" => Some("notes"),
        "projects" | "boards" => Some("description"),
        _ => None,
    }
}

/// Fields listed first in the front matter, in this order; the rest follow
/// alphabetically.
const LEADING_FIELDS: &[&str] = &["id", "title", "name"];

/// Serializes a record (a JSON object) to Markdown with YAML front matter.
pub fn encode(table: &str, record: &Value) -> Result<String> {
    let object = record
        .as_object()
        .ok_or_else(|| Error::InvalidInput("a record must be an object".into()))?;
    let body_key = body_field(table);
    // The body is only used for text; anything else stays in the front matter.
    let body = body_key
        .and_then(|key| object.get(key))
        .and_then(Value::as_str)
        .unwrap_or("");

    let mut keys: Vec<&String> = object
        .keys()
        .filter(|key| {
            Some(key.as_str()) != body_key || !object.get(*key).is_some_and(Value::is_string)
        })
        .collect();
    keys.sort_by_key(|key| {
        let rank = LEADING_FIELDS
            .iter()
            .position(|leading| leading == key)
            .unwrap_or(LEADING_FIELDS.len());
        (rank, key.as_str())
    });

    let mut front = serde_norway::Mapping::new();
    for key in keys {
        let value = serde_norway::to_value(&object[key])
            .map_err(|e| Error::InvalidInput(format!("cannot write field {key}: {e}")))?;
        front.insert(serde_norway::Value::String(key.clone()), value);
    }
    let yaml = if front.is_empty() {
        String::new()
    } else {
        serde_norway::to_string(&front)
            .map_err(|e| Error::InvalidInput(format!("cannot write record: {e}")))?
    };

    let mut out = String::with_capacity(yaml.len() + body.len() + 16);
    out.push_str(FENCE);
    out.push('\n');
    out.push_str(&yaml);
    out.push_str(FENCE);
    out.push('\n');
    let body = body.trim_matches('\n');
    if !body.is_empty() {
        out.push('\n');
        out.push_str(body);
        out.push('\n');
    }
    Ok(out)
}

/// Parses a record file. Returns `None` if it isn't a valid record (no front
/// matter, or front matter that isn't a YAML mapping).
pub fn decode(table: &str, text: &str) -> Option<Value> {
    // Files edited on Windows may use CRLF line endings or start with a BOM.
    let text = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let rest = text.strip_prefix("---\n")?;
    let (yaml, body) = if let Some(rest) = rest.strip_prefix("---\n") {
        ("", rest)
    } else if rest == "---" {
        ("", "")
    } else {
        let end = rest
            .find("\n---\n")
            .map(|index| (index, index + 5))
            .or_else(|| {
                rest.strip_suffix("\n---")
                    .map(|front| (front.len(), rest.len()))
            })?;
        (&rest[..end.0], &rest[end.1..])
    };

    let mut object = if yaml.trim().is_empty() {
        Map::new()
    } else {
        match serde_norway::from_str::<Value>(yaml).ok()? {
            Value::Object(object) => object,
            Value::Null => Map::new(),
            _ => return None,
        }
    };
    if let Some(key) = body_field(table) {
        let body = body.trim_matches('\n');
        // A body always wins; an empty body keeps a non-text front-matter value.
        if !body.is_empty() || !object.contains_key(key) {
            object.insert(key.to_string(), Value::String(body.to_string()));
        }
    }
    Some(Value::Object(object))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn round_trip(table: &str, record: Value) -> String {
        let text = encode(table, &record).unwrap();
        assert_eq!(decode(table, &text).unwrap(), record, "file was:\n{text}");
        // Writing the parsed record again gives the same file.
        assert_eq!(encode(table, &decode(table, &text).unwrap()).unwrap(), text);
        text
    }

    #[test]
    fn task_notes_become_the_body() {
        let text = round_trip(
            "tasks",
            json!({
                "id": "t1",
                "title": "Write docs",
                "columnId": "c1",
                "order": 3,
                "deadline": 1796285623595_i64,
                "status": {"name": "Done", "color": "#22c55e"},
                "tags": [{"name": "docs", "color": "#2563eb"}],
                "connectedTaskIds": [],
                "notes": "Intro **bold**\n\n- [ ] one\n- [x] two\n\n---\n\nAfter a rule"
            }),
        );
        assert!(
            text.starts_with("---\nid: t1\ntitle: Write docs\n"),
            "{text}"
        );
        assert!(text.contains("\n---\n\nIntro **bold**"), "{text}");
        assert!(!text.contains("notes:"), "{text}");
    }

    #[test]
    fn tricky_values_survive() {
        round_trip(
            "tasks",
            json!({
                "id": "t2",
                "title": "yes",
                "description": "line one\nline two\n---\nnot a fence",
                "color": "#ff0000",
                "code": "0123",
                "flag": "true",
                "nothing": null,
                "empty": "",
                "ratio": 0.25,
                "negative": -4,
                "colon": "a: b # c",
                "quote": "it's \"quoted\"",
                "unicode": "naïve ✓ 日本",
                "notes": ""
            }),
        );
    }

    #[test]
    fn tables_without_a_body_keep_everything_in_front_matter() {
        let text = round_trip(
            "columns",
            json!({"id": "c1", "name": "Done", "boardId": "b1", "order": 2, "notes": "kept"}),
        );
        assert!(text.contains("notes: kept"), "{text}");
        assert!(text.ends_with("---\n"), "{text}");
    }

    #[test]
    fn project_description_is_the_body_and_non_text_values_stay_put() {
        let text = round_trip(
            "projects",
            json!({"id": "p1", "name": "API", "description": "What it is.", "boardIds": ["b1"]}),
        );
        assert!(text.ends_with("---\n\nWhat it is.\n"), "{text}");
        round_trip(
            "projects",
            json!({"id": "p2", "name": "X", "description": null}),
        );
    }

    #[test]
    fn reads_hand_edited_files() {
        let edited =
            "\u{feff}---\r\nid: t3\r\ntitle: From Windows\r\norder: 1\r\n---\r\n\r\nSome notes\r\n";
        let value = decode("tasks", edited).unwrap();
        assert_eq!(value["title"], "From Windows");
        assert_eq!(value["order"], 1);
        assert_eq!(value["notes"], "Some notes");

        assert_eq!(decode("tasks", "---\n---\n").unwrap(), json!({"notes": ""}));
        assert_eq!(decode("tasks", "---\ntitle: T\n---").unwrap()["title"], "T");
        assert!(decode("tasks", "no front matter").is_none());
        assert!(decode("tasks", "---\n- a list\n---\n").is_none());
        assert!(decode("tasks", "---\ntitle: [unclosed\n---\n").is_none());
    }
}
