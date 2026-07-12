use serde_json::json;

use super::{now_ms, Database};

pub(super) fn seed_demo_data(db: &Database, force_reset: bool) -> rusqlite::Result<()> {
    // Only seed when running a debug/dev build
    if !cfg!(debug_assertions) {
        return Ok(());
    }

    let mut should_seed = force_reset;

    {
        let conn = db.conn.lock().unwrap();

        if force_reset {
            conn.execute_batch(
                r#"
                DELETE FROM sync_queue;
                DELETE FROM connections;
                DELETE FROM subcards;
                DELETE FROM cards;
                DELETE FROM lists;
                DELETE FROM statuses;
                DELETE FROM boards;
                DELETE FROM docks;
                DELETE FROM folders;
                DELETE FROM tags;
                "#,
            )?;
        } else {
            let dock_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM docks", [], |r| r.get(0))
                .unwrap_or(0);

            should_seed = dock_count == 0;
        }
    }

    if !should_seed {
        return Ok(());
    }

    let now = now_ms();
    let day = 86_400_000_i64;
    let start = now - day * 5;

    // ── Shared tag objects (re-used in cards) ──
    let tag_customer = json!({ "id": "tag-customer", "name": "Customer", "color": "#f59e0b" });
    let tag_reliability = json!({ "id": "tag-reliability", "name": "Reliability", "color": "#10b981" });
    let tag_ai = json!({ "id": "tag-ai", "name": "AI", "color": "#a855f7" });
    let tag_ops = json!({ "id": "tag-ops", "name": "Ops", "color": "#f97316" });
    let tag_performance = json!({ "id": "tag-performance", "name": "Performance", "color": "#0ea5e9" });
    let tag_ux = json!({ "id": "tag-ux", "name": "UX", "color": "#6366f1" });

    // ── Folders ──
    let folder_data = vec![
        json!({
            "id": "port-ops",
            "name": "Operations Fleet",
            "color": "#2563eb",
            "createdAt": start,
        }),
        json!({
            "id": "port-innovation",
            "name": "Innovation Wharf",
            "color": "#a855f7",
            "parentId": "port-ops",
            "createdAt": start + day,
        }),
    ];

    for folder in &folder_data {
        let _ = db.create("folders", folder)?;
    }

    // ── Docks ──
    let dock_data = vec![
        json!({
            "id": "dock-mission",
            "name": "Mission Control",
            "description": "Quarterly planning and launch readiness.",
            "folderId": "port-ops",
            "tags": ["planning", "launch"],
            "color": "#0ea5e9",
            "boardIds": ["board-roadmap", "board-release"],
            "createdAt": start + day * 2,
            "updatedAt": now - day,
        }),
        json!({
            "id": "dock-discovery",
            "name": "Discovery Lab",
            "description": "Research spikes and prototype ideas.",
            "folderId": "port-innovation",
            "tags": ["experiments", "ml"],
            "color": "#8b5cf6",
            "boardIds": ["board-lab"],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "dock-ops",
            "name": "Harbor Ops",
            "description": "Runbooks, SLOs, and incident practice.",
            "tags": ["runbooks", "oncall"],
            "color": "#f97316",
            "boardIds": ["board-ops"],
            "createdAt": start + day * 2,
            "updatedAt": now,
        }),
    ];

    for dock in &dock_data {
        let _ = db.create("docks", dock)?;
    }

    // ── Boards ──
    let board_data = vec![
        json!({
            "id": "board-roadmap",
            "name": "Q3 Roadmap",
            "description": "Map the core work for the quarter.",
            "dockId": "dock-mission",
            "color": "#0ea5e9",
            "tags": ["roadmap", "launch"],
            "createdAt": start + day * 2,
            "updatedAt": now - day,
        }),
        json!({
            "id": "board-release",
            "name": "Release Train",
            "description": "Stability, QA, and rollout readiness.",
            "dockId": "dock-mission",
            "color": "#10b981",
            "tags": ["stability", "qa"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "board-lab",
            "name": "AI Sketches",
            "description": "Research prototypes and spikes.",
            "dockId": "dock-discovery",
            "color": "#a855f7",
            "tags": ["experiments", "ml"],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "board-ops",
            "name": "Runbook",
            "description": "Keep on-call calm and predictable.",
            "dockId": "dock-ops",
            "color": "#f97316",
            "tags": ["ops", "oncall"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
    ];

    for board in &board_data {
        let _ = db.create("boards", board)?;
    }

    // ── Lists ──
    let list_data = vec![
        // Roadmap
        json!({"id": "list-roadmap-ideas", "name": "Discovery", "boardId": "board-roadmap", "order": 0, "color": "#0ea5e9", "createdAt": start + day * 2, "updatedAt": now - day}),
        json!({"id": "list-roadmap-build", "name": "Build", "boardId": "board-roadmap", "order": 1, "color": "#f59e0b", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "list-roadmap-launch", "name": "Launch Ready", "boardId": "board-roadmap", "order": 2, "color": "#10b981", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        // Release
        json!({"id": "list-release-queue", "name": "QA Queue", "boardId": "board-release", "order": 0, "color": "#38bdf8", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "list-release-hardening", "name": "Hardening", "boardId": "board-release", "order": 1, "color": "#f97316", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "list-release-shipped", "name": "Shipped", "boardId": "board-release", "order": 2, "color": "#10b981", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        // Lab
        json!({"id": "list-lab-ideas", "name": "Ideas", "boardId": "board-lab", "order": 0, "color": "#a855f7", "createdAt": start + day * 3, "updatedAt": now - day / 2}),
        json!({"id": "list-lab-prototype", "name": "Prototype", "boardId": "board-lab", "order": 1, "color": "#0ea5e9", "createdAt": start + day * 3, "updatedAt": now - day / 2}),
        json!({"id": "list-lab-showcase", "name": "Showcase", "boardId": "board-lab", "order": 2, "color": "#22c55e", "createdAt": start + day * 3, "updatedAt": now - day / 3}),
        // Ops
        json!({"id": "list-ops-triage", "name": "Triage", "boardId": "board-ops", "order": 0, "color": "#ef4444", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "list-ops-active", "name": "Active", "boardId": "board-ops", "order": 1, "color": "#3b82f6", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        json!({"id": "list-ops-done", "name": "Resolved", "boardId": "board-ops", "order": 2, "color": "#10b981", "createdAt": start + day * 2, "updatedAt": now - day / 4}),
    ];

    for list in &list_data {
        let _ = db.create("lists", list)?;
    }

    // ── Statuses ──
    let status_data = vec![
        // Roadmap
        json!({"id": "status-roadmap-planned", "name": "Planned", "color": "#0ea5e9", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day}),
        json!({"id": "status-roadmap-building", "name": "In Flight", "color": "#f59e0b", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "status-roadmap-ready", "name": "Ready to Ship", "color": "#10b981", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        json!({"id": "status-roadmap-blocked", "name": "Blocked", "color": "#ef4444", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        // Release
        json!({"id": "status-release-qa", "name": "QA", "color": "#38bdf8", "boardId": "board-release", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "status-release-hardening", "name": "Hardening", "color": "#f97316", "boardId": "board-release", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "status-release-shipped", "name": "Shipped", "color": "#10b981", "boardId": "board-release", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        // Lab
        json!({"id": "status-lab-idea", "name": "Idea", "color": "#a855f7", "boardId": "board-lab", "createdAt": start + day * 3, "updatedAt": now - day / 2}),
        json!({"id": "status-lab-testing", "name": "Exploring", "color": "#0ea5e9", "boardId": "board-lab", "createdAt": start + day * 3, "updatedAt": now - day / 2}),
        json!({"id": "status-lab-demo", "name": "Demo Ready", "color": "#22c55e", "boardId": "board-lab", "createdAt": start + day * 3, "updatedAt": now - day / 3}),
        // Ops
        json!({"id": "status-ops-triage", "name": "Triage", "color": "#ef4444", "boardId": "board-ops", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "status-ops-active", "name": "Working", "color": "#3b82f6", "boardId": "board-ops", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        json!({"id": "status-ops-done", "name": "Ready", "color": "#10b981", "boardId": "board-ops", "createdAt": start + day * 2, "updatedAt": now - day / 4}),
    ];

    for status in &status_data {
        let _ = db.create("statuses", status)?;
    }

    // ── Cards ──
    let card_data = vec![
        // Roadmap
        json!({
            "id": "card-guided-tour",
            "title": "Guided tour storyboard",
            "description": "Map the first 5 minutes in the app for new captains.",
            "listId": "list-roadmap-ideas",
            "boardId": "board-roadmap",
            "order": 0,
            "color": "#0ea5e9",
            "tags": [tag_customer.clone(), tag_ux.clone()],
            "deadline": now + day * 4,
            "status": {"id": "status-roadmap-planned", "name": "Planned", "color": "#0ea5e9", "boardId": "board-roadmap"},
            "notes": "Draft flows in Excalidraw so we can react together.",
            "connectedCardIds": [],
            "connectedListIds": ["list-roadmap-build"],
            "createdAt": start + day * 2,
            "updatedAt": now - day,
        }),
        json!({
            "id": "card-offline-mode",
            "title": "Offline mode spike",
            "description": "Cache the main workspace so ships keep moving without signal.",
            "listId": "list-roadmap-build",
            "boardId": "board-roadmap",
            "order": 0,
            "color": "#f59e0b",
            "tags": [tag_performance.clone(), tag_reliability.clone()],
            "deadline": now + day * 2,
            "status": {"id": "status-roadmap-building", "name": "In Flight", "color": "#f59e0b", "boardId": "board-roadmap"},
            "notes": "Prototype storage, sync queue, and conflict handling.",
            "connectedCardIds": ["card-changelog"],
            "connectedListIds": ["list-roadmap-launch"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "card-changelog",
            "title": "Launch comms kit",
            "description": "Prep release notes, demo script, and screenshots.",
            "listId": "list-roadmap-launch",
            "boardId": "board-roadmap",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_customer.clone()],
            "deadline": now + day,
            "status": {"id": "status-roadmap-ready", "name": "Ready to Ship", "color": "#10b981", "boardId": "board-roadmap"},
            "notes": "Share across marketing and success teams.",
            "connectedCardIds": ["card-offline-mode"],
            "connectedListIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
        json!({
            "id": "card-auth-edge",
            "title": "SSO edge cases",
            "description": "Handle IdP metadata rotation and clock skew.",
            "listId": "list-roadmap-build",
            "boardId": "board-roadmap",
            "order": 1,
            "color": "#ef4444",
            "tags": [tag_reliability.clone()],
            "deadline": now + day * 6,
            "status": {"id": "status-roadmap-blocked", "name": "Blocked", "color": "#ef4444", "boardId": "board-roadmap"},
            "notes": "Waiting on new staging IdP metadata.",
            "connectedCardIds": [],
            "connectedListIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 4,
        }),
        // Release
        json!({
            "id": "card-regression-suite",
            "title": "Regression sweep",
            "description": "Full QA against roadmap features before cutover.",
            "listId": "list-release-queue",
            "boardId": "board-release",
            "order": 0,
            "color": "#38bdf8",
            "tags": [tag_reliability.clone(), tag_customer.clone()],
            "deadline": now + day,
            "status": {"id": "status-release-qa", "name": "QA", "color": "#38bdf8", "boardId": "board-release"},
            "notes": "Pair with QA to capture gaps and flaky steps.",
            "connectedCardIds": ["card-load-test"],
            "connectedListIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "card-load-test",
            "title": "Load tests for offline sync",
            "description": "Prove sync queue stays under 2s p95 at 10k items.",
            "listId": "list-release-hardening",
            "boardId": "board-release",
            "order": 0,
            "color": "#0ea5e9",
            "tags": [tag_performance.clone(), tag_reliability.clone()],
            "deadline": now + day * 3,
            "status": {"id": "status-release-hardening", "name": "Hardening", "color": "#f97316", "boardId": "board-release"},
            "notes": "Coordinate with infra for staging capacity.",
            "connectedCardIds": ["card-regression-suite"],
            "connectedListIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "card-release-notes",
            "title": "Release notes ready",
            "description": "Final QA summary, screenshots, and rollout timeline.",
            "listId": "list-release-shipped",
            "boardId": "board-release",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_customer.clone()],
            "deadline": now + day * 2,
            "status": {"id": "status-release-shipped", "name": "Shipped", "color": "#10b981", "boardId": "board-release"},
            "notes": "Send to early-adopter crew first.",
            "connectedCardIds": ["card-regression-suite"],
            "connectedListIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
        // Lab
        json!({
            "id": "card-voice-scout",
            "title": "Voice commands scout",
            "description": "Rough prototype for voice-triggered actions in boards.",
            "listId": "list-lab-ideas",
            "boardId": "board-lab",
            "order": 0,
            "color": "#a855f7",
            "tags": [tag_ai.clone(), tag_ux.clone()],
            "deadline": now + day * 7,
            "status": {"id": "status-lab-idea", "name": "Idea", "color": "#a855f7", "boardId": "board-lab"},
            "notes": "Figure out wake words and offline support.",
            "connectedCardIds": ["card-ai-summary"],
            "connectedListIds": [],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "card-ai-summary",
            "title": "AI meeting summary",
            "description": "Turn long planning calls into a concise action list.",
            "listId": "list-lab-prototype",
            "boardId": "board-lab",
            "order": 0,
            "color": "#22c55e",
            "tags": [tag_ai.clone(), tag_customer.clone()],
            "deadline": now + day * 5,
            "status": {"id": "status-lab-testing", "name": "Exploring", "color": "#0ea5e9", "boardId": "board-lab"},
            "notes": "Prototype summaries in 3 bullet points with next steps.",
            "connectedCardIds": ["card-voice-scout"],
            "connectedListIds": ["list-lab-showcase"],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "card-whiteboard-share",
            "title": "Whiteboard sync",
            "description": "Live share drawings from the canvas into cards.",
            "listId": "list-lab-showcase",
            "boardId": "board-lab",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_ai.clone(), tag_ux.clone()],
            "deadline": now + day * 4,
            "status": {"id": "status-lab-demo", "name": "Demo Ready", "color": "#22c55e", "boardId": "board-lab"},
            "notes": "Show latency under poor network conditions.",
            "connectedCardIds": [],
            "connectedListIds": [],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 3,
        }),
        // Ops
        json!({
            "id": "card-incident-drill",
            "title": "Incident drill",
            "description": "Dry-run the playbook with last week's outage notes.",
            "listId": "list-ops-triage",
            "boardId": "board-ops",
            "order": 0,
            "color": "#ef4444",
            "tags": [tag_ops.clone()],
            "deadline": now - day,
            "status": {"id": "status-ops-triage", "name": "Triage", "color": "#ef4444", "boardId": "board-ops"},
            "notes": "Time the drill and capture gaps in the runbook.",
            "connectedCardIds": ["card-alert-tuning"],
            "connectedListIds": ["list-ops-active"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "card-alert-tuning",
            "title": "Alert tuning",
            "description": "Reduce noisy alerts and group related signals.",
            "listId": "list-ops-active",
            "boardId": "board-ops",
            "order": 0,
            "color": "#3b82f6",
            "tags": [tag_ops.clone(), tag_performance.clone()],
            "deadline": now + day,
            "status": {"id": "status-ops-active", "name": "Working", "color": "#3b82f6", "boardId": "board-ops"},
            "notes": "Measure alert-to-ticket ratio after changes.",
            "connectedCardIds": ["card-incident-drill"],
            "connectedListIds": ["list-ops-done"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
        json!({
            "id": "card-postmortem",
            "title": "Post-incident review",
            "description": "Summarize findings and file follow-ups.",
            "listId": "list-ops-done",
            "boardId": "board-ops",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_ops.clone(), tag_reliability.clone()],
            "deadline": now + day * 2,
            "status": {"id": "status-ops-done", "name": "Ready", "color": "#10b981", "boardId": "board-ops"},
            "notes": "Share with the wider crew and add to the handbook.",
            "connectedCardIds": ["card-alert-tuning"],
            "connectedListIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 4,
        }),
    ];

    for card in &card_data {
        let _ = db.create("cards", card)?;
    }

    // ── Subcards / subtasks ──
    let subcard_data = vec![
        json!({"id": "sub-offline-cache", "title": "Cache auth'd API responses", "completed": false, "cardId": "card-offline-mode", "createdAt": now - day / 2}),
        json!({"id": "sub-offline-replay", "title": "Queue mutations for replay", "completed": false, "cardId": "card-offline-mode", "createdAt": now - day / 2}),
        json!({"id": "sub-loadtest-scripts", "title": "Write locust scenarios", "completed": true, "cardId": "card-load-test", "createdAt": now - day / 2}),
        json!({"id": "sub-loadtest-metrics", "title": "Capture p95 and error rate", "completed": false, "cardId": "card-load-test", "createdAt": now - day / 2}),
        json!({"id": "sub-ai-summary", "title": "Tune summarizer prompts", "completed": false, "cardId": "card-ai-summary", "createdAt": now - day / 2}),
        json!({"id": "sub-incident-drill", "title": "Time the full drill", "completed": false, "cardId": "card-incident-drill", "createdAt": now - day / 2}),
    ];

    for sc in &subcard_data {
        let _ = db.create("subcards", sc)?;
    }

    // ── Connections (board visuals) ──
    let connections = vec![
        json!({
            "id": "conn-roadmap-build-to-launch",
            "fromId": "list-roadmap-build",
            "toId": "list-roadmap-launch",
            "type": "list-to-list",
            "points": [{"x": 60.0, "y": 80.0}, {"x": 220.0, "y": 80.0}],
            "boardId": "board-roadmap",
        }),
        json!({
            "id": "conn-offline-to-changelog",
            "fromId": "card-offline-mode",
            "toId": "card-changelog",
            "type": "card-to-card",
            "points": [{"x": 120.0, "y": 96.0}, {"x": 260.0, "y": 140.0}],
            "boardId": "board-roadmap",
        }),
        json!({
            "id": "conn-loadtest-to-regression",
            "fromId": "card-load-test",
            "toId": "card-regression-suite",
            "type": "card-to-card",
            "points": [{"x": 90.0, "y": 90.0}, {"x": 190.0, "y": 120.0}],
            "boardId": "board-release",
        }),
        json!({
            "id": "conn-alerts-to-postmortem",
            "fromId": "card-alert-tuning",
            "toId": "card-postmortem",
            "type": "card-to-card",
            "points": [{"x": 80.0, "y": 70.0}, {"x": 180.0, "y": 110.0}],
            "boardId": "board-ops",
        }),
    ];

    for conn in &connections {
        let _ = db.create("connections", conn)?;
    }

    // ── Tags table (for suggestions) ──
    let tag_rows = vec![
        json!({"id": "tag-customer", "name": "Customer", "color": "#f59e0b", "createdAt": start + day}),
        json!({"id": "tag-reliability", "name": "Reliability", "color": "#10b981", "createdAt": start + day}),
        json!({"id": "tag-ai", "name": "AI", "color": "#a855f7", "createdAt": start + day}),
        json!({"id": "tag-ops", "name": "Ops", "color": "#f97316", "createdAt": start + day}),
        json!({"id": "tag-performance", "name": "Performance", "color": "#0ea5e9", "createdAt": start + day}),
        json!({"id": "tag-ux", "name": "UX", "color": "#6366f1", "createdAt": start + day}),
    ];

    for tag in &tag_rows {
        let _ = db.create("tags", tag)?;
    }

    // Clear sync queue so the seeded data does not appear as unsynced operations
    {
        let conn = db.conn.lock().unwrap();
        conn.execute("DELETE FROM sync_queue", [])?;
    }

    Ok(())
}
