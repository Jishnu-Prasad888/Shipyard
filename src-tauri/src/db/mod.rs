use rusqlite::{Connection, Result, params};
use serde_json::{Value, json};
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
        conn.execute_batch(SCHEMA)?;

        // Migration: add parentId to folders if missing
        let has_parent: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('folders') WHERE name='parentId'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);
        if !has_parent {
            let _ = conn.execute_batch(
                "ALTER TABLE folders ADD COLUMN parentId TEXT REFERENCES folders(id) ON DELETE CASCADE",
            );
        }

        // Migration: boards columns
        for col in &["description", "color", "tags"] {
            let has_col: bool = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) FROM pragma_table_info('boards') WHERE name='{col}'"
                    ),
                    [],
                    |r| r.get::<_, i64>(0),
                )
                .map(|c| c > 0)
                .unwrap_or(false);
            if !has_col {
                let _ = conn.execute_batch(&format!("ALTER TABLE boards ADD COLUMN \"{col}\" TEXT"));
            }
        }

        // Migration: docks columns
        for col in &["description", "tags", "color"] {
            let has_col: bool = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) FROM pragma_table_info('docks') WHERE name='{col}'"
                    ),
                    [],
                    |r| r.get::<_, i64>(0),
                )
                .map(|c| c > 0)
                .unwrap_or(false);
            if !has_col {
                let _ = conn.execute_batch(&format!("ALTER TABLE docks ADD COLUMN \"{col}\" TEXT"));
            }
        }

        migrate_legacy_schema(&mut conn)?;

        // Seed default settings if missing
        let settings_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM settings WHERE key = 'app_settings'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if settings_count == 0 {
            let default_settings = default_settings();
            conn.execute(
                "INSERT INTO settings (key, value, updatedAt) VALUES (?1, ?2, ?3)",
                params![
                    "app_settings",
                    default_settings.to_string(),
                    now_ms()
                ],
            )?;
        }

        conn.execute_batch(INDEXES)?;

        Ok(())
    }

    pub fn seed_demo_data(&self, force_reset: bool) -> Result<()> {
        dev_seed::seed_demo_data(self, force_reset)
    }

    // ── Generic CRUD ──

    pub fn find_all(&self, table: &str) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!("SELECT * FROM \"{table}\""))?;
        let cols: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
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
        let mut stmt =
            conn.prepare(&format!("SELECT * FROM \"{table}\" WHERE id = ?1"))?;
        let cols: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
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
        let no_updated_at = matches!(table, "folders" | "subcards" | "tags" | "connections" | "sync_queue" | "settings");

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

        let values: Vec<String> = columns
            .iter()
            .map(|col| json_to_sql_string(record.get(col).unwrap()))
            .collect();

        conn.execute(
            &sql,
            rusqlite::params_from_iter(values.iter().map(|v| v as &dyn rusqlite::ToSql)),
        )?;

        self.add_to_sync_queue(&conn, "CREATE", table, &id, data)?;

        drop(conn);
        self.find_by_id(table, &id).map(|opt| opt.unwrap_or(json!(null)))
    }

    pub fn update(&self, table: &str, id: &str, data: &Value) -> Result<Value> {
        let conn = self.conn.lock().unwrap();
        let obj = data.as_object().cloned().unwrap_or_default();
        let now = now_ms();
        let no_updated_at = matches!(table, "folders" | "subcards" | "tags" | "connections" | "sync_queue" | "settings");

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

        let set_clauses: Vec<String> = updates
            .keys()
            .map(|k| format!("\"{k}\" = ?"))
            .collect();
        let mut values: Vec<String> = updates
            .values()
            .map(json_to_sql_string)
            .collect();
        values.push(id.to_string());

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
        self.find_by_id(table, id).map(|opt| opt.unwrap_or(json!(null)))
    }

    pub fn delete(&self, table: &str, id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        conn.execute(&format!("DELETE FROM \"{table}\" WHERE id = ?1"), params![id])?;
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

    pub fn get_docks_with_folders(&self) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT d.*, f.name as folderName, f.color as folderColor
             FROM docks d
             LEFT JOIN folders f ON d.folderId = f.id
             ORDER BY d.updatedAt DESC",
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

        // Lists
        let mut lists: Vec<Value> = {
            let mut stmt = conn.prepare(
                "SELECT * FROM lists WHERE boardId = ?1 ORDER BY \"order\" ASC",
            )?;
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

        // Cards + SubCards per list
        for list in &mut lists {
            let list_id = list["id"].as_str().unwrap_or("").to_string();
            let mut cards: Vec<Value> = {
                let mut stmt = conn.prepare(
                    "SELECT * FROM cards WHERE listId = ?1 ORDER BY \"order\" ASC",
                )?;
                let cols: Vec<String> =
                    stmt.column_names().iter().map(|s| s.to_string()).collect();
                let mapped_rows = stmt.query_map(params![list_id], |row| {
                    let mut obj = serde_json::Map::new();
                    for (i, col) in cols.iter().enumerate() {
                        obj.insert(col.clone(), row_value_to_json(row, i));
                    }
                    Ok(Value::Object(obj))
                })?;
                mapped_rows.filter_map(|r| r.ok()).collect()
            };

            for card in &mut cards {
                let card_id = card["id"].as_str().unwrap_or("").to_string();
                let subcards: Vec<Value> = {
                    let mut stmt = conn.prepare(
                        "SELECT * FROM subcards WHERE cardId = ?1 ORDER BY createdAt ASC",
                    )?;
                    let cols: Vec<String> =
                        stmt.column_names().iter().map(|s| s.to_string()).collect();
                    let mapped_rows = stmt.query_map(params![card_id], |row| {
                        let mut obj = serde_json::Map::new();
                        for (i, col) in cols.iter().enumerate() {
                            obj.insert(col.clone(), row_value_to_json(row, i));
                        }
                        Ok(Value::Object(obj))
                    })?;
                    mapped_rows.filter_map(|r| r.ok()).collect()
                };
                if let Some(obj) = card.as_object_mut() {
                    obj.insert("subCards".into(), json!(subcards));
                    // Parse JSON string fields
                    for field in &["tags", "connectedCardIds", "connectedListIds"] {
                        if let Some(Value::String(s)) = obj.get(*field) {
                            if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                                obj.insert(field.to_string(), parsed);
                            }
                        }
                    }
                }
            }

            if let Some(list_obj) = list.as_object_mut() {
                list_obj.insert("cards".into(), json!(cards));
            }
        }

        // Connections
        let connections: Vec<Value> = {
            let mut stmt =
                conn.prepare("SELECT * FROM connections WHERE boardId = ?1")?;
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
            obj.insert("lists".into(), json!(lists));
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
        let mut stmt = conn.prepare(
            "SELECT * FROM sync_queue WHERE synced = 0 ORDER BY timestamp ASC",
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

fn json_to_sql_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => if *b { "1".into() } else { "0".into() },
        other => other.to_string(),
    }
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![table],
        |row| row.get(0),
    )
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)",
        params![table, column],
        |row| row.get(0),
    )
}

