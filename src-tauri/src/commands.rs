use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::db::Database;

// ── Shared types ──

#[derive(Debug, Serialize, Deserialize)]
pub struct DbQueryArgs {
    pub operation: String,
    pub table: Option<String>,
    pub data: Option<Value>,
    pub id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CommandResult {
    pub success: bool,
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

// ── db:query (replaces all window.electron.db.* calls) ──
#[tauri::command]
pub fn db_query(db: State<Database>, args: DbQueryArgs) -> Result<Value, String> {
    let table = args.table.as_deref().unwrap_or("");
    let id = args.id.as_deref().unwrap_or("");

    match args.operation.as_str() {
        "findAll" => db
            .find_all(table)
            .map(|v| json!(v))
            .map_err(|e| e.to_string()),

        "findById" => db
            .find_by_id(table, id)
            .map(|v| v.unwrap_or(Value::Null))
            .map_err(|e| e.to_string()),

        "create" => {
            let data = args.data.unwrap_or(json!({}));
            db.create(table, &data).map_err(|e| e.to_string())
        }

        "update" => {
            let data = args.data.unwrap_or(json!({}));
            db.update(table, id, &data).map_err(|e| e.to_string())
        }

        "delete" => db
            .delete(table, id)
            .map(|v| json!(v))
            .map_err(|e| e.to_string()),

        "getBoardWithDetails" => db
            .get_board_with_details(id)
            .map(|v| v.unwrap_or(Value::Null))
            .map_err(|e| e.to_string()),

        "getDocksWithFolders" => db
            .get_docks_with_folders()
            .map(|v| json!(v))
            .map_err(|e| e.to_string()),

        unknown => Err(format!("Unknown operation: {unknown}")),
    }
}

// ── settings:get ──
#[tauri::command]
pub fn settings_get(db: State<Database>) -> Result<Value, String> {
    db.get_settings().map_err(|e| e.to_string())
}

// ── settings:save ──
#[tauri::command]
pub fn settings_save(db: State<Database>, settings: Value) -> Result<Value, String> {
    db.save_settings(&settings).map_err(|e| e.to_string())?;
    // Note: Firebase sync is handled client-side via firebase SDK now.
    // See MIGRATION.md §Firebase for details.
    Ok(settings)
}

// ── sync:status ──
// Firebase sync is now handled entirely in the renderer (firebase JS SDK).
// These stubs keep the same API surface so frontend code compiles unchanged.
#[tauri::command]
pub fn sync_status(db: State<Database>) -> Value {
    let unsynced = db.get_unsynced_records().unwrap_or_default().len();
    json!({
        "isSyncing": false,
        "syncEnabled": false,
        "unsyncedCount": unsynced,
        "lastSyncTime": null,
        "lastSyncResult": null
    })
}

#[tauri::command]
pub fn sync_push() -> Value {
    json!({ "success": false, "message": "Firebase sync moved to renderer - call window.__firebaseSync.push() instead" })
}

#[tauri::command]
pub fn sync_pull() -> Value {
    json!({ "success": false, "message": "Firebase sync moved to renderer - call window.__firebaseSync.pull() instead" })
}

#[tauri::command]
pub fn sync_test() -> Value {
    json!({ "success": false, "message": "Firebase sync moved to renderer" })
}

// ── sync:markSynced ──
#[tauri::command]
pub fn sync_mark_synced(db: State<Database>, ids: Vec<String>) -> Result<Value, String> {
    db.mark_as_synced(&ids)
        .map(|_| json!({ "success": true, "count": ids.len() }))
        .map_err(|e| e.to_string())
}

// ── dark-mode:toggle (CSS injection not needed in Tauri; theme is class-based) ──
#[tauri::command]
pub fn dark_mode_toggle(_enabled: bool) -> Value {
    // In Tauri the renderer handles theme via CSS classes on <html>.
    // This command is a no-op kept for API compatibility.
    json!({ "success": true })
}

// ── export:saveFile ──
#[derive(Debug, Deserialize)]
pub struct SaveFileArgs {
    #[serde(rename = "defaultName")]
    pub default_name: String,
    pub content: String,
    pub ext: String,
}

#[tauri::command]
pub async fn export_save_file(
    app: AppHandle,
    args: SaveFileArgs,
) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let extension = args.ext.clone();
    let default_name = format!("{}.{}", args.default_name, args.ext);
    let content = args.content.clone();

    let file_path = app
        .dialog()
        .file()
        .set_title("Export Shipyard Data")
        .set_file_name(&default_name)
        .add_filter(&extension.to_uppercase(), &[&extension])
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_buf = PathBuf::from(path.to_string());
            std::fs::write(&path_buf, content.as_bytes())
                .map(|_| json!({ "success": true, "filePath": path_buf.to_string_lossy() }))
                .map_err(|e| e.to_string())
        }
        None => Ok(json!({ "success": false })),
    }
}

// ── export:saveFolder ──
#[derive(Debug, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub content: String,
    pub ext: String,
}

#[tauri::command]
pub async fn export_save_folder(
    app: AppHandle,
    files: Vec<FileEntry>,
) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder_path = app
        .dialog()
        .file()
        .set_title("Choose Folder to Save Export Files")
        .blocking_pick_folder();

    match folder_path {
        Some(folder) => {
            let folder_path = PathBuf::from(folder.to_string());
            let mut count = 0usize;

            for file in &files {
                let file_path = folder_path.join(format!("{}.{}", file.name, file.ext));
                std::fs::write(&file_path, file.content.as_bytes())
                    .map_err(|e| e.to_string())?;
                count += 1;
            }

            Ok(json!({
                "success": true,
                "folder": folder_path.to_string_lossy(),
                "count": count
            }))
        }
        None => Ok(json!({ "success": false })),
    }
}

// ── export:openItem ──
#[tauri::command]
pub fn export_open_item(app: AppHandle, target_path: String) -> Value {
    use tauri_plugin_shell::ShellExt;
    match app.shell().open(&target_path, None) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}
