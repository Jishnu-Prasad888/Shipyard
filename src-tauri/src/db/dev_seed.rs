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
                DELETE FROM subtasks;
                DELETE FROM tasks;
                DELETE FROM columns;
                DELETE FROM statuses;
                DELETE FROM boards;
                DELETE FROM projects;
                DELETE FROM workspaces;
                DELETE FROM tags;
                "#,
            )?;
        } else {
            let project_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
                .unwrap_or(0);

            should_seed = project_count == 0;
        }
    }

    if !should_seed {
        return Ok(());
    }

    let now = now_ms();
    let day = 86_400_000_i64;
    let start = now - day * 5;

    // ── Shared tag objects (re-used in tasks) ──
    let tag_customer = json!({ "id": "tag-customer", "name": "Customer", "color": "#f59e0b" });
    let tag_reliability =
        json!({ "id": "tag-reliability", "name": "Reliability", "color": "#10b981" });
    let tag_ai = json!({ "id": "tag-ai", "name": "AI", "color": "#a855f7" });
    let tag_ops = json!({ "id": "tag-ops", "name": "Ops", "color": "#f97316" });
    let tag_performance =
        json!({ "id": "tag-performance", "name": "Performance", "color": "#0ea5e9" });
    let tag_ux = json!({ "id": "tag-ux", "name": "UX", "color": "#6366f1" });

    // ── Workspaces ──
    let workspace_data = vec![
        json!({
            "id": "workspace-operations",
            "name": "Operations",
            "color": "#2563eb",
            "createdAt": start,
        }),
        json!({
            "id": "workspace-innovation",
            "name": "Innovation",
            "color": "#a855f7",
            "parentWorkspaceId": "workspace-operations",
            "createdAt": start + day,
        }),
    ];

    for workspace in &workspace_data {
        let _ = db.create("workspaces", workspace)?;
    }

    // ── Projects ──
    let project_data = vec![
        json!({
            "id": "project-planning",
            "name": "Quarterly Planning",
            "description": "Quarterly planning and delivery readiness.",
            "workspaceId": "workspace-operations",
            "tags": ["planning", "delivery"],
            "color": "#0ea5e9",
            "boardIds": ["board-roadmap", "board-release"],
            "createdAt": start + day * 2,
            "updatedAt": now - day,
        }),
        json!({
            "id": "project-research",
            "name": "Discovery Lab",
            "description": "Research spikes and prototype ideas.",
            "workspaceId": "workspace-innovation",
            "tags": ["experiments", "ml"],
            "color": "#8b5cf6",
            "boardIds": ["board-lab"],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "project-operations",
            "name": "Service Operations",
            "description": "Runbooks, SLOs, and incident practice.",
            "tags": ["runbooks", "oncall"],
            "color": "#f97316",
            "boardIds": ["board-ops"],
            "createdAt": start + day * 2,
            "updatedAt": now,
        }),
    ];

    for project in &project_data {
        let _ = db.create("projects", project)?;
    }

    // ── Boards ──
    let board_data = vec![
        json!({
            "id": "board-roadmap",
            "name": "Q3 Roadmap",
            "description": "Map the core work for the quarter.",
            "projectId": "project-planning",
            "color": "#0ea5e9",
            "tags": ["roadmap", "delivery"],
            "createdAt": start + day * 2,
            "updatedAt": now - day,
        }),
        json!({
            "id": "board-release",
            "name": "Release Train",
            "description": "Stability, QA, and rollout readiness.",
            "projectId": "project-planning",
            "color": "#10b981",
            "tags": ["stability", "qa"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "board-lab",
            "name": "AI Sketches",
            "description": "Research prototypes and spikes.",
            "projectId": "project-research",
            "color": "#a855f7",
            "tags": ["experiments", "ml"],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "board-ops",
            "name": "Runbook",
            "description": "Keep on-call calm and predictable.",
            "projectId": "project-operations",
            "color": "#f97316",
            "tags": ["ops", "oncall"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
    ];

    for board in &board_data {
        let _ = db.create("boards", board)?;
    }

    // ── Columns ──
    let column_data = vec![
        // Roadmap
        json!({"id": "column-roadmap-ideas", "name": "Discovery", "boardId": "board-roadmap", "order": 0, "color": "#0ea5e9", "createdAt": start + day * 2, "updatedAt": now - day}),
        json!({"id": "column-roadmap-build", "name": "Build", "boardId": "board-roadmap", "order": 1, "color": "#f59e0b", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "column-roadmap-ready", "name": "Ready", "boardId": "board-roadmap", "order": 2, "color": "#10b981", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        // Release
        json!({"id": "column-release-queue", "name": "QA Queue", "boardId": "board-release", "order": 0, "color": "#38bdf8", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "column-release-hardening", "name": "Hardening", "boardId": "board-release", "order": 1, "color": "#f97316", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "column-release-complete", "name": "Complete", "boardId": "board-release", "order": 2, "color": "#10b981", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        // Lab
        json!({"id": "column-lab-ideas", "name": "Ideas", "boardId": "board-lab", "order": 0, "color": "#a855f7", "createdAt": start + day * 3, "updatedAt": now - day / 2}),
        json!({"id": "column-lab-prototype", "name": "Prototype", "boardId": "board-lab", "order": 1, "color": "#0ea5e9", "createdAt": start + day * 3, "updatedAt": now - day / 2}),
        json!({"id": "column-lab-showcase", "name": "Showcase", "boardId": "board-lab", "order": 2, "color": "#22c55e", "createdAt": start + day * 3, "updatedAt": now - day / 3}),
        // Ops
        json!({"id": "column-ops-triage", "name": "Triage", "boardId": "board-ops", "order": 0, "color": "#ef4444", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "column-ops-active", "name": "Active", "boardId": "board-ops", "order": 1, "color": "#3b82f6", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        json!({"id": "column-ops-done", "name": "Resolved", "boardId": "board-ops", "order": 2, "color": "#10b981", "createdAt": start + day * 2, "updatedAt": now - day / 4}),
    ];

    for column in &column_data {
        let _ = db.create("columns", column)?;
    }

    // ── Statuses ──
    let status_data = vec![
        // Roadmap
        json!({"id": "status-roadmap-planned", "name": "Planned", "color": "#0ea5e9", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day}),
        json!({"id": "status-roadmap-building", "name": "In Progress", "color": "#f59e0b", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "status-roadmap-ready", "name": "Ready", "color": "#10b981", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
        json!({"id": "status-roadmap-blocked", "name": "Blocked", "color": "#ef4444", "boardId": "board-roadmap", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        // Release
        json!({"id": "status-release-qa", "name": "QA", "color": "#38bdf8", "boardId": "board-release", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "status-release-hardening", "name": "Hardening", "color": "#f97316", "boardId": "board-release", "createdAt": start + day * 2, "updatedAt": now - day / 2}),
        json!({"id": "status-release-complete", "name": "Complete", "color": "#10b981", "boardId": "board-release", "createdAt": start + day * 2, "updatedAt": now - day / 3}),
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

    // ── Tasks ──
    let task_data = vec![
        // Roadmap
        json!({
            "id": "task-guided-tour",
            "title": "Guided tour storyboard",
            "description": "Map the first 5 minutes in the app for new users.",
            "columnId": "column-roadmap-ideas",
            "boardId": "board-roadmap",
            "order": 0,
            "color": "#0ea5e9",
            "tags": [tag_customer.clone(), tag_ux.clone()],
            "deadline": now + day * 4,
            "status": {"id": "status-roadmap-planned", "name": "Planned", "color": "#0ea5e9", "boardId": "board-roadmap"},
            "notes": "Draft flows in Excalidraw so we can react together.",
            "connectedTaskIds": [],
            "connectedColumnIds": ["column-roadmap-build"],
            "createdAt": start + day * 2,
            "updatedAt": now - day,
        }),
        json!({
            "id": "task-offline-mode",
            "title": "Offline mode spike",
            "description": "Cache the main workspace so work continues without a connection.",
            "columnId": "column-roadmap-build",
            "boardId": "board-roadmap",
            "order": 0,
            "color": "#f59e0b",
            "tags": [tag_performance.clone(), tag_reliability.clone()],
            "deadline": now + day * 2,
            "status": {"id": "status-roadmap-building", "name": "In Progress", "color": "#f59e0b", "boardId": "board-roadmap"},
            "notes": "Prototype storage, sync queue, and conflict handling.",
            "connectedTaskIds": ["task-changelog"],
            "connectedColumnIds": ["column-roadmap-ready"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "task-changelog",
            "title": "Release communications kit",
            "description": "Prep release notes, demo script, and screenshots.",
            "columnId": "column-roadmap-ready",
            "boardId": "board-roadmap",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_customer.clone()],
            "deadline": now + day,
            "status": {"id": "status-roadmap-ready", "name": "Ready", "color": "#10b981", "boardId": "board-roadmap"},
            "notes": "Share across marketing and success teams.",
            "connectedTaskIds": ["task-offline-mode"],
            "connectedColumnIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
        json!({
            "id": "task-auth-edge",
            "title": "SSO edge cases",
            "description": "Handle IdP metadata rotation and clock skew.",
            "columnId": "column-roadmap-build",
            "boardId": "board-roadmap",
            "order": 1,
            "color": "#ef4444",
            "tags": [tag_reliability.clone()],
            "deadline": now + day * 6,
            "status": {"id": "status-roadmap-blocked", "name": "Blocked", "color": "#ef4444", "boardId": "board-roadmap"},
            "notes": "Waiting on new staging IdP metadata.",
            "connectedTaskIds": [],
            "connectedColumnIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 4,
        }),
        // Release
        json!({
            "id": "task-regression-suite",
            "title": "Regression sweep",
            "description": "Full QA against roadmap features before cutover.",
            "columnId": "column-release-queue",
            "boardId": "board-release",
            "order": 0,
            "color": "#38bdf8",
            "tags": [tag_reliability.clone(), tag_customer.clone()],
            "deadline": now + day,
            "status": {"id": "status-release-qa", "name": "QA", "color": "#38bdf8", "boardId": "board-release"},
            "notes": "Pair with QA to capture gaps and flaky steps.",
            "connectedTaskIds": ["task-load-test"],
            "connectedColumnIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "task-load-test",
            "title": "Load tests for offline sync",
            "description": "Prove sync queue stays under 2s p95 at 10k items.",
            "columnId": "column-release-hardening",
            "boardId": "board-release",
            "order": 0,
            "color": "#0ea5e9",
            "tags": [tag_performance.clone(), tag_reliability.clone()],
            "deadline": now + day * 3,
            "status": {"id": "status-release-hardening", "name": "Hardening", "color": "#f97316", "boardId": "board-release"},
            "notes": "Coordinate with infra for staging capacity.",
            "connectedTaskIds": ["task-regression-suite"],
            "connectedColumnIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "task-release-notes",
            "title": "Release notes ready",
            "description": "Final QA summary, screenshots, and rollout timeline.",
            "columnId": "column-release-complete",
            "boardId": "board-release",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_customer.clone()],
            "deadline": now + day * 2,
            "status": {"id": "status-release-complete", "name": "Complete", "color": "#10b981", "boardId": "board-release"},
            "notes": "Send to early adopters first.",
            "connectedTaskIds": ["task-regression-suite"],
            "connectedColumnIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
        // Lab
        json!({
            "id": "task-voice-research",
            "title": "Voice command research",
            "description": "Rough prototype for voice-triggered actions in boards.",
            "columnId": "column-lab-ideas",
            "boardId": "board-lab",
            "order": 0,
            "color": "#a855f7",
            "tags": [tag_ai.clone(), tag_ux.clone()],
            "deadline": now + day * 7,
            "status": {"id": "status-lab-idea", "name": "Idea", "color": "#a855f7", "boardId": "board-lab"},
            "notes": "Figure out wake words and offline support.",
            "connectedTaskIds": ["task-ai-summary"],
            "connectedColumnIds": [],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "task-ai-summary",
            "title": "AI meeting summary",
            "description": "Turn long planning calls into a concise action list.",
            "columnId": "column-lab-prototype",
            "boardId": "board-lab",
            "order": 0,
            "color": "#22c55e",
            "tags": [tag_ai.clone(), tag_customer.clone()],
            "deadline": now + day * 5,
            "status": {"id": "status-lab-testing", "name": "Exploring", "color": "#0ea5e9", "boardId": "board-lab"},
            "notes": "Prototype summaries in 3 bullet points with next steps.",
            "connectedTaskIds": ["task-voice-research"],
            "connectedColumnIds": ["column-lab-showcase"],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "task-whiteboard-share",
            "title": "Whiteboard sync",
            "description": "Live share drawings from the canvas into tasks.",
            "columnId": "column-lab-showcase",
            "boardId": "board-lab",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_ai.clone(), tag_ux.clone()],
            "deadline": now + day * 4,
            "status": {"id": "status-lab-demo", "name": "Demo Ready", "color": "#22c55e", "boardId": "board-lab"},
            "notes": "Show latency under poor network conditions.",
            "connectedTaskIds": [],
            "connectedColumnIds": [],
            "createdAt": start + day * 3,
            "updatedAt": now - day / 3,
        }),
        // Ops
        json!({
            "id": "task-incident-drill",
            "title": "Incident drill",
            "description": "Dry-run the playbook with last week's outage notes.",
            "columnId": "column-ops-triage",
            "boardId": "board-ops",
            "order": 0,
            "color": "#ef4444",
            "tags": [tag_ops.clone()],
            "deadline": now - day,
            "status": {"id": "status-ops-triage", "name": "Triage", "color": "#ef4444", "boardId": "board-ops"},
            "notes": "Time the drill and capture gaps in the runbook.",
            "connectedTaskIds": ["task-alert-tuning"],
            "connectedColumnIds": ["column-ops-active"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 2,
        }),
        json!({
            "id": "task-alert-tuning",
            "title": "Alert tuning",
            "description": "Reduce noisy alerts and group related signals.",
            "columnId": "column-ops-active",
            "boardId": "board-ops",
            "order": 0,
            "color": "#3b82f6",
            "tags": [tag_ops.clone(), tag_performance.clone()],
            "deadline": now + day,
            "status": {"id": "status-ops-active", "name": "Working", "color": "#3b82f6", "boardId": "board-ops"},
            "notes": "Measure alert-to-ticket ratio after changes.",
            "connectedTaskIds": ["task-incident-drill"],
            "connectedColumnIds": ["column-ops-done"],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 3,
        }),
        json!({
            "id": "task-postmortem",
            "title": "Post-incident review",
            "description": "Summarize findings and file follow-ups.",
            "columnId": "column-ops-done",
            "boardId": "board-ops",
            "order": 0,
            "color": "#10b981",
            "tags": [tag_ops.clone(), tag_reliability.clone()],
            "deadline": now + day * 2,
            "status": {"id": "status-ops-done", "name": "Ready", "color": "#10b981", "boardId": "board-ops"},
            "notes": "Share with the wider team and add to the handbook.",
            "connectedTaskIds": ["task-alert-tuning"],
            "connectedColumnIds": [],
            "createdAt": start + day * 2,
            "updatedAt": now - day / 4,
        }),
    ];

    for task in &task_data {
        let _ = db.create("tasks", task)?;
    }

    // ── Subtasks ──
    let subtask_data = vec![
        json!({"id": "subtask-offline-cache", "title": "Cache auth'd API responses", "completed": false, "taskId": "task-offline-mode", "createdAt": now - day / 2}),
        json!({"id": "subtask-offline-replay", "title": "Queue mutations for replay", "completed": false, "taskId": "task-offline-mode", "createdAt": now - day / 2}),
        json!({"id": "subtask-loadtest-scripts", "title": "Write locust scenarios", "completed": true, "taskId": "task-load-test", "createdAt": now - day / 2}),
        json!({"id": "subtask-loadtest-metrics", "title": "Capture p95 and error rate", "completed": false, "taskId": "task-load-test", "createdAt": now - day / 2}),
        json!({"id": "subtask-ai-summary", "title": "Tune summarizer prompts", "completed": false, "taskId": "task-ai-summary", "createdAt": now - day / 2}),
        json!({"id": "subtask-incident-drill", "title": "Time the full drill", "completed": false, "taskId": "task-incident-drill", "createdAt": now - day / 2}),
    ];

    for subtask in &subtask_data {
        let _ = db.create("subtasks", subtask)?;
    }

    // ── Connections (board visuals) ──
    let connections = vec![
        json!({
            "id": "conn-roadmap-build-to-ready",
            "fromId": "column-roadmap-build",
            "toId": "column-roadmap-ready",
            "type": "column-to-column",
            "points": [{"x": 60.0, "y": 80.0}, {"x": 220.0, "y": 80.0}],
            "boardId": "board-roadmap",
        }),
        json!({
            "id": "conn-offline-to-changelog",
            "fromId": "task-offline-mode",
            "toId": "task-changelog",
            "type": "task-to-task",
            "points": [{"x": 120.0, "y": 96.0}, {"x": 260.0, "y": 140.0}],
            "boardId": "board-roadmap",
        }),
        json!({
            "id": "conn-loadtest-to-regression",
            "fromId": "task-load-test",
            "toId": "task-regression-suite",
            "type": "task-to-task",
            "points": [{"x": 90.0, "y": 90.0}, {"x": 190.0, "y": 120.0}],
            "boardId": "board-release",
        }),
        json!({
            "id": "conn-alerts-to-postmortem",
            "fromId": "task-alert-tuning",
            "toId": "task-postmortem",
            "type": "task-to-task",
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
