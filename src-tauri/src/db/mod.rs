use rusqlite::{params, Connection, Result, Transaction};
use serde_json::{json, Value};
use std::sync::Mutex;
use uuid::Uuid;

mod dev_seed;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn initialize(&self) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let current_version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if current_version < SCHEMA_VERSION && raw_table_exists(&conn, "folders")? {
            backup_legacy_database(&conn)?;
        }

        let tx = conn.transaction()?;
        let version: i64 = tx.query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if version > SCHEMA_VERSION {
            return Err(rusqlite::Error::InvalidQuery);
        }
        if version < 1 {
            migrate_to_v1(&tx)?;
            tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }

        tx.execute_batch(SCHEMA)?;
        let settings_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM settings WHERE key = 'app_settings'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if settings_count == 0 {
            let default_settings = default_settings();
            tx.execute(
                "INSERT INTO settings (key, value, updatedAt) VALUES (?1, ?2, ?3)",
                params!["app_settings", default_settings.to_string(), now_ms()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn seed_demo_data(&self, force_reset: bool) -> Result<()> {
        dev_seed::seed_demo_data(self, force_reset)
    }

    // ── Generic CRUD ──

    pub fn find_all(&self, table: &str) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!("SELECT * FROM \"{table}\""))?;
        let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows = stmt.query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in cols.iter().enumerate() {
                let val: Value = row_value_to_json(row, i);
                obj.insert(col.clone(), val);
            }
            Ok(Value::Object(obj))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn find_by_id(&self, table: &str, id: &str) -> Result<Option<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!("SELECT * FROM \"{table}\" WHERE id = ?1"))?;
        let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut rows = stmt.query_map(params![id], |row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in cols.iter().enumerate() {
                obj.insert(col.clone(), row_value_to_json(row, i));
            }
            Ok(Value::Object(obj))
        })?;
        Ok(rows.next().and_then(|r| r.ok()))
    }

    pub fn create(&self, table: &str, data: &Value) -> Result<Value> {
        let conn = self.conn.lock().unwrap();
        let obj = data.as_object().cloned().unwrap_or_default();

        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let now = now_ms();
        let mut record: serde_json::Map<String, Value> = serde_json::Map::new();
        record.insert("id".into(), json!(id));

        let no_created_at = matches!(table, "connections" | "sync_queue" | "settings");
        let no_updated_at = matches!(
            table,
            "workspaces" | "subtasks" | "tags" | "connections" | "sync_queue" | "settings"
        );

        for (key, value) in &obj {
            if key == "id" {
                continue;
            }
            record.insert(key.clone(), serialize_value(value));
        }

        if !no_created_at && !record.contains_key("createdAt") {
            record.insert("createdAt".into(), json!(now));
        }
        if !no_updated_at && !record.contains_key("updatedAt") {
            record.insert("updatedAt".into(), json!(now));
        }
        if no_updated_at {
            record.remove("updatedAt");
        }

        let columns: Vec<String> = record.keys().cloned().collect();
        let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{i}")).collect();
        let quoted_cols: Vec<String> = columns.iter().map(|c| format!("\"{c}\"")).collect();

        let sql = format!(
            "INSERT INTO \"{table}\" ({}) VALUES ({})",
            quoted_cols.join(", "),
            placeholders.join(", ")
        );

        let values: Vec<Option<String>> = columns
            .iter()
            .map(|col| json_to_sql_value(record.get(col).unwrap()))
            .collect();

        conn.execute(
            &sql,
            rusqlite::params_from_iter(values.iter().map(|v| v as &dyn rusqlite::ToSql)),
        )?;

        self.add_to_sync_queue(&conn, "CREATE", table, &id, data)?;

        drop(conn);
        self.find_by_id(table, &id)
            .map(|opt| opt.unwrap_or(json!(null)))
    }

    pub fn update(&self, table: &str, id: &str, data: &Value) -> Result<Value> {
        let conn = self.conn.lock().unwrap();
        let obj = data.as_object().cloned().unwrap_or_default();
        let now = now_ms();
        let no_updated_at = matches!(
            table,
            "workspaces" | "subtasks" | "tags" | "connections" | "sync_queue" | "settings"
        );

        let mut updates: serde_json::Map<String, Value> = serde_json::Map::new();
        for (key, value) in &obj {
            if key == "id" {
                continue;
            }
            updates.insert(key.clone(), serialize_value(value));
        }
        if !no_updated_at && !updates.contains_key("updatedAt") {
            updates.insert("updatedAt".into(), json!(now));
        }
        if no_updated_at {
            updates.remove("updatedAt");
        }

        let set_clauses: Vec<String> = updates.keys().map(|k| format!("\"{k}\" = ?")).collect();
        let mut values: Vec<Option<String>> = updates.values().map(json_to_sql_value).collect();
        values.push(Some(id.to_string()));

        let sql = format!(
            "UPDATE \"{table}\" SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        conn.execute(
            &sql,
            rusqlite::params_from_iter(values.iter().map(|v| v as &dyn rusqlite::ToSql)),
        )?;

        self.add_to_sync_queue(&conn, "UPDATE", table, id, data)?;

        drop(conn);
        self.find_by_id(table, id)
            .map(|opt| opt.unwrap_or(json!(null)))
    }

    pub fn delete(&self, table: &str, id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            &format!("DELETE FROM \"{table}\" WHERE id = ?1"),
            params![id],
        )?;
        self.add_to_sync_queue(&conn, "DELETE", table, id, &json!(null))?;
        Ok(true)
    }

    // ── Settings ──

    pub fn get_settings(&self) -> Result<Value> {
        let conn = self.conn.lock().unwrap();
        let result: rusqlite::Result<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = 'app_settings'",
            [],
            |r| r.get(0),
        );
        match result {
            Ok(val) => Ok(serde_json::from_str(&val).unwrap_or(default_settings())),
            Err(_) => Ok(default_settings()),
        }
    }

    pub fn save_settings(&self, settings: &Value) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE settings SET value = ?1, updatedAt = ?2 WHERE key = 'app_settings'",
            params![settings.to_string(), now_ms()],
        )?;
        Ok(())
    }

    // ── Custom queries ──

    pub fn get_projects_with_workspaces(&self) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.*, w.name as workspaceName, w.color as workspaceColor
             FROM projects p
             LEFT JOIN workspaces w ON p.workspaceId = w.id
             ORDER BY p.updatedAt DESC",
        )?;
        let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows = stmt.query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in cols.iter().enumerate() {
                obj.insert(col.clone(), row_value_to_json(row, i));
            }
            Ok(Value::Object(obj))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_board_with_details(&self, board_id: &str) -> Result<Option<Value>> {
        let conn = self.conn.lock().unwrap();

        let board_opt: Option<Value> = {
            let mut stmt = conn.prepare("SELECT * FROM boards WHERE id = ?1")?;
            let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let mut rows = stmt.query_map(params![board_id], |row| {
                let mut obj = serde_json::Map::new();
                for (i, col) in cols.iter().enumerate() {
                    obj.insert(col.clone(), row_value_to_json(row, i));
                }
                Ok(Value::Object(obj))
            })?;
            rows.next().and_then(|r| r.ok())
        };

        let mut board = match board_opt {
            None => return Ok(None),
            Some(b) => b,
        };

        let mut columns: Vec<Value> = {
            let mut stmt =
                conn.prepare("SELECT * FROM columns WHERE boardId = ?1 ORDER BY \"order\" ASC")?;
            let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let mapped_rows = stmt.query_map(params![board_id], |row| {
                let mut obj = serde_json::Map::new();
                for (i, col) in cols.iter().enumerate() {
                    obj.insert(col.clone(), row_value_to_json(row, i));
                }
                Ok(Value::Object(obj))
            })?;
            mapped_rows.filter_map(|r| r.ok()).collect()
        };

        for column in &mut columns {
            let column_id = column["id"].as_str().unwrap_or("").to_string();
            let mut tasks: Vec<Value> = {
                let mut stmt =
                    conn.prepare("SELECT * FROM tasks WHERE columnId = ?1 ORDER BY \"order\" ASC")?;
                let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
                let mapped_rows = stmt.query_map(params![column_id], |row| {
                    let mut obj = serde_json::Map::new();
                    for (i, col) in cols.iter().enumerate() {
                        obj.insert(col.clone(), row_value_to_json(row, i));
                    }
                    Ok(Value::Object(obj))
                })?;
                mapped_rows.filter_map(|r| r.ok()).collect()
            };

            for task in &mut tasks {
                let task_id = task["id"].as_str().unwrap_or("").to_string();
                let subtasks: Vec<Value> = {
                    let mut stmt = conn.prepare(
                        "SELECT * FROM subtasks WHERE taskId = ?1 ORDER BY createdAt ASC",
                    )?;
                    let cols: Vec<String> =
                        stmt.column_names().iter().map(|s| s.to_string()).collect();
                    let mapped_rows = stmt.query_map(params![task_id], |row| {
                        let mut obj = serde_json::Map::new();
                        for (i, col) in cols.iter().enumerate() {
                            obj.insert(col.clone(), row_value_to_json(row, i));
                        }
                        Ok(Value::Object(obj))
                    })?;
                    mapped_rows.filter_map(|r| r.ok()).collect()
                };
                if let Some(obj) = task.as_object_mut() {
                    obj.insert("subtasks".into(), json!(subtasks));
                    // Parse JSON string fields
                    for field in &["tags", "connectedTaskIds", "connectedColumnIds"] {
                        if let Some(Value::String(s)) = obj.get(*field) {
                            if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                                obj.insert(field.to_string(), parsed);
                            }
                        }
                    }
                }
            }

            if let Some(column_obj) = column.as_object_mut() {
                column_obj.insert("tasks".into(), json!(tasks));
            }
        }

        // Connections
        let connections: Vec<Value> = {
            let mut stmt = conn.prepare("SELECT * FROM connections WHERE boardId = ?1")?;
            let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let mut conns: Vec<Value> = stmt
                .query_map(params![board_id], |row| {
                    let mut obj = serde_json::Map::new();
                    for (i, col) in cols.iter().enumerate() {
                        obj.insert(col.clone(), row_value_to_json(row, i));
                    }
                    Ok(Value::Object(obj))
                })?
                .filter_map(|r| r.ok())
                .collect();

            for conn_val in &mut conns {
                if let Some(obj) = conn_val.as_object_mut() {
                    if let Some(Value::String(s)) = obj.get("points") {
                        if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                            obj.insert("points".into(), parsed);
                        }
                    }
                }
            }
            conns
        };

        if let Some(obj) = board.as_object_mut() {
            obj.insert("columns".into(), json!(columns));
            obj.insert("connections".into(), json!(connections));
        }

        Ok(Some(board))
    }

    // ── Sync Queue ──

    fn add_to_sync_queue(
        &self,
        conn: &Connection,
        operation: &str,
        table: &str,
        record_id: &str,
        data: &Value,
    ) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let data_str = if data.is_null() {
            None
        } else {
            Some(data.to_string())
        };
        conn.execute(
            r#"INSERT INTO sync_queue (id, operation, "table", recordId, data, timestamp, synced)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)"#,
            params![id, operation, table, record_id, data_str, now_ms()],
        )?;
        Ok(())
    }

    pub fn get_unsynced_records(&self) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT * FROM sync_queue WHERE synced = 0 ORDER BY timestamp ASC")?;
        let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows = stmt.query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in cols.iter().enumerate() {
                obj.insert(col.clone(), row_value_to_json(row, i));
            }
            Ok(Value::Object(obj))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn mark_as_synced(&self, ids: &[String]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap();
        let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{i}")).collect();
        let sql = format!(
            "UPDATE sync_queue SET synced = 1 WHERE id IN ({})",
            placeholders.join(", ")
        );
        conn.execute(
            &sql,
            rusqlite::params_from_iter(ids.iter().map(|v| v as &dyn rusqlite::ToSql)),
        )?;
        Ok(())
    }
}

