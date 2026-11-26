//! Folder-backed record store.
//!
//! Every record lives in its own Markdown file: fields in YAML front matter,
//! and a task's notes (or a project's or board's description) as the body.
//! See [`crate::record_md`].
//!
//! ```text
//! <folder>/
//!   shipyard.json              folder marker + format version
//!   workspaces/<id>.md
//!   projects/<id>.md
//!   boards/<id>.md
//!   columns/<id>.md
//!   tasks/<id>.md
//!   subtasks/<id>.md
//!   statuses/<id>.md
//!   connections/<id>.md
//!   tags/<id>.md
//!   assets/<uuid>.<ext>        images added to notes
//!   .shipyard/sync-queue.jsonl pending changes for optional sync
//! ```
//!
//! There is no database: the files are the source of truth and are re-read
//! whenever they change on disk, so a folder can be copied, backed up, put
//! under version control, or opened from a network share.

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::record_md;
use crate::{Error, Result};

pub const FORMAT: &str = "shipyard-folder";
/// Version 2 stores records as Markdown; version 1 used JSON files.
pub const FORMAT_VERSION: u64 = 2;
pub const MARKER_FILE: &str = "shipyard.json";
const META_DIR: &str = ".shipyard";
const SYNC_QUEUE_FILE: &str = "sync-queue.jsonl";
pub const ASSETS_DIR: &str = "assets";
/// Largest image accepted, before base64 encoding.
pub const MAX_ASSET_BYTES: usize = 20 * 1024 * 1024;
/// Image types that can be stored. SVG is excluded: it can carry scripts.
const ASSET_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp"];

/// Tables stored as one-file-per-record directories.
pub const TABLES: &[&str] = &[
    "workspaces",
    "projects",
    "boards",
    "columns",
    "tasks",
    "subtasks",
    "statuses",
    "connections",
    "tags",
];

/// Virtual table exposing pending sync operations.
pub const SYNC_QUEUE: &str = "sync_queue";

/// Fields whose values are structured JSON. Older callers sometimes send
/// these as JSON-encoded strings; they are decoded so files stay readable.
const JSON_FIELDS: &[&str] = &[
    "tags",
    "subtasks",
    "status",
    "connectedTaskIds",
    "connectedColumnIds",
    "boardIds",
    "points",
];

fn has_created_at(table: &str) -> bool {
    !matches!(table, "connections")
}

fn has_updated_at(table: &str) -> bool {
    !matches!(table, "workspaces" | "subtasks" | "tags" | "connections")
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Record IDs become file names, so only a safe character set is allowed.
pub fn validate_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 200
        && !id.starts_with('.')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if ok {
        Ok(())
    } else {
        Err(Error::InvalidInput(format!("invalid record id: {id:?}")))
    }
}

/// Asset names are `<id>.<ext>` with an allowed image extension.
pub fn validate_asset_name(name: &str) -> Result<()> {
    // Exactly one dot: `<id>.<ext>`, where the id itself has no dots.
    let valid = name.split_once('.').is_some_and(|(stem, ext)| {
        validate_id(stem).is_ok() && ASSET_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str())
    });
    if valid {
        Ok(())
    } else {
        Err(Error::InvalidInput(format!("invalid asset name: {name:?}")))
    }
}

fn validate_table(table: &str) -> Result<()> {
    if TABLES.contains(&table) {
        Ok(())
    } else {
        Err(Error::InvalidInput(format!("unknown table: {table:?}")))
    }
}

struct CachedFile {
    modified: Option<SystemTime>,
    len: u64,
    value: Value,
}

pub struct FileStore {
    root: PathBuf,
    /// Serialises writes from this process.
    write_lock: Mutex<()>,
    /// Parsed files keyed by path, invalidated by mtime/size.
    cache: Mutex<HashMap<PathBuf, CachedFile>>,
}