fn migrate_legacy_schema(conn: &mut Connection) -> Result<()> {
    let already_migrated: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = 'legacy_naming')",
        [],
        |row| row.get(0),
    )?;
    if already_migrated {
        return Ok(());
    }

    let has_legacy_boards = column_exists(conn, "boards", "projectId")?
        && !column_exists(conn, "boards", "dockId")?;
    let has_legacy_tables = ["workspaces", "projects", "columns", "tasks", "subtasks"]
        .iter()
        .try_fold(false, |found, table| {
            table_exists(conn, table).map(|exists| found || exists)
        })?;

    if !has_legacy_boards && !has_legacy_tables {
        return Ok(());
    }

    conn.pragma_update(None, "foreign_keys", false)?;
    let migration = (|| -> Result<()> {
        let tx = conn.transaction()?;

        if table_exists(&tx, "workspaces")? {
            tx.execute_batch(
                r#"
                INSERT OR IGNORE INTO folders (id, name, color, parentId, createdAt)
                SELECT id, name, color, parentWorkspaceId, createdAt FROM workspaces;
                "#,
            )?;
        }

        if table_exists(&tx, "projects")? {
            tx.execute_batch(
                r#"
                INSERT OR IGNORE INTO docks
                  (id, name, description, folderId, tags, color, createdAt, updatedAt, boardIds)
                SELECT id, name, description, workspaceId, tags, color, createdAt, updatedAt, boardIds
                FROM projects;
                "#,
            )?;
        }

        if has_legacy_boards {
            tx.execute_batch(
                r#"
                CREATE TABLE boards_migration (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  description TEXT,
                  dockId TEXT NOT NULL,
                  color TEXT,
                  tags TEXT,
                  createdAt INTEGER NOT NULL,
                  updatedAt INTEGER NOT NULL,
                  FOREIGN KEY (dockId) REFERENCES docks(id) ON DELETE CASCADE
                );
                INSERT INTO boards_migration
                  (id, name, description, dockId, color, tags, createdAt, updatedAt)
                SELECT id, name, description, projectId, color, tags, createdAt, updatedAt
                FROM boards;
                DROP TABLE boards;
                ALTER TABLE boards_migration RENAME TO boards;
                "#,
            )?;
        }

        if table_exists(&tx, "columns")? {
            tx.execute_batch(
                r#"
                INSERT OR IGNORE INTO lists (id, name, boardId, "order", color, createdAt, updatedAt)
                SELECT id, name, boardId, "order", color, createdAt, updatedAt FROM columns;
                "#,
            )?;
        }

        if table_exists(&tx, "tasks")? {
            tx.execute_batch(
                r#"
                INSERT OR IGNORE INTO cards
                  (id, title, description, listId, boardId, "order", color, deadline, status,
                   notes, tags, connectedCardIds, connectedListIds, subCards, createdAt, updatedAt)
                SELECT id, title, description, columnId, boardId, "order", color, deadline, status,
                       notes, tags, connectedTaskIds, connectedColumnIds, subtasks, createdAt, updatedAt
                FROM tasks;
                "#,
            )?;
        }

        if table_exists(&tx, "subtasks")? {
            tx.execute_batch(
                r#"
                INSERT OR IGNORE INTO subcards (id, title, completed, cardId, createdAt)
                SELECT id, title, completed, taskId, createdAt FROM subtasks;
                "#,
            )?;
        }

        tx.execute(
            "INSERT INTO schema_migrations (name) VALUES ('legacy_naming')",
            [],
        )?;

        tx.commit()
    })();
    let foreign_keys = conn.pragma_update(None, "foreign_keys", true);

    migration?;
    foreign_keys
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  parentId TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS docks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  folderId TEXT,
  tags TEXT,
  color TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  boardIds TEXT,
  FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  dockId TEXT NOT NULL,
  color TEXT,
  tags TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (dockId) REFERENCES docks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  boardId TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  listId TEXT NOT NULL,
  boardId TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  deadline INTEGER,
  status TEXT,
  notes TEXT,
  tags TEXT,
  connectedCardIds TEXT,
  connectedListIds TEXT,
  subCards TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subcards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  cardId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY
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

