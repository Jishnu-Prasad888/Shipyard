//! Shares a local folder over the network so other Shipyard instances can
//! open it by IP address.
//!
//! Endpoints (JSON over HTTP):
//! - `GET  /health`      liveness check, no token needed
//! - `GET  /api/info`    folder name and format
//! - `POST /api/query`   body: [`QueryArgs`], returns `{ "ok": true, "data": ... }`
//!
//! Every `/api` request must carry `Authorization: Bearer <token>`.

use serde_json::{json, Value};
use std::io::Read;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;
use tiny_http::{Header, Method, Request, Response, Server};

use crate::{execute, Error, FileStore, QueryArgs, Result};

const MAX_BODY_BYTES: u64 = 64 * 1024 * 1024;
const WORKERS: usize = 4;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// Interface to bind, e.g. `0.0.0.0` for all networks or `127.0.0.1`.
    pub host: String,
    pub port: u16,
    pub token: String,
    pub read_only: bool,
}

pub struct ServerHandle {
    addr: SocketAddr,
    stop: Arc<AtomicBool>,
    workers: Vec<JoinHandle<()>>,
    pub config: ServerConfig,
}

impl ServerHandle {
    pub fn port(&self) -> u16 {
        self.addr.port()
    }

    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        for worker in self.workers.drain(..) {
            let _ = worker.join();
        }
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub fn start(store: Arc<FileStore>, config: ServerConfig) -> Result<ServerHandle> {
    if config.token.trim().is_empty() {
        return Err(Error::InvalidInput(
            "an access token is required to share a folder".into(),
        ));
    }
    let bind = format!("{}:{}", config.host, config.port);
    let server = Server::http(&bind)
        .map_err(|e| Error::InvalidInput(format!("could not listen on {bind}: {e}")))?;
    let addr = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| Error::InvalidInput("server is not bound to an IP address".into()))?;

    let server = Arc::new(server);
    let stop = Arc::new(AtomicBool::new(false));
    let mut workers = Vec::with_capacity(WORKERS);
    for _ in 0..WORKERS {
        let server = server.clone();
        let stop = stop.clone();
        let store = store.clone();
        let config = config.clone();
        workers.push(std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                match server.recv_timeout(Duration::from_millis(250)) {
                    Ok(Some(request)) => handle(&store, &config, request),
                    Ok(None) => {}
                    Err(_) => break,
                }
            }
        }));
    }

    Ok(ServerHandle {
        addr,
        stop,
        workers,
        config,
    })
}

fn json_response(status: u16, body: &Value) -> Response<std::io::Cursor<Vec<u8>>> {
    let header = Header::from_bytes("Content-Type", "application/json").unwrap();
    Response::from_data(body.to_string().into_bytes())
        .with_status_code(status)
        .with_header(header)
}

fn authorized(request: &Request, token: &str) -> bool {
    request.headers().iter().any(|h| {
        if h.field.equiv("Authorization") {
            let value = h.value.as_str();
            let presented = value.strip_prefix("Bearer ").unwrap_or(value).trim();
            constant_time_eq(presented.as_bytes(), token.as_bytes())
        } else {
            false
        }
    })
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn is_write(operation: &str) -> bool {
    matches!(
        operation,
        "create" | "update" | "delete" | "markSynced" | "saveAsset"
    )
}

fn handle(store: &FileStore, config: &ServerConfig, mut request: Request) {
    let path = request.url().split('?').next().unwrap_or("").to_string();
    let method = request.method().clone();

    let response = match (method, path.as_str()) {
        (Method::Get, "/health") => json_response(200, &json!({ "status": "ok" })),
        (_, p) if p.starts_with("/api/") && !authorized(&request, &config.token) => json_response(
            401,
            &json!({ "ok": false, "error": "invalid or missing access token" }),
        ),
        (Method::Get, "/api/info") => {
            let name = store
                .root()
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Shared folder");
            json_response(
                200,
                &json!({
                    "ok": true,
                    "data": {
                        "name": name,
                        "format": crate::store::FORMAT,
                        "version": crate::store::FORMAT_VERSION,
                        "readOnly": config.read_only,
                    }
                }),
            )
        }
        (Method::Post, "/api/query") => {
            let mut body = Vec::new();
            let read = request
                .as_reader()
                .take(MAX_BODY_BYTES + 1)
                .read_to_end(&mut body);
            if read.is_err() || body.len() as u64 > MAX_BODY_BYTES {
                json_response(413, &json!({ "ok": false, "error": "request too large" }))
            } else {
                match serde_json::from_slice::<QueryArgs>(&body) {
                    Err(e) => json_response(400, &json!({ "ok": false, "error": e.to_string() })),
                    Ok(args) if config.read_only && is_write(&args.operation) => json_response(
                        403,
                        &json!({ "ok": false, "error": "this folder is shared read-only" }),
                    ),
                    Ok(args) => match execute(store, &args) {
                        Ok(data) => json_response(200, &json!({ "ok": true, "data": data })),
                        Err(e) => {
                            json_response(400, &json!({ "ok": false, "error": e.to_string() }))
                        }
                    },
                }
            }
        }
        _ => json_response(404, &json!({ "ok": false, "error": "not found" })),
    };
    let _ = request.respond(response);
}
