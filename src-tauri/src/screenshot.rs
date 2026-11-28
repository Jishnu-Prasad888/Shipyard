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
    let path = uri
        .strip_prefix("file://")
        .map(|p| {
            percent_encoding::percent_decode_str(p)
                .decode_utf8_lossy()
                .into_owned()
        })
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

#[cfg(not(target_os = "linux"))]
async fn capture(_interactive: bool) -> Result<Option<Capture>, String> {
    Err("Screenshots are only supported on Linux so far.".into())
}