"#;

const INDEXES: &str = r#"
CREATE INDEX IF NOT EXISTS idx_cards_list ON cards(listId);
CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(boardId);
CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(boardId);
CREATE INDEX IF NOT EXISTS idx_boards_dock ON boards(dockId);
CREATE INDEX IF NOT EXISTS idx_subcards_card ON subcards(cardId);
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_docks_folder ON docks(folderId);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_naming_and_relationships() -> Result<()> {
        let database = Database::new(":memory:")?;
        {
            let conn = database.conn.lock().unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE workspaces (
                  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT,
                  parentWorkspaceId TEXT, createdAt INTEGER NOT NULL
                );
                CREATE TABLE projects (
                  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
                  workspaceId TEXT, tags TEXT, color TEXT, createdAt INTEGER NOT NULL,
                  updatedAt INTEGER NOT NULL, boardIds TEXT
                );
                CREATE TABLE boards (
                  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
                  projectId TEXT NOT NULL, color TEXT, tags TEXT,
                  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
                );
                CREATE TABLE columns (
                  id TEXT PRIMARY KEY, name TEXT NOT NULL, boardId TEXT NOT NULL,
                  "order" INTEGER NOT NULL, color TEXT, createdAt INTEGER NOT NULL,
                  updatedAt INTEGER NOT NULL
                );
                CREATE TABLE tasks (
                  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
                  columnId TEXT NOT NULL, boardId TEXT, "order" INTEGER NOT NULL,
                  color TEXT, deadline INTEGER, status TEXT, notes TEXT, tags TEXT,
                  connectedTaskIds TEXT, connectedColumnIds TEXT, subtasks TEXT,
                  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
                );
                CREATE TABLE subtasks (
                  id TEXT PRIMARY KEY, title TEXT NOT NULL, completed INTEGER,
                  taskId TEXT NOT NULL, createdAt INTEGER NOT NULL
                );

                INSERT INTO workspaces VALUES ('workspace-1', 'Workspace', '#fff', NULL, 1);
                INSERT INTO projects VALUES
                  ('project-1', 'Project', 'Description', 'workspace-1', '[]', '#fff', 1, 2, '["board-1"]');
                INSERT INTO boards VALUES
                  ('board-1', 'Board', 'Description', 'project-1', '#fff', '[]', 1, 2);
                INSERT INTO columns VALUES ('list-1', 'List', 'board-1', 0, '#fff', 1, 2);
                INSERT INTO tasks VALUES
                  ('card-1', 'Card', 'Description', 'list-1', 'board-1', 0, '#fff', NULL,
                   NULL, NULL, '[]', '[]', '[]', '[]', 1, 2);
                INSERT INTO subtasks VALUES ('subcard-1', 'Subcard', 0, 'card-1', 1);
                "#,
            )?;
        }

        database.initialize()?;
        database.initialize()?;

        let conn = database.conn.lock().unwrap();
        let dock_id: String =
            conn.query_row("SELECT dockId FROM boards WHERE id = 'board-1'", [], |row| {
                row.get(0)
            })?;
        assert_eq!(dock_id, "project-1");

        for table in ["folders", "docks", "boards", "lists", "cards", "subcards"] {
            let count: i64 = conn.query_row(
                &format!("SELECT COUNT(*) FROM {table}"),
                [],
                |row| row.get(0),
            )?;
            assert_eq!(count, 1, "unexpected row count in {table}");
        }

        conn.execute("DELETE FROM docks WHERE id = 'project-1'", [])?;
        for table in ["boards", "lists", "cards", "subcards"] {
            let count: i64 = conn.query_row(
                &format!("SELECT COUNT(*) FROM {table}"),
                [],
                |row| row.get(0),
            )?;
            assert_eq!(count, 0, "cascade did not reach {table}");
        }

        Ok(())
    }
}
