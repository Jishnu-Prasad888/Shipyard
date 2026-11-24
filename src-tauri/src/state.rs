//! App-wide state: which folder is open, network sharing, and the small
//! per-device config file (settings, recent folders).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use shipyard_core::{
    generate_token, server, store::write_atomic, FileStore, RemoteClient, ServerConfig,
    ServerHandle, Source, DEFAULT_PORT,
};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

/// Name of a data folder placed next to the executable to run in portable
/// mode (data and settings travel with the app, e.g. on a USB drive).
pub const PORTABLE_DIR: &str = "shipyard-data";
const MAX_RECENT: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SourceDescriptor {
    Local { path: String },
    Remote { address: String, token: String },
}

impl SourceDescriptor {
    pub fn label(&self) -> String {
        match self {
            SourceDescriptor::Local { path } => Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path)
                .to_string(),
            SourceDescriptor::Remote { address, .. } => address.clone(),
        }
    }

    fn same_target(&self, other: &SourceDescriptor) -> bool {
        match (self, other) {
            (SourceDescriptor::Local { path: a }, SourceDescriptor::Local { path: b }) => a == b,
            (
                SourceDescriptor::Remote { address: a, .. },
                SourceDescriptor::Remote { address: b, .. },
            ) => a == b,
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub token: String,
    pub read_only: bool,
}

impl Default for ShareConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: "0.0.0.0".into(),
            port: DEFAULT_PORT,
            token: generate_token(),
            read_only: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub settings: Value,
    pub last_source: Option<SourceDescriptor>,
    pub recent: Vec<SourceDescriptor>,
    pub share: ShareConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            settings: default_settings(),
            last_source: None,
            recent: Vec::new(),
            share: ShareConfig::default(),
        }
    }
}

pub fn default_settings() -> Value {
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

pub struct ActiveSource {
    pub source: Source,
    pub descriptor: SourceDescriptor,
}

pub struct AppState {
    pub active: RwLock<Option<ActiveSource>>,
    pub share: Mutex<Option<ServerHandle>>,
    pub share_error: Mutex<Option<String>>,
    pub config: Mutex<AppConfig>,
    pub config_path: PathBuf,
    pub portable: bool,
}

impl AppState {
    pub fn new(config_path: PathBuf, portable: bool) -> Self {
        let config = std::fs::read(&config_path)
            .ok()
            .and_then(|raw| serde_json::from_slice::<AppConfig>(&raw).ok())
            .unwrap_or_default();
        Self {
            active: RwLock::new(None),
            share: Mutex::new(None),
            share_error: Mutex::new(None),
            config: Mutex::new(config),
            config_path,
            portable,
        }
    }

    pub fn save_config(&self) {
        let config = self.config.lock().unwrap().clone();
        if let Ok(bytes) = serde_json::to_vec_pretty(&config) {
            if let Err(e) = write_atomic(&self.config_path, &bytes) {
                eprintln!("shipyard: could not save config: {e}");
            }
        }
    }

    pub fn current_source(&self) -> Option<Source> {
        self.active
            .read()
            .unwrap()
            .as_ref()
            .map(|a| a.source.clone())
    }

    pub fn current_descriptor(&self) -> Option<SourceDescriptor> {
        self.active
            .read()
            .unwrap()
            .as_ref()
            .map(|a| a.descriptor.clone())
    }

    fn remember(&self, descriptor: &SourceDescriptor, persist_last: bool) {
        {
            let mut config = self.config.lock().unwrap();
            config.recent.retain(|r| !r.same_target(descriptor));
            config.recent.insert(0, descriptor.clone());
            config.recent.truncate(MAX_RECENT);
            if persist_last {
                config.last_source = Some(descriptor.clone());
            }
        }
        self.save_config();
    }

    pub fn open_local(&self, path: &str, persist_last: bool) -> Result<SourceDescriptor, String> {
        let store = FileStore::open(path).map_err(|e| e.to_string())?;
        let descriptor = SourceDescriptor::Local {
            path: store.root().to_string_lossy().into_owned(),
        };
        let store = Arc::new(store);
        *self.active.write().unwrap() = Some(ActiveSource {
            source: Source::Local(store),
            descriptor: descriptor.clone(),
        });
        self.remember(&descriptor, persist_last);
        self.restart_share_if_enabled();
        Ok(descriptor)
    }

    /// Connects to a shared folder; `info()` performs a network call.
    pub fn open_remote(&self, address: &str, token: &str) -> Result<SourceDescriptor, String> {
        let client = RemoteClient::new(address, token).map_err(|e| e.to_string())?;
        client.info().map_err(|e| e.to_string())?;
        let descriptor = SourceDescriptor::Remote {
            address: client.base_url().trim_start_matches("http://").to_string(),
            token: token.trim().to_string(),
        };
        self.stop_share_server();
        *self.active.write().unwrap() = Some(ActiveSource {
            source: Source::Remote(client),
            descriptor: descriptor.clone(),
        });
        self.remember(&descriptor, true);
        Ok(descriptor)
    }

    /// Re-activates a remote source at startup without blocking on the
    /// network; reachability is checked when the UI asks for the status.
    pub fn restore_remote(&self, address: &str, token: &str) {
        if let Ok(client) = RemoteClient::new(address, token) {
            *self.active.write().unwrap() = Some(ActiveSource {
                source: Source::Remote(client),
                descriptor: SourceDescriptor::Remote {
                    address: address.into(),
                    token: token.into(),
                },
            });
        }
    }

    pub fn close(&self) {
        self.stop_share_server();
        *self.active.write().unwrap() = None;
        self.config.lock().unwrap().last_source = None;
        self.save_config();
    }

    pub fn forget(&self, descriptor: &SourceDescriptor) {
        self.config
            .lock()
            .unwrap()
            .recent
            .retain(|r| !r.same_target(descriptor));
        self.save_config();
    }

    // ── Network sharing ──

    fn stop_share_server(&self) {
        if let Some(handle) = self.share.lock().unwrap().take() {
            handle.stop();
        }
    }

    pub fn start_share(&self, update: ShareConfig) -> Result<(), String> {
        let store = match self.current_source() {
            Some(Source::Local(store)) => store,
            Some(Source::Remote(_)) => {
                return Err("Only folders on this computer can be shared.".into())
            }
            None => return Err("Open a folder first.".into()),
        };
        self.stop_share_server();
        let mut update = update;
        if update.token.trim().is_empty() {
            update.token = generate_token();
        }
        if update.host.trim().is_empty() {
            update.host = "0.0.0.0".into();
        }
        let result = server::start(
            store,
            ServerConfig {
                host: update.host.clone(),
                port: update.port,
                token: update.token.clone(),
                read_only: update.read_only,
            },
        );
        match result {
            Ok(handle) => {
                *self.share.lock().unwrap() = Some(handle);
                *self.share_error.lock().unwrap() = None;
                update.enabled = true;
                self.config.lock().unwrap().share = update;
                self.save_config();
                Ok(())
            }
            Err(e) => {
                let message = e.to_string();
                *self.share_error.lock().unwrap() = Some(message.clone());
                Err(message)
            }
        }
    }

    pub fn stop_share(&self) {
        self.stop_share_server();
        self.config.lock().unwrap().share.enabled = false;
        self.save_config();
    }

    pub fn restart_share_if_enabled(&self) {
        let share = self.config.lock().unwrap().share.clone();
        if share.enabled {
            if let Err(e) = self.start_share(share) {
                eprintln!("shipyard: could not resume sharing: {e}");
            }
        } else {
            self.stop_share_server();
        }
    }
}
