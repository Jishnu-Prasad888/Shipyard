use serde::Deserialize;
use serde_json::{json, Value};
use shipyard_core::{local_ip, QueryArgs, Source};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::state::{AppState, ShareConfig, SourceDescriptor};

type AppStateRef<'a> = State<'a, Arc<AppState>>;

/// Runs blocking work (file or network I/O) off the UI thread.
async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

fn require_source(state: &AppState) -> Result<Source, String> {
    state
        .current_source()
        .ok_or_else(|| "No folder is open. Open a folder to continue.".to_string())
}

// ── Data (replaces all window.electron.db.* calls) ──

#[tauri::command]
pub async fn db_query(state: AppStateRef<'_>, args: QueryArgs) -> Result<Value, String> {
    let source = require_source(&state)?;
    blocking(move || source.query(&args).map_err(|e| e.to_string())).await
}

// ── Data folder ──

fn descriptor_json(descriptor: &SourceDescriptor) -> Value {
    let mut value = serde_json::to_value(descriptor).unwrap_or(Value::Null);
    value["label"] = json!(descriptor.label());
    value
}

#[tauri::command]
pub async fn source_status(state: AppStateRef<'_>) -> Result<Value, String> {
    let state = state.inner().clone();
    blocking(move || {
        let active = state.current_descriptor();
        let (reachable, error) = match state.current_source() {
            Some(Source::Remote(client)) => match client.info() {
                Ok(_) => (true, None),
                Err(e) => (false, Some(e.to_string())),
            },
            Some(Source::Local(_)) => (true, None),
            None => (false, None),
        };
        let recent: Vec<Value> = state
            .config
            .lock()
            .unwrap()
            .recent
            .iter()
            .map(descriptor_json)
            .collect();
        Ok(json!({
            "active": active.as_ref().map(descriptor_json),
            "reachable": reachable,
            "error": error,
            "recent": recent,
            "portable": state.portable,
        }))
    })
    .await
}

#[tauri::command]
pub async fn source_open_local(state: AppStateRef<'_>, path: String) -> Result<Value, String> {
    let state = state.inner().clone();
    blocking(move || {
        if state.portable {
            // Portable mode keeps its folder; other folders open for this run only.
            state.open_local(&path, false)
        } else {
            state.open_local(&path, true)
        }
        .map(|d| descriptor_json(&d))
    })
    .await
}

#[tauri::command]
pub async fn source_open_remote(
    state: AppStateRef<'_>,
    address: String,
    token: String,
) -> Result<Value, String> {
    let state = state.inner().clone();
    blocking(move || {
        state
            .open_remote(&address, &token)
            .map(|d| descriptor_json(&d))
    })
    .await
}

#[tauri::command]
pub fn source_close(state: AppStateRef<'_>) {
    state.close();
}

#[tauri::command]
pub fn source_forget(state: AppStateRef<'_>, descriptor: SourceDescriptor) {
    state.forget(&descriptor);
}

// ── Network sharing ──

#[tauri::command]
pub fn share_status(state: AppStateRef<'_>) -> Value {
    let config = state.config.lock().unwrap().share.clone();
    let running = state.share.lock().unwrap().as_ref().map(|h| h.port());
    let is_local = matches!(state.current_source(), Some(Source::Local(_)));
    let ip = local_ip();
    json!({
        "running": running.is_some(),
        "canShare": is_local,
        "port": running.unwrap_or(config.port),
        "host": config.host,
        "token": config.token,
        "readOnly": config.read_only,
        "address": ip.map(|ip| format!("{}:{}", ip, running.unwrap_or(config.port))),
        "error": state.share_error.lock().unwrap().clone(),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareArgs {
    pub port: Option<u16>,
    pub token: Option<String>,
    pub host: Option<String>,
    pub read_only: Option<bool>,
}

#[tauri::command]
pub async fn share_start(state: AppStateRef<'_>, args: ShareArgs) -> Result<Value, String> {
    let state_arc = state.inner().clone();
    blocking(move || {
        let current = state_arc.config.lock().unwrap().share.clone();
        let next = ShareConfig {
            enabled: true,
            host: args.host.unwrap_or(current.host),
            port: args.port.unwrap_or(current.port),
            token: args.token.unwrap_or(current.token),
            read_only: args.read_only.unwrap_or(current.read_only),
        };
        state_arc.start_share(next)
    })
    .await?;
    Ok(share_status(state))
}

#[tauri::command]
pub fn share_stop(state: AppStateRef<'_>) -> Value {
    state.stop_share();
    share_status(state)
}

// ── Settings (stored per device, not in the data folder) ──

#[tauri::command]
pub fn settings_get(state: AppStateRef<'_>) -> Value {
    state.config.lock().unwrap().settings.clone()
}

#[tauri::command]
pub fn settings_save(state: AppStateRef<'_>, settings: Value) -> Value {
    state.config.lock().unwrap().settings = settings.clone();
    state.save_config();
    settings
}

// ── Sync ──
// Firebase and server sync run in the renderer; these keep the API surface.

#[tauri::command]
pub async fn sync_status(state: AppStateRef<'_>) -> Result<Value, String> {
    let unsynced = match state.current_source() {
        Some(source) => blocking(move || {
            source
                .query(&QueryArgs {
                    operation: "unsyncedCount".into(),
                    ..Default::default()
                })
                .map_err(|e| e.to_string())
        })
        .await
        .unwrap_or(json!(0)),
        None => json!(0),
    };
    Ok(json!({
        "isSyncing": false,
        "syncEnabled": false,
        "unsyncedCount": unsynced,
        "lastSyncTime": null,
        "lastSyncResult": null
    }))
}

#[tauri::command]
pub fn sync_push() -> Value {
    json!({ "success": false, "message": "Firebase sync runs in the app window" })
}

#[tauri::command]
pub fn sync_pull() -> Value {
    json!({ "success": false, "message": "Firebase sync runs in the app window" })
}

#[tauri::command]
pub fn sync_test() -> Value {
    json!({ "success": false, "message": "Firebase sync runs in the app window" })
}

#[tauri::command]
pub async fn sync_mark_synced(state: AppStateRef<'_>, ids: Vec<String>) -> Result<Value, String> {
    let source = require_source(&state)?;
    blocking(move || {
        source
            .query(&QueryArgs {
                operation: "markSynced".into(),
                ids: Some(ids),
                ..Default::default()
            })
            .map_err(|e| e.to_string())
    })
    .await
}

// ── dark-mode:toggle (theme is class-based in the renderer) ──
#[tauri::command]
pub fn dark_mode_toggle(_enabled: bool) -> Value {
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
pub async fn export_save_file(app: AppHandle, args: SaveFileArgs) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let extension = args.ext.clone();
    let default_name = format!("{}.{}", args.default_name, args.ext);
    let content = args.content.clone();

    let file_path = app
        .dialog()
        .file()
        .set_title("Export Shipyard Data")
        .set_file_name(&default_name)
        .add_filter(extension.to_uppercase(), &[&extension])
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
pub async fn export_save_folder(app: AppHandle, files: Vec<FileEntry>) -> Result<Value, String> {
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
                std::fs::write(&file_path, file.content.as_bytes()).map_err(|e| e.to_string())?;
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
#[allow(deprecated)]
pub fn export_open_item(app: AppHandle, target_path: String) -> Value {
    use tauri_plugin_shell::ShellExt;
    match app.shell().open(&target_path, None) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}