impl FileStore {
    /// Opens a folder, creating the layout if it does not exist yet.
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root)?;
        let root = root.canonicalize().unwrap_or(root);

        let marker = root.join(MARKER_FILE);
        if marker.exists() {
            let raw = fs::read_to_string(&marker)?;
            let meta: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
            let version = meta.get("version").and_then(Value::as_u64).unwrap_or(1);
            if version > FORMAT_VERSION {
                return Err(Error::InvalidInput(format!(
                    "this folder uses format version {version}; update Shipyard to open it"
                )));
            }
            if version < FORMAT_VERSION {
                // JSON records are not read any more. Refuse rather than
                // showing the folder as empty and mixing formats in it.
                if has_json_records(&root) {
                    return Err(Error::InvalidInput(
                        "this folder stores records as JSON files (format version 1), which this \
                         version of Shipyard no longer reads; open or create another folder"
                            .into(),
                    ));
                }
                let mut meta = meta.as_object().cloned().unwrap_or_default();
                meta.insert("format".into(), json!(FORMAT));
                meta.insert("version".into(), json!(FORMAT_VERSION));
                write_atomic(&marker, &serde_json::to_vec_pretty(&Value::Object(meta))?)?;
            }
        } else {
            let meta = json!({
                "format": FORMAT,
                "version": FORMAT_VERSION,
                "createdAt": now_ms(),
            });
            write_atomic(&marker, &serde_json::to_vec_pretty(&meta)?)?;
        }

        for table in TABLES {
            fs::create_dir_all(root.join(table))?;
        }
        fs::create_dir_all(root.join(META_DIR))?;
        fs::create_dir_all(root.join(ASSETS_DIR))?;

        Ok(Self {
            root,
            write_lock: Mutex::new(()),
            cache: Mutex::new(HashMap::new()),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// True when a folder already contains a Shipyard marker file.
    pub fn is_store(path: impl AsRef<Path>) -> bool {
        path.as_ref().join(MARKER_FILE).is_file()
    }

    fn record_path(&self, table: &str, id: &str) -> PathBuf {
        self.root
            .join(table)
            .join(format!("{id}.{}", record_md::EXTENSION))
    }

    fn sync_queue_path(&self) -> PathBuf {
        self.root.join(META_DIR).join(SYNC_QUEUE_FILE)
    }

    fn read_file(&self, path: &Path) -> Option<Value> {
        let meta = fs::metadata(path).ok()?;
        let modified = meta.modified().ok();
        let len = meta.len();

        if let Some(cached) = self.cache.lock().unwrap().get(path) {
            if cached.modified == modified && cached.len == len {
                return Some(cached.value.clone());
            }
        }

        let raw = fs::read_to_string(path).ok()?;
        let table = path
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .unwrap_or("");
        let value = match record_md::decode(table, &raw) {
            Some(value) => value,
            None => {
                eprintln!("shipyard: skipping unreadable file {}", path.display());
                return None;
            }
        };
        // Files touched in the last couple of seconds are not cached: some
        // file systems only keep coarse timestamps, so a quick same-size edit
        // could otherwise go unnoticed.
        let settled = modified
            .and_then(|m| SystemTime::now().duration_since(m).ok())
            .is_some_and(|age| age.as_secs() >= 2);
        if !settled {
            return Some(value);
        }
        self.cache.lock().unwrap().insert(
            path.to_path_buf(),
            CachedFile {
                modified,
                len,
                value: value.clone(),
            },
        );
        Some(value)
    }

    fn write_record(&self, table: &str, id: &str, record: &Value) -> Result<()> {
        let path = self.record_path(table, id);
        write_atomic(&path, record_md::encode(table, record)?.as_bytes())?;
        self.cache.lock().unwrap().remove(&path);
        Ok(())
    }

    fn remove_record(&self, table: &str, id: &str) -> Result<bool> {
        let path = self.record_path(table, id);
        self.cache.lock().unwrap().remove(&path);
        match fs::remove_file(&path) {
            Ok(()) => Ok(true),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    // ── Reads ──

    pub fn find_all(&self, table: &str) -> Result<Vec<Value>> {
        if table == SYNC_QUEUE {
            return self.pending_sync_operations();
        }
        validate_table(table)?;
        let dir = self.root.join(table);
        let mut records = Vec::new();
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(records),
            Err(e) => return Err(e.into()),
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_record = path.extension().and_then(|e| e.to_str()) == Some(record_md::EXTENSION);
            let hidden = path
                .file_name()
                .and_then(|n| n.to_str())
                .is_none_or(|n| n.starts_with('.'));
            if !is_record || hidden {
                continue;
            }
            if let Some(mut value) = self.read_file(&path) {
                // The file name is authoritative for the ID.
                if let (Some(obj), Some(stem)) = (
                    value.as_object_mut(),
                    path.file_stem().and_then(|s| s.to_str()),
                ) {
                    obj.insert("id".into(), json!(stem));
                }
                records.push(value);
            }
        }
        records.sort_by(|a, b| {
            let ka = (num(a, "createdAt"), str_field(a, "id"));
            let kb = (num(b, "createdAt"), str_field(b, "id"));
            ka.partial_cmp(&kb).unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(records)
    }

    pub fn find_by_id(&self, table: &str, id: &str) -> Result<Option<Value>> {
        validate_table(table)?;
        if validate_id(id).is_err() {
            return Ok(None);
        }
        let mut value = match self.read_file(&self.record_path(table, id)) {
            Some(v) => v,
            None => return Ok(None),
        };
        if let Some(obj) = value.as_object_mut() {
            obj.insert("id".into(), json!(id));
        }
        Ok(Some(value))
    }

    fn find_where(&self, table: &str, field: &str, value: &str) -> Result<Vec<Value>> {
        Ok(self
            .find_all(table)?
            .into_iter()
            .filter(|r| r.get(field).and_then(Value::as_str) == Some(value))
            .collect())
    }

    // ── Writes ──

    pub fn create(&self, table: &str, data: &Value) -> Result<Value> {
        validate_table(table)?;
        let _guard = self.write_lock.lock().unwrap();
        let input = data.as_object().cloned().unwrap_or_default();

        let id = match input.get("id").and_then(Value::as_str) {
            Some(id) if !id.is_empty() => id.to_string(),
            _ => Uuid::new_v4().to_string(),
        };
        validate_id(&id)?;
        if self.record_path(table, &id).exists() {
            return Err(Error::InvalidInput(format!(
                "a record with id {id:?} already exists in {table}"
            )));
        }

        let now = now_ms();
        let mut record = Map::new();
        record.insert("id".into(), json!(id));
        for (key, value) in input {
            if key != "id" {
                record.insert(key.clone(), normalize_field(&key, value));
            }
        }
        if has_created_at(table) && !record.contains_key("createdAt") {
            record.insert("createdAt".into(), json!(now));
        }
        if has_updated_at(table) {
            if !record.contains_key("updatedAt") {
                record.insert("updatedAt".into(), json!(now));
            }
        } else {
            record.remove("updatedAt");
        }

        let record = Value::Object(record);
        self.write_record(table, &id, &record)?;
        self.enqueue_sync("CREATE", table, &id, data)?;
        Ok(record)
    }

    pub fn update(&self, table: &str, id: &str, data: &Value) -> Result<Value> {
        validate_table(table)?;
        validate_id(id)?;
        let _guard = self.write_lock.lock().unwrap();

        let mut record = match self.find_by_id(table, id)? {
            Some(Value::Object(obj)) => obj,
            _ => return Ok(Value::Null),
        };
        for (key, value) in data.as_object().cloned().unwrap_or_default() {
            if key != "id" {
                record.insert(key.clone(), normalize_field(&key, value));
            }
        }
        if has_updated_at(table) {
            if data.get("updatedAt").is_none() {
                record.insert("updatedAt".into(), json!(now_ms()));
            }
        } else {
            record.remove("updatedAt");
        }

        let record = Value::Object(record);
        self.write_record(table, id, &record)?;
        self.enqueue_sync("UPDATE", table, id, data)?;
        Ok(record)
    }

    pub fn delete(&self, table: &str, id: &str) -> Result<bool> {
        validate_table(table)?;
        validate_id(id)?;
        let _guard = self.write_lock.lock().unwrap();
        self.delete_cascade(table, id)?;
        self.enqueue_sync("DELETE", table, id, &Value::Null)?;
        Ok(true)
    }

    /// Mirrors the relationships between record types: removing a parent
    /// removes its children, and projects of a removed workspace become
    /// unassigned.
    fn delete_cascade(&self, table: &str, id: &str) -> Result<()> {
        match table {
            "workspaces" => {
                for child in self.find_where("workspaces", "parentWorkspaceId", id)? {
                    self.delete_cascade("workspaces", str_field(&child, "id"))?;
                }
                for project in self.find_where("projects", "workspaceId", id)? {
                    let mut project = project;
                    let pid = str_field(&project, "id").to_string();
                    project["workspaceId"] = Value::Null;
                    self.write_record("projects", &pid, &project)?;
                }
            }
            "projects" => {
                for board in self.find_where("boards", "projectId", id)? {
                    self.delete_cascade("boards", str_field(&board, "id"))?;
                }
            }
            "boards" => {
                for child_table in ["columns", "statuses", "connections"] {
                    for child in self.find_where(child_table, "boardId", id)? {
                        self.delete_cascade(child_table, str_field(&child, "id"))?;
                    }
                }
            }
            "columns" => {
                for task in self.find_where("tasks", "columnId", id)? {
                    self.delete_cascade("tasks", str_field(&task, "id"))?;
                }
            }
            "tasks" => {
                for subtask in self.find_where("subtasks", "taskId", id)? {
                    self.delete_cascade("subtasks", str_field(&subtask, "id"))?;
                }
            }
            _ => {}
        }
        self.remove_record(table, id)?;
        Ok(())
    }

    // ── Composite reads ──

    pub fn get_projects_with_workspaces(&self) -> Result<Vec<Value>> {
        let workspaces: HashMap<String, Value> = self
            .find_all("workspaces")?
            .into_iter()
            .map(|w| (str_field(&w, "id").to_string(), w))
            .collect();
        let mut projects = self.find_all("projects")?;
        for project in &mut projects {
            let workspace = project
                .get("workspaceId")
                .and_then(Value::as_str)
                .and_then(|wid| workspaces.get(wid));
            if let Some(obj) = project.as_object_mut() {
                obj.insert(
                    "workspaceName".into(),
                    workspace.map_or(Value::Null, |w| w["name"].clone()),
                );
                obj.insert(
                    "workspaceColor".into(),
                    workspace.map_or(Value::Null, |w| w["color"].clone()),
                );
            }
        }
        projects.sort_by(|a, b| {
            num(b, "updatedAt")
                .partial_cmp(&num(a, "updatedAt"))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(projects)
    }

    pub fn get_board_with_details(&self, board_id: &str) -> Result<Option<Value>> {
        let mut board = match self.find_by_id("boards", board_id)? {
            Some(b) => b,
            None => return Ok(None),
        };

        let mut subtasks_by_task: HashMap<String, Vec<Value>> = HashMap::new();
        for subtask in self.find_all("subtasks")? {
            if let Some(task_id) = subtask.get("taskId").and_then(Value::as_str) {
                subtasks_by_task
                    .entry(task_id.to_string())
                    .or_default()
                    .push(subtask);
            }
        }

        let mut tasks_by_column: HashMap<String, Vec<Value>> = HashMap::new();
        for mut task in self.find_all("tasks")? {
            let column_id = match task.get("columnId").and_then(Value::as_str) {
                Some(c) => c.to_string(),
                None => continue,
            };
            let task_id = str_field(&task, "id").to_string();
            let subtasks = subtasks_by_task.remove(&task_id).unwrap_or_default();
            task["subtasks"] = json!(subtasks);
            tasks_by_column.entry(column_id).or_default().push(task);
        }

        let mut columns = self.find_where("columns", "boardId", board_id)?;
        sort_by_order(&mut columns);
        for column in &mut columns {
            let column_id = str_field(column, "id").to_string();
            let mut tasks = tasks_by_column.remove(&column_id).unwrap_or_default();
            sort_by_order(&mut tasks);
            column["tasks"] = json!(tasks);
        }

        let connections = self.find_where("connections", "boardId", board_id)?;
        board["columns"] = json!(columns);
        board["connections"] = json!(connections);
        Ok(Some(board))
    }

    // ── Sync queue ──

    fn enqueue_sync(
        &self,
        operation: &str,
        table: &str,
        record_id: &str,
        data: &Value,
    ) -> Result<()> {
        let entry = json!({
            "id": Uuid::new_v4().to_string(),
            "operation": operation,
            "table": table,
            "recordId": record_id,
            "data": if data.is_null() { Value::Null } else { data.clone() },
            "timestamp": now_ms(),
            "synced": 0,
        });
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.sync_queue_path())?;
        writeln!(file, "{}", serde_json::to_string(&entry)?)?;
        Ok(())
    }

    pub fn pending_sync_operations(&self) -> Result<Vec<Value>> {
        let file = match fs::File::open(self.sync_queue_path()) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.into()),
        };
        Ok(BufReader::new(file)
            .lines()
            .map_while(|l| l.ok())
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str::<Value>(&l).ok())
            .collect())
    }

    /// Drops synced operations from the queue.
    pub fn mark_as_synced(&self, ids: &[String]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let _guard = self.write_lock.lock().unwrap();
        let remaining: Vec<String> = self
            .pending_sync_operations()?
            .into_iter()
            .filter(|op| !ids.iter().any(|id| Some(id.as_str()) == op["id"].as_str()))
            .map(|op| op.to_string())
            .collect();
        let mut body = remaining.join("\n");
        if !body.is_empty() {
            body.push('\n');
        }
        write_atomic(&self.sync_queue_path(), body.as_bytes())?;
        Ok(())
    }

    // ── Assets (images) ──

    /// Stores an image and returns its file name (`<uuid>.<ext>`), which is
    /// what notes reference. Files are never overwritten.
    pub fn save_asset(&self, data_base64: &str, ext: &str) -> Result<String> {
        use base64::Engine;
        let ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
        if !ASSET_EXTENSIONS.contains(&ext.as_str()) {
            return Err(Error::InvalidInput(format!(
                "unsupported image type {ext:?}; use PNG, JPEG, GIF, WebP or BMP"
            )));
        }
        // Accept a data URL as well as bare base64.
        let encoded = data_base64
            .split_once(";base64,")
            .map_or(data_base64, |(_, rest)| rest)
            .trim();
        if encoded.len() > MAX_ASSET_BYTES / 3 * 4 + 4 {
            return Err(Error::InvalidInput("image is larger than 20 MB".into()));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|e| Error::InvalidInput(format!("invalid image data: {e}")))?;
        if bytes.is_empty() {
            return Err(Error::InvalidInput("image is empty".into()));
        }
        if bytes.len() > MAX_ASSET_BYTES {
            return Err(Error::InvalidInput("image is larger than 20 MB".into()));
        }
        let name = format!("{}.{ext}", Uuid::new_v4().simple());
        write_atomic(&self.root.join(ASSETS_DIR).join(&name), &bytes)?;
        Ok(name)
    }

    /// Reads a stored image as base64, or `None` if it does not exist.
    pub fn read_asset(&self, name: &str) -> Result<Option<String>> {
        use base64::Engine;
        validate_asset_name(name)?;
        match fs::read(self.root.join(ASSETS_DIR).join(name)) {
            Ok(bytes) => Ok(Some(
                base64::engine::general_purpose::STANDARD.encode(bytes),
            )),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Removes every record (used for demo seeding).
    pub fn clear(&self) -> Result<()> {
        let _guard = self.write_lock.lock().unwrap();
        for table in TABLES {
            let dir = self.root.join(table);
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    if entry.path().extension().and_then(|e| e.to_str())
                        == Some(record_md::EXTENSION)
                    {
                        fs::remove_file(entry.path())?;
                    }
                }
            }
        }
        let _ = fs::remove_file(self.sync_queue_path());
        self.cache.lock().unwrap().clear();
        Ok(())
    }
}

// ── Helpers ──

/// True when any table folder still holds format-1 JSON records.
fn has_json_records(root: &Path) -> bool {
    TABLES.iter().any(|table| {
        fs::read_dir(root.join(table)).is_ok_and(|entries| {
            entries
                .flatten()
                .any(|entry| entry.path().extension().and_then(|e| e.to_str()) == Some("json"))
        })
    })
}

fn str_field<'a>(value: &'a Value, field: &str) -> &'a str {
    value.get(field).and_then(Value::as_str).unwrap_or("")
}

