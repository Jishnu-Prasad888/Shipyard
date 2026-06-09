use tauri::{
    AppHandle, Manager, Runtime, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

mod commands;
mod db;

use db::Database;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // ── Initialize SQLite database ──
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            let is_dev = cfg!(debug_assertions);
            let db_name = if is_dev { "shipyard-dev.db" } else { "shipyard.db" };
            let db_path = app_data_dir.join(db_name);

            let database = Database::new(db_path.to_str().unwrap())
                .expect("Failed to initialize database");
            database.initialize().expect("Failed to run schema migrations");

            app.manage(database);

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
                        let db = app_handle.state::<Database>();
                        let settings = db.get_settings().unwrap_or_default();
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
            commands::settings_get,
            commands::settings_save,
            commands::sync_status,
            commands::sync_push,
            commands::sync_pull,
            commands::sync_test,
            commands::export_save_file,
            commands::export_save_folder,
            commands::export_open_item,
            commands::dark_mode_toggle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
