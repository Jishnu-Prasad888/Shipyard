//! Screenshots through the desktop's screenshot portal
//! (org.freedesktop.portal.Screenshot), which works on Wayland and X11.
//!
//! Shipyard hides its window while the capture runs, so you can clip what is
//! behind it (like OneNote's screen clipping), then shows it again.

use serde::Serialize;
use std::time::Duration;
use tauri::WebviewWindow;

#[derive(Serialize)]
pub struct Capture {
    /// Base64 PNG data.
    pub data: String,
    pub ext: String,
    /// Where the desktop saved the screenshot, when it is a local file.
    pub path: Option<String>,
}

/// `mode` is "area" (the desktop's interactive picker) or "full" (the whole
/// screen, no dialog). Resolves to `None` when the user cancels.
#[tauri::command]
pub async fn screenshot_capture(
    window: WebviewWindow,
    mode: String,
) -> Result<Option<Capture>, String> {
    let interactive = match mode.as_str() {
        "area" => true,
        "full" => false,
        other => return Err(format!("unknown screenshot mode: {other}")),
    };

    if !cfg!(target_os = "linux") {
        // Don't hide the window for a capture that can't happen.
        return Err("Screenshots are only supported on Linux so far.".into());
    }

    let was_visible = window.is_visible().unwrap_or(true);
    if was_visible {
        let _ = window.hide();
        // Give the compositor time to remove the window before capturing.
        tokio::time::sleep(Duration::from_millis(350)).await;
    }
    let result = capture(interactive).await;
    if was_visible {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    result
}

#[cfg(target_os = "linux")]
async fn capture(interactive: bool) -> Result<Option<Capture>, String> {
    use ashpd::desktop::screenshot::Screenshot;
    use base64::Engine;

    let request = Screenshot::request()
        .interactive(interactive)
        .modal(true)
        .send()
        .await
        .map_err(|e| format!("could not start the screenshot: {e}"))?;
    let response = match request.response() {
        Ok(response) => response,
        Err(ashpd::Error::Response(ashpd::desktop::ResponseError::Cancelled)) => return Ok(None),
        Err(e) => return Err(format!("screenshot failed: {e}")),
    };

    let uri = response.uri().as_str().to_string();
    let path = file_uri_to_path(&uri)
        .ok_or_else(|| format!("the screenshot was not saved to a local file ({uri})"))?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("could not read the screenshot {path}: {e}"))?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| matches!(e.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp"))
        .unwrap_or_else(|| "png".into());
    Ok(Some(Capture {
        data: base64::engine::general_purpose::STANDARD.encode(bytes),
        ext,
        path: Some(path),
    }))
}

/// `file:///a/b%20c.png` or `file://localhost/a/b.png` to `/a/b c.png`.
#[cfg(target_os = "linux")]
fn file_uri_to_path(uri: &str) -> Option<String> {
    let rest = uri.strip_prefix("file://")?;
    // An authority (host) part, if any, ends at the first slash.
    let (host, path) = match rest.find('/') {
        Some(0) => ("", rest),
        Some(i) => (&rest[..i], &rest[i..]),
        None => return None,
    };
    if !host.is_empty() && host != "localhost" {
        return None;
    }
    Some(
        percent_encoding::percent_decode_str(path)
            .decode_utf8_lossy()
            .into_owned(),
    )
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::file_uri_to_path;

    #[test]
    fn file_uris_become_paths() {
        assert_eq!(
            file_uri_to_path("file:///home/u/Pictures/Screenshot%20at%2010.png").as_deref(),
            Some("/home/u/Pictures/Screenshot at 10.png")
        );
        assert_eq!(
            file_uri_to_path("file://localhost/tmp/s.png").as_deref(),
            Some("/tmp/s.png")
        );
        assert_eq!(file_uri_to_path("file://otherhost/tmp/s.png"), None);
        assert_eq!(file_uri_to_path("https://example.com/s.png"), None);
    }
}

#[cfg(not(target_os = "linux"))]
async fn capture(_interactive: bool) -> Result<Option<Capture>, String> {
    Err("Screenshots are only supported on Linux so far.".into())
}
