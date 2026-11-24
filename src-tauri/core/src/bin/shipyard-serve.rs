//! Headless sharing server: serves a Shipyard folder on the network so the
//! desktop app on other machines can open it by IP address. Useful on a NAS,
//! home server or any machine without a desktop session.
//!
//! ```text
//! shipyard-serve <folder> [--host 0.0.0.0] [--port 7420] [--token TOKEN] [--read-only]
//! ```
//!
//! The token can also come from the `SHIPYARD_TOKEN` environment variable.
//! When neither is given a random token is generated and printed.

use shipyard_core::{generate_token, local_ip, server, FileStore, ServerConfig, DEFAULT_PORT};
use std::sync::Arc;

fn usage() -> ! {
    eprintln!(
        "usage: shipyard-serve <folder> [--host HOST] [--port PORT] [--token TOKEN] [--read-only]"
    );
    std::process::exit(2);
}

fn main() {
    let mut args = std::env::args().skip(1);
    let mut folder: Option<String> = None;
    let mut host = "0.0.0.0".to_string();
    let mut port = DEFAULT_PORT;
    let mut token = std::env::var("SHIPYARD_TOKEN")
        .ok()
        .filter(|t| !t.is_empty());
    let mut read_only = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--host" => host = args.next().unwrap_or_else(|| usage()),
            "--port" => {
                port = args
                    .next()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or_else(|| usage())
            }
            "--token" => token = Some(args.next().unwrap_or_else(|| usage())),
            "--read-only" => read_only = true,
            "-h" | "--help" => usage(),
            other if folder.is_none() && !other.starts_with("--") => folder = Some(other.into()),
            _ => usage(),
        }
    }

    let folder = folder.unwrap_or_else(|| usage());
    let store = match FileStore::open(&folder) {
        Ok(store) => Arc::new(store),
        Err(e) => {
            eprintln!("could not open {folder}: {e}");
            std::process::exit(1);
        }
    };
    let token = token.unwrap_or_else(generate_token);
    let config = ServerConfig {
        host: host.clone(),
        port,
        token: token.clone(),
        read_only,
    };

    let handle = match server::start(store.clone(), config) {
        Ok(handle) => handle,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };

    let shown_host = if host == "0.0.0.0" {
        local_ip().unwrap_or_else(|| "<this-machine-ip>".into())
    } else {
        host
    };
    println!("Sharing {}", store.root().display());
    println!("Address: {}:{}", shown_host, handle.port());
    println!("Token:   {token}");
    if read_only {
        println!("Mode:    read-only");
    }
    println!("In Shipyard choose \"Connect to a shared folder\" and enter the address and token.");

    loop {
        std::thread::park();
    }
}
