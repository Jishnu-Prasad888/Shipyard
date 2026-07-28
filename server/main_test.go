package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestNormalizeSyncOperations(t *testing.T) {
	tests := []struct {
		name           string
		table          string
		payload        string
		canonicalTable string
		wantPayload    map[string]any
	}{
		{"workspace", "folders", `{"parentId":"root","docks":[{"id":"p1","folderId":"root"}]}`, "workspaces", map[string]any{"parentWorkspaceId": "root", "projects": []any{map[string]any{"id": "p1", "workspaceId": "root"}}}},
		{"project", "docks", `{"folderId":"w1","boardIds":["b1"]}`, "projects", map[string]any{"workspaceId": "w1", "boardIds": []any{"b1"}}},
		{"board", "boards", `{"dockId":"p1","lists":[]}`, "boards", map[string]any{"projectId": "p1", "columns": []any{}}},
		{"column", "lists", `{"boardId":"b1","cards":[]}`, "columns", map[string]any{"boardId": "b1", "tasks": []any{}}},
		{"task", "cards", `{"listId":"c1","boardId":"b1","connectedCardIds":["t2"],"connectedListIds":["c2"],"subCards":[]}`, "tasks", map[string]any{"columnId": "c1", "boardId": "b1", "connectedTaskIds": []any{"t2"}, "connectedColumnIds": []any{"c2"}, "subtasks": []any{}}},
		{"subtask", "subcards", `{"cardId":"t1"}`, "subtasks", map[string]any{"taskId": "t1"}},
		{"connection", "connections", `{"type":"card-to-card","boardId":"b1"}`, "connections", map[string]any{"type": "task-to-task", "boardId": "b1"}},
		{"status", "statuses", `{"name":"Done","boardId":"b1"}`, "statuses", map[string]any{"name": "Done", "boardId": "b1"}},
		{"tag", "tags", `{"name":"Priority"}`, "tags", map[string]any{"name": "Priority"}},
		{"canonical v2", "tasks", `{"columnId":"c1","projectId":"p1"}`, "tasks", map[string]any{"columnId": "c1", "projectId": "p1"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			operations, err := normalizeSyncOperations(SyncRequest{
				SchemaVersion: 1,
				Operations: []SyncOperation{{
					Operation: "update",
					Table:     tt.table,
					RecordID:  "record-1",
					Data:      json.RawMessage(tt.payload),
				}},
			})
			if err != nil {
				t.Fatalf("normalizeSyncOperations() error = %v", err)
			}
			got := operations[0]
			if got.CanonicalTable != tt.canonicalTable {
				t.Fatalf("CanonicalTable = %q, want %q", got.CanonicalTable, tt.canonicalTable)
			}
			if got.AuditTable != tt.table || string(got.AuditPayload) != tt.payload {
				t.Fatalf("audit data changed: table=%q payload=%s", got.AuditTable, got.AuditPayload)
			}

			var payload map[string]any
			if err := json.Unmarshal(got.CanonicalPayload, &payload); err != nil {
				t.Fatalf("canonical payload is invalid: %v", err)
			}
			if !reflect.DeepEqual(payload, tt.wantPayload) {
				t.Errorf("canonical payload = %#v, want %#v", payload, tt.wantPayload)
			}
		})
	}
}

func TestNormalizeDeleteUsesCanonicalStateKey(t *testing.T) {
	operations, err := normalizeSyncOperations(SyncRequest{
		Operations: []SyncOperation{{
			Operation: " delete ",
			Table:     "cards",
			RecordID:  "task-1",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	got := operations[0]
	if got.Operation != "DELETE" || got.CanonicalTable != "tasks" || string(got.CanonicalPayload) != "null" {
		t.Fatalf("delete was not normalized: %#v", got)
	}
}

func TestSyncRoutes(t *testing.T) {
	tests := []struct {
		path        string
		body        string
		wantTable   string
		wantVersion int
	}{
		{"/sync", `{"schemaVersion":1,"source":"shipyard-desktop","operations":[{"id":"event-1","operation":"CREATE","table":"docks","recordId":"project-1","data":{"folderId":"workspace-1"}}]}`, "projects", 1},
		{"/sync/push", `{"operations":[{"id":"event-2","schemaVersion":2,"operation":"UPDATE","table":"columns","recordId":"column-1","payload":{"boardId":"board-1"}}]}`, "columns", 2},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			var captured []normalizedSyncOperation
			srv := &Server{
				applySync: func(_ context.Context, _ string, operations []normalizedSyncOperation) ([]string, error) {
					captured = operations
					return []string{operations[0].ID}, nil
				},
			}
			req := httptest.NewRequest(http.MethodPost, tt.path, bytes.NewBufferString(tt.body))
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()

			srv.routes().ServeHTTP(res, req)

			if res.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", res.Code, res.Body.String())
			}
			if len(captured) != 1 || captured[0].CanonicalTable != tt.wantTable || captured[0].SchemaVersion != tt.wantVersion {
				t.Fatalf("captured operations = %#v", captured)
			}
			var response struct {
				Success       bool     `json:"success"`
				SchemaVersion int      `json:"schemaVersion"`
				SyncedIDs     []string `json:"syncedIds"`
			}
			if err := json.NewDecoder(res.Body).Decode(&response); err != nil {
				t.Fatal(err)
			}
			if !response.Success || response.SchemaVersion != 2 || !reflect.DeepEqual(response.SyncedIDs, []string{captured[0].ID}) {
				t.Fatalf("response = %#v", response)
			}
		})
	}
}

func TestNormalizeRejectsUnsupportedSchemaVersionAndTable(t *testing.T) {
	for _, req := range []SyncRequest{
		{SchemaVersion: 3, Operations: []SyncOperation{{Operation: "CREATE", Table: "tasks", RecordID: "1"}}},
		{Operations: []SyncOperation{{Operation: "CREATE", Table: "unknown", RecordID: "1"}}},
	} {
		if _, err := normalizeSyncOperations(req); err == nil {
			t.Fatalf("normalizeSyncOperations(%#v) unexpectedly succeeded", req)
		}
	}
}