// ── Helpers ──

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn default_settings() -> Value {
    json!({
        "theme": "light",
        "firebaseEnabled": false,
        "syncEnabled": false,
        "minimizeToTray": true,
        "serverUrl": null,
        "serverSyncEnabled": false,
        "lastServerSyncAt": null
    })
}

fn serialize_value(value: &Value) -> Value {
    match value {
        Value::Array(_) | Value::Object(_) => json!(value.to_string()),
        Value::Bool(b) => json!(if *b { 1 } else { 0 }),
        _ => value.clone(),
    }
}

fn row_value_to_json(row: &rusqlite::Row, i: usize) -> Value {
    // Try integer first, then float, then string
    if let Ok(v) = row.get::<_, i64>(i) {
        return json!(v);
    }
    if let Ok(v) = row.get::<_, f64>(i) {
        return json!(v);
    }
    if let Ok(v) = row.get::<_, String>(i) {
        return json!(v);
    }
    Value::Null
}

fn raw_table_exists(conn: &Connection, table: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get(0),
    )
}

fn backup_legacy_database(conn: &Connection) -> Result<()> {
    let database_path: String = conn.query_row(
        "SELECT file FROM pragma_database_list WHERE name = 'main'",
        [],
        |row| row.get(0),
    )?;
    if database_path.is_empty() {
        return Ok(());
    }

    let backup_path = format!("{database_path}.v0-backup-{}.db", now_ms());
    conn.execute("VACUUM INTO ?1", [backup_path])?;
    Ok(())
}

