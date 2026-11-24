use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

mod commands;
mod dev_seed;
mod state;

use state::{AppState, SourceDescriptor, PORTABLE_DIR};
use std::path::PathBuf;
use std::sync::Arc;

/// Folder passed with `--data <path>` (or `--data=<path>`) or the
/// `SHIPYARD_DATA_DIR` environment variable.
fn data_dir_override() -> Option<PathBuf> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--data" {
            return args.next().map(PathBuf::from);
        }
        if let Some(path) = arg.strip_prefix("--data=") {
            return Some(PathBuf::from(path));
        }
    }
    std::env::var_os("SHIPYARD_DATA_DIR")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// A `shipyard-data` folder next to the executable turns on portable mode.
fn portable_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.join(PORTABLE_DIR);
    dir.is_dir().then_some(dir)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // ── Resolve where settings and data live ──
            let portable = portable_dir();
            let config_path = match &portable {
                Some(dir) => dir.join(".shipyard").join("app-config.json"),
                None => app
                    .path()
                    .app_config_dir()
                    .expect("Failed to get app config dir")
                    .join("config.json"),
            };
            let state = Arc::new(AppState::new(config_path, portable.is_some()));

            let initial = data_dir_override().or_else(|| portable.clone());
            if let Some(dir) = initial {
                if let Err(e) = state.open_local(&dir.to_string_lossy(), false) {
                    eprintln!("shipyard: could not open {}: {e}", dir.display());
                }
            } else {
                let last = state.config.lock().unwrap().last_source.clone();
                match last {
                    Some(SourceDescriptor::Local { path }) if PathBuf::from(&path).is_dir() => {
                        if let Err(e) = state.open_local(&path, true) {
                            eprintln!("shipyard: could not reopen {path}: {e}");
                        }
                    }
                    Some(SourceDescriptor::Remote { address, token }) => {
                        state.restore_remote(&address, &token)
                    }
                    _ => {}
                }
            }

            // Demo data for development: SHIPYARD_DEMO_SEED=1 (or "reset").
            if cfg!(debug_assertions) {
                if let Ok(mode) = std::env::var("SHIPYARD_DEMO_SEED") {
                    if let Some(shipyard_core::Source::Local(store)) = state.current_source() {
                        let reset = mode.eq_ignore_ascii_case("reset");
                        if let Err(e) = dev_seed::seed_demo_data(&store, reset) {
                            eprintln!("shipyard: demo seed failed: {e}");
                        }
                    }
                }
            }

            app.manage(state);

            // ── System Tray ──
            let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;

            let menu = Menu::with_items(app, &[&open_item, &separator, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Shipyard")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // ── Window close → minimize to tray (if setting enabled) ──
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let state = app_handle.state::<Arc<AppState>>();
                        let settings = state.config.lock().unwrap().settings.clone();
                        if settings
                            .get("minimizeToTray")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true)
                        {
                            api.prevent_close();
                            if let Some(win) = app_handle.get_webview_window("main") {
                                let _ = win.hide();
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_query,
            commands::source_status,
            commands::source_open_local,
            commands::source_open_remote,
            commands::source_close,
            commands::source_forget,
            commands::share_status,
            commands::share_start,
            commands::share_stop,
            commands::settings_get,
            commands::settings_save,
            commands::sync_status,
            commands::sync_push,
            commands::sync_pull,
            commands::sync_test,
            commands::sync_mark_synced,
            commands::export_save_file,
            commands::export_save_folder,
            commands::export_open_item,
            commands::dark_mode_toggle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