fn num(value: &Value, field: &str) -> f64 {
    match value.get(field) {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn sort_by_order(records: &mut [Value]) {
    records.sort_by(|a, b| {
        (num(a, "order"), num(a, "createdAt"))
            .partial_cmp(&(num(b, "order"), num(b, "createdAt")))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
}

fn normalize_field(key: &str, value: Value) -> Value {
    if JSON_FIELDS.contains(&key) {
        if let Value::String(s) = &value {
            let trimmed = s.trim_start();
            if trimmed.starts_with('[') || trimmed.starts_with('{') {
                if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                    return parsed;
                }
            }
        }
    }
    value
}

/// Writes through a temporary file and renames it into place so readers never
/// see a half-written record.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("record");
    let tmp = dir.join(format!(".{file_name}.{}.tmp", Uuid::new_v4().simple()));
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all().ok();
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (FileStore, PathBuf) {
        let dir = std::env::temp_dir().join(format!("shipyard-store-{}", Uuid::new_v4()));
        (FileStore::open(&dir).unwrap(), dir)
    }

    #[test]
    fn creates_folder_layout() {
        let (store, dir) = temp_store();
        assert!(FileStore::is_store(&dir));
        for table in TABLES {
            assert!(store.root().join(table).is_dir());
        }
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn crud_round_trip_uses_markdown_files() {
        let (store, dir) = temp_store();
        let created = store
            .create(
                "tasks",
                &json!({"id": "t1", "title": "Write docs", "columnId": "c1", "tags": "[{\"name\":\"docs\"}]"}),
            )
            .unwrap();
        assert_eq!(created["tags"][0]["name"], "docs");
        assert!(created["createdAt"].is_number());

        let on_disk = fs::read_to_string(dir.join("tasks/t1.md")).unwrap();
        assert!(
            on_disk.starts_with("---\nid: t1\ntitle: Write docs\n"),
            "{on_disk}"
        );
        assert!(on_disk.contains("tags:\n- name: docs\n"), "{on_disk}");

        let updated = store
            .update("tasks", "t1", &json!({"title": "Edited"}))
            .unwrap();
        assert_eq!(updated["title"], "Edited");
        assert_eq!(updated["columnId"], "c1");

        // Edits made directly to the file are picked up, notes included.
        fs::write(
            dir.join("tasks/t1.md"),
            "---\ntitle: Changed outside the app\ncolumnId: c1\n---\n\n- [ ] new note\n",
        )
        .unwrap();
        let reread = store.find_by_id("tasks", "t1").unwrap().unwrap();
        assert_eq!(reread["title"], "Changed outside the app");
        assert_eq!(reread["notes"], "- [ ] new note");
        assert_eq!(reread["id"], "t1");

        assert!(store
            .create("tasks", &json!({"id": "t1", "title": "dup"}))
            .is_err());
        assert_eq!(
            store.update("tasks", "missing", &json!({})).unwrap(),
            Value::Null
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_unsafe_ids_and_tables() {
        let (store, dir) = temp_store();
        assert!(store.create("tasks", &json!({"id": "../escape"})).is_err());
        assert!(store.create("tasks", &json!({"id": ".hidden"})).is_err());
        assert!(store.find_all("../etc").is_err());
        assert!(store.find_by_id("tasks", "../../x").unwrap().is_none());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn deletes_cascade_like_the_old_schema() {
        let (store, dir) = temp_store();
        store
            .create("workspaces", &json!({"id": "w1", "name": "W"}))
            .unwrap();
        store
            .create(
                "workspaces",
                &json!({"id": "w2", "name": "Child", "parentWorkspaceId": "w1"}),
            )
            .unwrap();
        store
            .create(
                "projects",
                &json!({"id": "p1", "name": "P", "workspaceId": "w2"}),
            )
            .unwrap();
        store
            .create(
                "boards",
                &json!({"id": "b1", "name": "B", "projectId": "p1"}),
            )
            .unwrap();
        store
            .create(
                "columns",
                &json!({"id": "c1", "name": "C", "boardId": "b1"}),
            )
            .unwrap();
        store
            .create(
                "tasks",
                &json!({"id": "t1", "title": "T", "columnId": "c1", "boardId": "b1"}),
            )
            .unwrap();
        store
            .create(
                "subtasks",
                &json!({"id": "s1", "title": "S", "taskId": "t1"}),
            )
            .unwrap();

        store.delete("workspaces", "w1").unwrap();
        assert!(store.find_all("workspaces").unwrap().is_empty());
        let project = store.find_by_id("projects", "p1").unwrap().unwrap();
        assert!(project["workspaceId"].is_null());

        store.delete("projects", "p1").unwrap();
        for table in ["boards", "columns", "tasks", "subtasks"] {
            assert!(
                store.find_all(table).unwrap().is_empty(),
                "{table} not empty"
            );
        }
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn board_details_are_assembled_in_order() {
        let (store, dir) = temp_store();
        store
            .create(
                "boards",
                &json!({"id": "b1", "name": "B", "projectId": "p"}),
            )
            .unwrap();
        store
            .create(
                "columns",
                &json!({"id": "c2", "name": "Done", "boardId": "b1", "order": 1}),
            )
            .unwrap();
        store
            .create(
                "columns",
                &json!({"id": "c1", "name": "To Do", "boardId": "b1", "order": 0}),
            )
            .unwrap();
        store
            .create(
                "tasks",
                &json!({"id": "t2", "title": "B", "columnId": "c1", "order": 1}),
            )
            .unwrap();
        store
            .create(
                "tasks",
                &json!({"id": "t1", "title": "A", "columnId": "c1", "order": 0}),
            )
            .unwrap();
        store
            .create(
                "subtasks",
                &json!({"id": "s1", "title": "x", "taskId": "t1"}),
            )
            .unwrap();

        let board = store.get_board_with_details("b1").unwrap().unwrap();
        assert_eq!(board["columns"][0]["id"], "c1");
        assert_eq!(board["columns"][0]["tasks"][0]["id"], "t1");
        assert_eq!(board["columns"][0]["tasks"][0]["subtasks"][0]["id"], "s1");
        assert_eq!(board["columns"][1]["tasks"].as_array().unwrap().len(), 0);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn assets_round_trip_and_reject_bad_input() {
        use base64::Engine;
        let (store, dir) = temp_store();
        let png = [0x89u8, b'P', b'N', b'G', 1, 2, 3];
        let encoded = base64::engine::general_purpose::STANDARD.encode(png);

        let name = store.save_asset(&encoded, "PNG").unwrap();
        assert!(name.ends_with(".png"));
        assert!(dir.join("assets").join(&name).is_file());
        assert_eq!(store.read_asset(&name).unwrap().unwrap(), encoded);

        // Data URLs are accepted too.
        let from_url = store
            .save_asset(&format!("data:image/png;base64,{encoded}"), "png")
            .unwrap();
        assert_ne!(from_url, name);

        assert!(store.save_asset(&encoded, "svg").is_err());
        assert!(store.save_asset("not base64!", "png").is_err());
        assert!(store.save_asset("", "png").is_err());
        assert!(store.read_asset("../shipyard.json").is_err());
        assert!(store.read_asset("x.exe").is_err());
        assert!(store.read_asset("a.b.png").is_err());
        assert!(store.read_asset("missing.png").unwrap().is_none());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn sync_queue_records_and_clears_operations() {
        let (store, dir) = temp_store();
        store
            .create("tags", &json!({"id": "tag1", "name": "x"}))
            .unwrap();
        store.update("tags", "tag1", &json!({"name": "y"})).unwrap();
        let pending = store.find_all(SYNC_QUEUE).unwrap();
        assert_eq!(pending.len(), 2);
        assert_eq!(pending[0]["operation"], "CREATE");

        let first = pending[0]["id"].as_str().unwrap().to_string();
        store.mark_as_synced(&[first]).unwrap();
        let pending = store.find_all(SYNC_QUEUE).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0]["operation"], "UPDATE");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn json_folders_are_refused_and_empty_old_folders_upgraded() {
        let dir = std::env::temp_dir().join(format!("shipyard-v1-{}", Uuid::new_v4()));
        fs::create_dir_all(dir.join("tasks")).unwrap();
        fs::write(
            dir.join(MARKER_FILE),
            r#"{"format":"shipyard-folder","version":1}"#,
        )
        .unwrap();
        fs::write(dir.join("tasks/t1.json"), r#"{"title":"old"}"#).unwrap();
        let error = FileStore::open(&dir)
            .err()
            .expect("JSON folder must be refused");
        assert!(error.to_string().contains("JSON"), "{error}");

        // Without JSON records the folder is simply upgraded.
        fs::remove_file(dir.join("tasks/t1.json")).unwrap();
        FileStore::open(&dir).unwrap();
        let marker: Value =
            serde_json::from_str(&fs::read_to_string(dir.join(MARKER_FILE)).unwrap()).unwrap();
        assert_eq!(marker["version"], FORMAT_VERSION);
        fs::remove_dir_all(dir).ok();
    }
}