fn json_to_sql_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Null => None,
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => {
            if *b {
                Some("1".into())
            } else {
                Some("0".into())
            }
        }
        other => Some(other.to_string()),
    }
}

const SCHEMA_VERSION: i64 = 1;

fn migrate_to_v1(tx: &Transaction<'_>) -> Result<()> {
    for (legacy, canonical) in [
        ("folders", "workspaces"),
        ("docks", "projects"),
        ("lists", "columns"),
        ("cards", "tasks"),
        ("subcards", "subtasks"),
    ] {
        rename_table(tx, legacy, canonical)?;
    }

    for (table, legacy, canonical) in [
        ("workspaces", "parentId", "parentWorkspaceId"),
        ("projects", "folderId", "workspaceId"),
        ("boards", "dockId", "projectId"),
        ("tasks", "listId", "columnId"),
        ("tasks", "connectedCardIds", "connectedTaskIds"),
        ("tasks", "connectedListIds", "connectedColumnIds"),
        ("tasks", "subCards", "subtasks"),
        ("subtasks", "cardId", "taskId"),
    ] {
        rename_column(tx, table, legacy, canonical)?;
    }

    // Older databases may predate these optional fields.
    add_column_if_missing(tx, "workspaces", "parentWorkspaceId", "TEXT")?;
    for column in ["description", "tags", "color"] {
        add_column_if_missing(tx, "projects", column, "TEXT")?;
    }
    for column in ["description", "color", "tags"] {
        add_column_if_missing(tx, "boards", column, "TEXT")?;
    }

    tx.execute_batch(
        "DROP INDEX IF EXISTS idx_cards_list;
         DROP INDEX IF EXISTS idx_cards_board;
         DROP INDEX IF EXISTS idx_lists_board;
         DROP INDEX IF EXISTS idx_boards_dock;
         DROP INDEX IF EXISTS idx_subcards_card;
         DROP INDEX IF EXISTS idx_docks_folder;",
    )?;
    tx.execute_batch(SCHEMA)?;
    migrate_pending_sync_queue(tx)?;
    tx.execute(
        "UPDATE connections SET type = CASE type
           WHEN 'card-to-card' THEN 'task-to-task'
           WHEN 'list-to-list' THEN 'column-to-column'
           ELSE type END",
        [],
    )?;
    Ok(())
}

