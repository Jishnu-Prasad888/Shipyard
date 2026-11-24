//! Client for a folder shared by another machine (see [`crate::server`]).

use serde_json::Value;
use std::io::Read;
use std::time::Duration;

use crate::{Error, QueryArgs, Result, DEFAULT_PORT};

#[derive(Clone)]
pub struct RemoteClient {
    base_url: String,
    token: String,
    agent: ureq::Agent,
}

/// Accepts `192.168.1.20`, `192.168.1.20:7420`, `nas.local`, or a full
/// `http://host:port` URL and returns `http://host:port`.
pub fn normalize_address(address: &str) -> Result<String> {
    let trimmed = address.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(Error::InvalidInput(
            "enter an IP address or host name".into(),
        ));
    }
    if trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    let without_scheme = trimmed.strip_prefix("http://").unwrap_or(trimmed);
    let host_port = without_scheme.split('/').next().unwrap_or(without_scheme);

    // Bare IPv6 addresses need brackets.
    let has_port = if host_port.starts_with('[') {
        host_port.contains("]:")
    } else {
        host_port.matches(':').count() == 1
    };
    let host_port = if has_port {
        host_port.to_string()
    } else if host_port.contains(':') && !host_port.starts_with('[') {
        format!("[{host_port}]:{DEFAULT_PORT}")
    } else {
        format!("{host_port}:{DEFAULT_PORT}")
    };
    Ok(format!("http://{host_port}"))
}

impl RemoteClient {
    pub fn new(address: &str, token: &str) -> Result<Self> {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(5))
            .timeout(Duration::from_secs(60))
            .build();
        Ok(Self {
            base_url: normalize_address(address)?,
            token: token.trim().to_string(),
            agent,
        })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn unwrap_envelope(
        response: std::result::Result<ureq::Response, ureq::Error>,
    ) -> Result<Value> {
        let (status, response) = match response {
            Ok(r) => (r.status(), r),
            Err(ureq::Error::Status(code, r)) => (code, r),
            Err(ureq::Error::Transport(t)) => {
                return Err(Error::Remote(format!(
                    "could not reach the shared folder: {t}"
                )))
            }
        };
        let mut body = Vec::new();
        response
            .into_reader()
            .read_to_end(&mut body)
            .map_err(|e| Error::Remote(format!("connection interrupted: {e}")))?;
        let envelope: Value = serde_json::from_slice(&body).map_err(|_| {
            Error::Remote(format!(
                "unexpected response (HTTP {status}); is this a Shipyard share?"
            ))
        })?;
        if envelope.get("ok").and_then(Value::as_bool) == Some(true) {
            Ok(envelope.get("data").cloned().unwrap_or(Value::Null))
        } else {
            let message = envelope
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("request failed");
            Err(Error::Remote(message.to_string()))
        }
    }

    /// Checks the address and token, returning the share's info.
    pub fn info(&self) -> Result<Value> {
        let response = self
            .agent
            .get(&format!("{}/api/info", self.base_url))
            .set("Authorization", &format!("Bearer {}", self.token))
            .call();
        Self::unwrap_envelope(response)
    }

    pub fn query(&self, args: &QueryArgs) -> Result<Value> {
        let body = serde_json::to_string(args)?;
        let response = self
            .agent
            .post(&format!("{}/api/query", self.base_url))
            .set("Authorization", &format!("Bearer {}", self.token))
            .set("Content-Type", "application/json")
            .send_string(&body);
        Self::unwrap_envelope(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{server, FileStore, ServerConfig};
    use serde_json::json;
    use std::sync::Arc;

    #[test]
    fn normalizes_addresses() {
        assert_eq!(
            normalize_address("192.168.1.5").unwrap(),
            "http://192.168.1.5:7420"
        );
        assert_eq!(
            normalize_address("192.168.1.5:9000").unwrap(),
            "http://192.168.1.5:9000"
        );
        assert_eq!(
            normalize_address("http://nas.local:81/").unwrap(),
            "http://nas.local:81"
        );
        assert_eq!(
            normalize_address("fe80::1").unwrap(),
            "http://[fe80::1]:7420"
        );
        assert_eq!(
            normalize_address("[fe80::1]:99").unwrap(),
            "http://[fe80::1]:99"
        );
        assert!(normalize_address("  ").is_err());
    }

    #[test]
    fn remote_client_reads_and_writes_a_shared_folder() {
        let dir = std::env::temp_dir().join(format!("shipyard-share-{}", uuid::Uuid::new_v4()));
        let store = Arc::new(FileStore::open(&dir).unwrap());
        let handle = server::start(
            store.clone(),
            ServerConfig {
                host: "127.0.0.1".into(),
                port: 0,
                token: "secret".into(),
                read_only: false,
            },
        )
        .unwrap();
        let address = format!("127.0.0.1:{}", handle.port());

        let client = RemoteClient::new(&address, "secret").unwrap();
        assert_eq!(client.info().unwrap()["format"], "shipyard-folder");

        let create = QueryArgs {
            operation: "create".into(),
            table: Some("projects".into()),
            data: Some(json!({"id": "p1", "name": "Remote project"})),
            ..Default::default()
        };
        client.query(&create).unwrap();
        assert_eq!(
            store.find_by_id("projects", "p1").unwrap().unwrap()["name"],
            "Remote project"
        );

        let all = client
            .query(&QueryArgs {
                operation: "findAll".into(),
                table: Some("projects".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(all.as_array().unwrap().len(), 1);

        let bad_token = RemoteClient::new(&address, "wrong").unwrap();
        assert!(bad_token.info().is_err());

        let bad_query = client.query(&QueryArgs {
            operation: "findAll".into(),
            table: Some("../secrets".into()),
            ..Default::default()
        });
        assert!(bad_query.is_err());

        handle.stop();
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn read_only_shares_reject_writes() {
        let dir = std::env::temp_dir().join(format!("shipyard-share-{}", uuid::Uuid::new_v4()));
        let store = Arc::new(FileStore::open(&dir).unwrap());
        let handle = server::start(
            store,
            ServerConfig {
                host: "127.0.0.1".into(),
                port: 0,
                token: "t".into(),
                read_only: true,
            },
        )
        .unwrap();
        let client = RemoteClient::new(&format!("127.0.0.1:{}", handle.port()), "t").unwrap();
        let result = client.query(&QueryArgs {
            operation: "create".into(),
            table: Some("tags".into()),
            data: Some(json!({"name": "x"})),
            ..Default::default()
        });
        assert!(result.is_err());
        handle.stop();
        std::fs::remove_dir_all(dir).ok();
    }
}
