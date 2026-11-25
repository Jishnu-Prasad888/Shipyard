//! Shipyard core: folder storage, the query protocol shared by the desktop
//! app and the network server, and the client used to open a folder that is
//! shared from another machine.

pub mod remote;
pub mod server;
pub mod store;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub use remote::RemoteClient;
pub use server::{ServerConfig, ServerHandle};
pub use store::FileStore;

pub const DEFAULT_PORT: u16 = 7420;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    InvalidInput(String),
    #[error("file error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Remote(String),
}

pub type Result<T> = std::result::Result<T, Error>;

/// One data operation. The desktop UI sends these to the app, and remote
/// clients send the same payload to a sharing server.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QueryArgs {
    pub operation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub table: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ids: Option<Vec<String>>,
}

/// Runs a query against a local folder.
pub fn execute(store: &FileStore, args: &QueryArgs) -> Result<Value> {
    let table = args.table.as_deref().unwrap_or("");
    let id = args.id.as_deref().unwrap_or("");
    let data = args.data.clone().unwrap_or_else(|| json!({}));

    match args.operation.as_str() {
        "findAll" => Ok(json!(store.find_all(table)?)),
        "findById" => Ok(store.find_by_id(table, id)?.unwrap_or(Value::Null)),
        "create" => store.create(table, &data),
        "update" => store.update(table, id, &data),
        "delete" => Ok(json!(store.delete(table, id)?)),
        "getBoardWithDetails" => Ok(store.get_board_with_details(id)?.unwrap_or(Value::Null)),
        "getProjectsWithWorkspaces" => Ok(json!(store.get_projects_with_workspaces()?)),
        "markSynced" => {
            let ids = args.ids.clone().unwrap_or_default();
            store.mark_as_synced(&ids)?;
            Ok(json!({ "success": true, "count": ids.len() }))
        }
        "unsyncedCount" => Ok(json!(store.pending_sync_operations()?.len())),
        "saveAsset" => {
            let field = |key: &str| data.get(key).and_then(Value::as_str).unwrap_or("");
            Ok(json!(store.save_asset(field("data"), field("ext"))?))
        }
        "readAsset" => Ok(store.read_asset(id)?.map_or(Value::Null, Value::String)),
        other => Err(Error::InvalidInput(format!("unknown operation: {other}"))),
    }
}

/// Where the app's data currently comes from.
#[derive(Clone)]
pub enum Source {
    Local(std::sync::Arc<FileStore>),
    Remote(RemoteClient),
}

impl Source {
    pub fn query(&self, args: &QueryArgs) -> Result<Value> {
        match self {
            Source::Local(store) => execute(store, args),
            Source::Remote(client) => client.query(args),
        }
    }
}

/// Generates a random access token for sharing.
pub fn generate_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Best-effort guess of this machine's LAN address, for display only.
pub fn local_ip() -> Option<String> {
    // Connecting a UDP socket sends no packets; it only selects a route.
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    if ip.is_unspecified() || ip.is_loopback() {
        None
    } else {
        Some(ip.to_string())
    }
}