fn rename_table(tx: &Transaction<'_>, legacy: &str, canonical: &str) -> Result<()> {
    if table_exists(tx, legacy)? && !table_exists(tx, canonical)? {
        tx.execute_batch(&format!(
            "ALTER TABLE \"{legacy}\" RENAME TO \"{canonical}\""
        ))?;
    }
    Ok(())
}

fn rename_column(tx: &Transaction<'_>, table: &str, legacy: &str, canonical: &str) -> Result<()> {
    if table_exists(tx, table)?
        && column_exists(tx, table, legacy)?
        && !column_exists(tx, table, canonical)?
    {
        tx.execute_batch(&format!(
            "ALTER TABLE \"{table}\" RENAME COLUMN \"{legacy}\" TO \"{canonical}\""
        ))?;
    }
    Ok(())
}

fn add_column_if_missing(
    tx: &Transaction<'_>,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<()> {
    if table_exists(tx, table)? && !column_exists(tx, table, column)? {
        tx.execute_batch(&format!(
            "ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {definition}"
        ))?;
    }
    Ok(())
}

fn table_exists(tx: &Transaction<'_>, table: &str) -> Result<bool> {
    tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get(0),
    )
}

fn column_exists(tx: &Transaction<'_>, table: &str, column: &str) -> Result<bool> {
    let mut stmt = tx.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        if row.get::<_, String>(1)? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn migrate_pending_sync_queue(tx: &Transaction<'_>) -> Result<()> {
    if !table_exists(tx, "sync_queue")? {
        return Ok(());
    }

    let mut stmt = tx.prepare("SELECT id, \"table\", data FROM sync_queue WHERE synced = 0")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>>>()?;
    drop(stmt);

    for (id, table, data) in rows {
        let canonical_table = canonical_table_name(&table);
        let canonical_data = data.map(|raw| match serde_json::from_str::<Value>(&raw) {
            Ok(mut value) => {
                canonicalize_payload(&mut value);
                value.to_string()
            }
            Err(_) => raw,
        });
        tx.execute(
            "UPDATE sync_queue SET \"table\" = ?1, data = ?2 WHERE id = ?3",
            params![canonical_table, canonical_data, id],
        )?;
    }
    Ok(())
}

fn canonical_table_name(table: &str) -> &str {
    match table {
        "folders" => "workspaces",
        "docks" => "projects",
        "lists" => "columns",
        "cards" => "tasks",
        "subcards" => "subtasks",
        canonical => canonical,
    }
}

fn canonicalize_payload(value: &mut Value) {
    match value {
        Value::Array(values) => values.iter_mut().for_each(canonicalize_payload),
        Value::Object(object) => {
            let old = std::mem::take(object);
            for (key, mut value) in old {
                canonicalize_payload(&mut value);
                object.insert(canonical_field_name(&key).to_string(), value);
            }
        }
        Value::String(value) => match value.as_str() {
            "card-to-card" => *value = "task-to-task".into(),
            "list-to-list" => *value = "column-to-column".into(),
            _ => {}
        },
        _ => {}
    }
}

fn canonical_field_name(field: &str) -> &str {
    match field {
        "parentId" => "parentWorkspaceId",
        "folderId" => "workspaceId",
        "dockId" => "projectId",
        "listId" => "columnId",
        "cardId" => "taskId",
        "connectedCardIds" => "connectedTaskIds",
        "connectedListIds" => "connectedColumnIds",
        "folders" => "workspaces",
        "docks" => "projects",
        "lists" => "columns",
        "cards" => "tasks",
        "subCards" | "subcards" => "subtasks",
        canonical => canonical,
    }
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  parentWorkspaceId TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (parentWorkspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  workspaceId TEXT,
  tags TEXT,
  color TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  boardIds TEXT,
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  projectId TEXT NOT NULL,
  color TEXT,
  tags TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  boardId TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  columnId TEXT NOT NULL,
  boardId TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  deadline INTEGER,
  status TEXT,
  notes TEXT,
  tags TEXT,
  connectedTaskIds TEXT,
  connectedColumnIds TEXT,
  subtasks TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (columnId) REFERENCES columns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  taskId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  boardId TEXT NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  fromId TEXT NOT NULL,
  toId TEXT NOT NULL,
  type TEXT NOT NULL,
  points TEXT,
  boardId TEXT NOT NULL,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  "table" TEXT NOT NULL,
  recordId TEXT NOT NULL,
  data TEXT,
  timestamp INTEGER NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(columnId);
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(boardId);
CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(boardId);
CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(projectId);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(taskId);
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspaceId);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_database_has_only_the_canonical_schema() -> Result<()> {
        let db = Database::new(":memory:")?;
        db.initialize()?;

        {
            let conn = db.conn.lock().unwrap();
            let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
            assert_eq!(version, SCHEMA_VERSION);

            for table in [
                "workspaces",
                "projects",
                "boards",
                "columns",
                "tasks",
                "subtasks",
                "statuses",
                "connections",
                "tags",
                "settings",
                "sync_queue",
            ] {
                assert!(raw_table_exists(&conn, table)?);
            }
            for table in ["folders", "docks", "lists", "cards", "subcards"] {
                assert!(!raw_table_exists(&conn, table)?);
            }

            assert_eq!(
                raw_columns(&conn, "workspaces")?,
                ["id", "name", "color", "parentWorkspaceId", "createdAt"]
            );
            assert!(raw_columns(&conn, "projects")?.contains(&"workspaceId".to_string()));
            assert!(raw_columns(&conn, "boards")?.contains(&"projectId".to_string()));
            assert!(raw_columns(&conn, "tasks")?.contains(&"columnId".to_string()));
            assert!(raw_columns(&conn, "subtasks")?.contains(&"taskId".to_string()));
        }

        db.create(
            "projects",
            &json!({"id": "unassigned", "name": "Unassigned", "workspaceId": null}),
        )?;
        let conn = db.conn.lock().unwrap();
        let workspace_id: Option<String> = conn.query_row(
            "SELECT workspaceId FROM projects WHERE id = 'unassigned'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(workspace_id, None);
        Ok(())
    }

    #[test]
    fn migrates_legacy_database_transactionally_and_idempotently() -> Result<()> {
        let db = Database::new(":memory:")?;
        {
            let conn = db.conn.lock().unwrap();
            conn.execute_batch(LEGACY_SCHEMA)?;
            conn.execute_batch(
                r#"
                INSERT INTO folders VALUES ('root', 'Root', '#111111', NULL, 100);
                INSERT INTO folders VALUES ('child', 'Child', '#222222', 'root', 101);
                INSERT INTO docks VALUES ('assigned', 'Assigned', 'Description', 'child', '["a"]', '#333333', 102, 202, '["board-1"]');
                INSERT INTO docks VALUES ('unassigned', 'Unassigned', NULL, NULL, NULL, NULL, 103, 203, '[]');
                INSERT INTO boards VALUES ('board-1', 'Board', 'Board description', 'assigned', '#444444', '["b"]', 104, 204);
                INSERT INTO lists VALUES ('list-1', 'Todo', 'board-1', 0, '#555555', 105, 205);
                INSERT INTO cards VALUES ('card-1', 'Task', 'Task description', 'list-1', 'board-1', 0, '#666666', 999, '{"id":"status-1"}', 'Notes', '["tag"]', '["card-2"]', '["list-1"]', '[]', 106, 206);
                INSERT INTO subcards VALUES ('subcard-1', 'Step', 1, 'card-1', 107);
                INSERT INTO statuses VALUES ('status-1', 'Working', '#777777', 'board-1', 108, 208);
                INSERT INTO connections VALUES ('connection-1', 'card-1', 'card-2', 'card-to-card', '[]', 'board-1');
                INSERT INTO sync_queue VALUES ('pending', 'UPDATE', 'cards', 'card-1', '{"listId":"list-1","connectedCardIds":["card-2"],"subCards":[{"cardId":"card-1"}],"type":"card-to-card"}', 109, 0);
                INSERT INTO sync_queue VALUES ('synced', 'UPDATE', 'cards', 'card-1', '{"listId":"list-1"}', 110, 1);
                "#,
            )?;
        }

        db.initialize()?;
        db.initialize()?;

        {
            let conn = db.conn.lock().unwrap();
            for table in ["folders", "docks", "lists", "cards", "subcards"] {
                assert!(!raw_table_exists(&conn, table)?);
            }

            let parent: Option<String> = conn.query_row(
                "SELECT parentWorkspaceId FROM workspaces WHERE id = 'child'",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(parent.as_deref(), Some("root"));

            let unassigned: Option<String> = conn.query_row(
                "SELECT workspaceId FROM projects WHERE id = 'unassigned'",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(unassigned, None);

            let timestamps: (i64, i64) = conn.query_row(
                "SELECT createdAt, updatedAt FROM tasks WHERE id = 'card-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            assert_eq!(timestamps, (106, 206));
            assert_eq!(
                conn.query_row(
                    "SELECT projectId FROM boards WHERE id = 'board-1'",
                    [],
                    |row| row.get::<_, String>(0)
                )?,
                "assigned"
            );
            assert_eq!(
                conn.query_row(
                    "SELECT taskId FROM subtasks WHERE id = 'subcard-1'",
                    [],
                    |row| row.get::<_, String>(0)
                )?,
                "card-1"
            );
            assert_eq!(
                conn.query_row(
                    "SELECT type FROM connections WHERE id = 'connection-1'",
                    [],
                    |row| row.get::<_, String>(0)
                )?,
                "task-to-task"
            );
            let foreign_key_errors: i64 =
                conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })?;
            assert_eq!(foreign_key_errors, 0);

            let pending: (String, String) = conn.query_row(
                "SELECT \"table\", data FROM sync_queue WHERE id = 'pending'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            assert_eq!(pending.0, "tasks");
            let payload: Value = serde_json::from_str(&pending.1).unwrap();
            assert_eq!(payload["columnId"], "list-1");
            assert_eq!(payload["connectedTaskIds"][0], "card-2");
            assert_eq!(payload["subtasks"][0]["taskId"], "card-1");
            assert_eq!(payload["type"], "task-to-task");
            assert!(payload.get("listId").is_none());

            let synced_table: String = conn.query_row(
                "SELECT \"table\" FROM sync_queue WHERE id = 'synced'",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(synced_table, "cards");
        }

        let projects = db.get_projects_with_workspaces()?;
        let assigned = projects
            .iter()
            .find(|project| project["id"] == "assigned")
            .unwrap();
        assert_eq!(assigned["workspaceName"], "Child");

        let board = db.get_board_with_details("board-1")?.unwrap();
        assert_eq!(board["columns"][0]["id"], "list-1");
        assert_eq!(board["columns"][0]["tasks"][0]["id"], "card-1");
        assert_eq!(
            board["columns"][0]["tasks"][0]["subtasks"][0]["id"],
            "subcard-1"
        );
        assert!(board.get("lists").is_none());
        Ok(())
    }

    #[test]
    fn development_seed_uses_canonical_records() -> Result<()> {
        let db = Database::new(":memory:")?;
        db.initialize()?;
        db.seed_demo_data(true)?;

        let conn = db.conn.lock().unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row
                .get::<_, i64>(0))?,
            3
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get::<_, i64>(0))?,
            13
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sync_queue", [], |row| row
                .get::<_, i64>(0))?,
            0
        );
        let unassigned: Option<String> = conn.query_row(
            "SELECT workspaceId FROM projects WHERE id = 'project-operations'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(unassigned, None);
        Ok(())
    }

    fn raw_columns(conn: &Connection, table: &str) -> Result<Vec<String>> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
        let columns = stmt.query_map([], |row| row.get(1))?.collect();
        columns
    }

    const LEGACY_SCHEMA: &str = r#"
        CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, parentId TEXT, createdAt INTEGER NOT NULL, FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE CASCADE);
        CREATE TABLE docks (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, folderId TEXT, tags TEXT, color TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, boardIds TEXT, FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL);
        CREATE TABLE boards (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, dockId TEXT NOT NULL, color TEXT, tags TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, FOREIGN KEY (dockId) REFERENCES docks(id) ON DELETE CASCADE);
        CREATE TABLE lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, boardId TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0, color TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE);
        CREATE TABLE cards (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, listId TEXT NOT NULL, boardId TEXT, "order" INTEGER NOT NULL DEFAULT 0, color TEXT, deadline INTEGER, status TEXT, notes TEXT, tags TEXT, connectedCardIds TEXT, connectedListIds TEXT, subCards TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE CASCADE);
        CREATE TABLE subcards (id TEXT PRIMARY KEY, title TEXT NOT NULL, completed INTEGER DEFAULT 0, cardId TEXT NOT NULL, createdAt INTEGER NOT NULL, FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE);
        CREATE TABLE statuses (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, boardId TEXT NOT NULL, createdAt INTEGER, updatedAt INTEGER, FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE);
        CREATE TABLE connections (id TEXT PRIMARY KEY, fromId TEXT NOT NULL, toId TEXT NOT NULL, type TEXT NOT NULL, points TEXT, boardId TEXT NOT NULL, FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE);
        CREATE TABLE sync_queue (id TEXT PRIMARY KEY, operation TEXT NOT NULL, "table" TEXT NOT NULL, recordId TEXT NOT NULL, data TEXT, timestamp INTEGER NOT NULL, synced INTEGER DEFAULT 0);
    "#;
}
