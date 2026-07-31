package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	version                  = "0.1.0"
	currentSyncSchemaVersion = 2
)

type Server struct {
	db        *pgxpool.Pool
	cache     *redis.Client
	started   time.Time
	applySync func(context.Context, string, []normalizedSyncOperation) ([]string, error)
}

type SyncOperation struct {
	ID            string          `json:"id"`
	Operation     string          `json:"operation"`
	Table         string          `json:"table"`
	RecordID      string          `json:"recordId"`
	Data          json.RawMessage `json:"data"`
	Payload       json.RawMessage `json:"payload"`
	Timestamp     int64           `json:"timestamp"`
	SchemaVersion int             `json:"schemaVersion"`
}

type SyncRequest struct {
	Source        string          `json:"source"`
	ClientID      string          `json:"clientId"`
	Operations    []SyncOperation `json:"operations"`
	SchemaVersion int             `json:"schemaVersion"`
}

type normalizedSyncOperation struct {
	ID               string
	Operation        string
	AuditTable       string
	CanonicalTable   string
	RecordID         string
	AuditPayload     json.RawMessage
	CanonicalPayload json.RawMessage
	Timestamp        int64
	SchemaVersion    int
}

func main() {
	ctx := context.Background()

	dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/shipyard?sslmode=disable")
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("failed to connect to postgres: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("postgres ping failed: %v", err)
	}

	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisPassword := os.Getenv("REDIS_PASSWORD")
	redisDB := getEnvAsInt("REDIS_DB", 0)
	cache := redis.NewClient(&redis.Options{Addr: redisAddr, Password: redisPassword, DB: redisDB})
	if err := cache.Ping(ctx).Err(); err != nil {
		log.Printf("warning: redis ping failed: %v", err)
	}

	srv := &Server{db: pool, cache: cache, started: time.Now().UTC()}
	if err := srv.ensureSchema(ctx); err != nil {
		log.Fatalf("failed to ensure schema: %v", err)
	}

	port := getEnv("PORT", "8080")
	log.Printf("shipyard sync server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, srv.routes()); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}

func (s *Server) routes() http.Handler {
	r := chi.NewRouter()
	r.Use(corsMiddleware)
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer, middleware.Timeout(60*time.Second))

	r.Get("/health", s.handleHealth)
	r.Get("/sync/status", s.handleSyncStatus)
	r.Post("/sync", s.handleSync)
	r.Post("/sync/push", s.handleSync)
	r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": version})
	})

	return r
}

func (s *Server) ensureSchema(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
        CREATE TABLE IF NOT EXISTS sync_events (
            id UUID PRIMARY KEY,
            source TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload JSONB,
            schema_version INTEGER NOT NULL DEFAULT 1,
            canonical_table_name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS canonical_table_name TEXT;

        CREATE TABLE IF NOT EXISTS records_state (
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            payload JSONB,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (table_name, record_id)
        );

        CREATE INDEX IF NOT EXISTS idx_sync_events_created_at ON sync_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_records_state_updated_at ON records_state(updated_at);
    `)
	if err != nil {
		return err
	}
	return s.migrateLegacyState(ctx)
}

func (s *Server) migrateLegacyState(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
        SELECT table_name, record_id, payload, updated_at
        FROM records_state
        WHERE table_name = ANY($1)
    `, []string{"folders", "docks", "lists", "cards", "subcards"})
	if err != nil {
		return err
	}
	type legacyRecord struct {
		table, id string
		payload   json.RawMessage
		updatedAt time.Time
	}
	var records []legacyRecord
	for rows.Next() {
		var record legacyRecord
		if err := rows.Scan(&record.table, &record.id, &record.payload, &record.updatedAt); err != nil {
			rows.Close()
			return err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, record := range records {
		canonicalTable, _ := canonicalTableName(record.table)
		canonicalPayload, err := canonicalizePayload(canonicalTable, record.payload)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
            INSERT INTO records_state (table_name, record_id, payload, updated_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (table_name, record_id) DO UPDATE
            SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
            WHERE EXCLUDED.updated_at > records_state.updated_at
        `, canonicalTable, record.id, canonicalPayload, record.updatedAt); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			"DELETE FROM records_state WHERE table_name = $1 AND record_id = $2",
			record.table, record.id,
		); err != nil {
			return err
		}
	}

	_, err = tx.Exec(ctx, `
        UPDATE sync_events
        SET canonical_table_name = CASE table_name
            WHEN 'folders' THEN 'workspaces'
            WHEN 'docks' THEN 'projects'
            WHEN 'lists' THEN 'columns'
            WHEN 'cards' THEN 'tasks'
            WHEN 'subcards' THEN 'subtasks'
            ELSE table_name
        END
        WHERE canonical_table_name IS NULL
    `)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	status := "ok"

	dbStatus := "ok"
	if err := s.db.Ping(ctx); err != nil {
		status = "degraded"
		dbStatus = err.Error()
	}

	redisStatus := "ok"
	if err := s.cache.Ping(ctx).Err(); err != nil {
		status = "degraded"
		redisStatus = err.Error()
	}

	lastSync, _ := s.cache.Get(ctx, "shipyard:last_sync").Result()

	writeJSON(w, http.StatusOK, map[string]any{
		"status":     status,
		"db":         dbStatus,
		"redis":      redisStatus,
		"version":    version,
		"startedAt":  s.started,
		"lastSyncAt": lastSync,
	})
}

func (s *Server) handleSyncStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var total int64
	var last time.Time
	if err := s.db.QueryRow(ctx, "SELECT COUNT(*), COALESCE(MAX(created_at), to_timestamp(0)) FROM sync_events").Scan(&total, &last); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	lastSync, _ := s.cache.Get(ctx, "shipyard:last_sync").Result()

	writeJSON(w, http.StatusOK, map[string]any{
		"totalEvents": total,
		"lastEventAt": last,
		"lastSyncAt":  lastSync,
	})
}

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var req SyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(req.Operations) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("operations array is empty"))
		return
	}
	operations, err := normalizeSyncOperations(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = strings.TrimSpace(req.ClientID)
	}
	if source == "" {
		source = strings.TrimSpace(r.Header.Get("X-Client-Id"))
	}
	if source == "" {
		source = "shipyard-app"
	}

	apply := s.applySync
	if apply == nil {
		apply = s.applySyncOperations
	}
	syncedIDs, err := apply(ctx, source, operations)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	if s.cache != nil {
		_ = s.cache.Set(ctx, "shipyard:last_sync", time.Now().UTC().Format(time.RFC3339), 0).Err()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"schemaVersion": currentSyncSchemaVersion,
		"synced":        len(syncedIDs),
		"syncedIds":     syncedIDs,
		"message":       fmt.Sprintf("Synced %d change(s)", len(syncedIDs)),
	})
}

func normalizeSyncOperations(req SyncRequest) ([]normalizedSyncOperation, error) {
	if req.SchemaVersion != 0 && req.SchemaVersion != 1 && req.SchemaVersion != 2 {
		return nil, errors.New("schemaVersion must be 1 or 2")
	}

	operations := make([]normalizedSyncOperation, 0, len(req.Operations))
	for _, op := range req.Operations {
		schemaVersion := op.SchemaVersion
		if schemaVersion == 0 {
			schemaVersion = req.SchemaVersion
		}
		if schemaVersion == 0 {
			schemaVersion = 1
		}
		if schemaVersion != 1 && schemaVersion != 2 {
			return nil, errors.New("operation schemaVersion must be 1 or 2")
		}

		normalizedOp := strings.ToUpper(strings.TrimSpace(op.Operation))
		if normalizedOp != "CREATE" && normalizedOp != "UPDATE" && normalizedOp != "DELETE" {
			return nil, errors.New("operation must be CREATE, UPDATE, or DELETE")
		}
		if strings.TrimSpace(op.Table) == "" || strings.TrimSpace(op.RecordID) == "" {
			return nil, errors.New("table and recordId are required")
		}

		canonicalTable, ok := canonicalTableName(op.Table)
		if !ok {
			return nil, fmt.Errorf("unsupported sync table %q", op.Table)
		}
		payload := op.Data
		if op.Payload != nil {
			payload = op.Payload
		}
		if payload == nil {
			payload = json.RawMessage("null")
		}
		canonicalPayload := json.RawMessage("null")
		if normalizedOp != "DELETE" {
			var err error
			canonicalPayload, err = canonicalizePayload(canonicalTable, payload)
			if err != nil {
				return nil, fmt.Errorf("invalid payload for %s: %w", op.Table, err)
			}
		} else if !json.Valid(payload) {
			return nil, fmt.Errorf("invalid payload for %s", op.Table)
		}

		operations = append(operations, normalizedSyncOperation{
			ID:               op.ID,
			Operation:        normalizedOp,
			AuditTable:       op.Table,
			CanonicalTable:   canonicalTable,
			RecordID:         op.RecordID,
			AuditPayload:     payload,
			CanonicalPayload: canonicalPayload,
			Timestamp:        op.Timestamp,
			SchemaVersion:    schemaVersion,
		})
	}

	return operations, nil
}

func canonicalTableName(table string) (string, bool) {
	canonical, ok := map[string]string{
		"folders":     "workspaces",
		"docks":       "projects",
		"boards":      "boards",
		"lists":       "columns",
		"cards":       "tasks",
		"subcards":    "subtasks",
		"workspaces":  "workspaces",
		"projects":    "projects",
		"columns":     "columns",
		"tasks":       "tasks",
		"subtasks":    "subtasks",
		"statuses":    "statuses",
		"connections": "connections",
		"tags":        "tags",
	}[strings.ToLower(strings.TrimSpace(table))]
	return canonical, ok
}

func canonicalizePayload(table string, payload json.RawMessage) (json.RawMessage, error) {
	if !json.Valid(payload) {
		return nil, errors.New("payload must be valid JSON")
	}
	trimmed := bytes.TrimSpace(payload)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return payload, nil
	}

	var record map[string]json.RawMessage
	if err := json.Unmarshal(payload, &record); err != nil {
		return nil, err
	}
	if record == nil {
		return payload, nil
	}

	aliases := map[string]map[string]string{
		"workspaces": {
			"parentId": "parentWorkspaceId",
			"docks":    "projects",
		},
		"projects": {
			"folderId": "workspaceId",
		},
		"boards": {
			"dockId": "projectId",
			"lists":  "columns",
		},
		"columns": {
			"cards": "tasks",
		},
		"tasks": {
			"listId":           "columnId",
			"connectedCardIds": "connectedTaskIds",
			"connectedListIds": "connectedColumnIds",
			"subCards":         "subtasks",
			"subcards":         "subtasks",
		},
		"subtasks": {
			"cardId": "taskId",
		},
	}
	for legacy, canonical := range aliases[table] {
		value, exists := record[legacy]
		if !exists {
			continue
		}
		if _, canonicalExists := record[canonical]; !canonicalExists {
			record[canonical] = value
		}
		delete(record, legacy)
	}
	if table == "connections" {
		var connectionType string
		if value, ok := record["type"]; ok && json.Unmarshal(value, &connectionType) == nil {
			switch connectionType {
			case "card-to-card":
				record["type"] = json.RawMessage(`"task-to-task"`)
			case "list-to-list":
				record["type"] = json.RawMessage(`"column-to-column"`)
			}
		}
	}

	children := map[string]struct {
		field string
		table string
	}{
		"workspaces": {"projects", "projects"},
		"projects":   {"boards", "boards"},
		"boards":     {"columns", "columns"},
		"columns":    {"tasks", "tasks"},
		"tasks":      {"subtasks", "subtasks"},
	}
	child, hasChildren := children[table]
	value, hasValue := record[child.field]
	if hasChildren && hasValue && len(bytes.TrimSpace(value)) > 0 && bytes.TrimSpace(value)[0] == '[' {
		var items []json.RawMessage
		if err := json.Unmarshal(value, &items); err != nil {
			return nil, err
		}
		for i, item := range items {
			normalized, err := canonicalizePayload(child.table, item)
			if err != nil {
				return nil, err
			}
			items[i] = normalized
		}
		record[child.field], _ = json.Marshal(items)
	}

	return json.Marshal(record)
}

func (s *Server) applySyncOperations(ctx context.Context, source string, operations []normalizedSyncOperation) ([]string, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	syncedIDs := make([]string, 0, len(operations))

	for _, op := range operations {
		opID := op.ID
		if opID == "" {
			opID = uuid.NewString()
		}
		eventTime := time.Now().UTC()
		if op.Timestamp > 0 {
			eventTime = time.UnixMilli(op.Timestamp)
		}

		_, err := tx.Exec(ctx, `
            INSERT INTO sync_events (id, source, table_name, canonical_table_name, record_id, operation, payload, schema_version, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING
        `, opID, source, op.AuditTable, op.CanonicalTable, op.RecordID, op.Operation, op.AuditPayload, op.SchemaVersion, eventTime)
		if err != nil {
			return nil, err
		}

		switch op.Operation {
		case "DELETE":
			if _, err := tx.Exec(ctx, `DELETE FROM records_state WHERE table_name = $1 AND record_id = $2`, op.CanonicalTable, op.RecordID); err != nil {
				return nil, err
			}
		default:
			if _, err := tx.Exec(ctx, `
                INSERT INTO records_state (table_name, record_id, payload, updated_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (table_name, record_id)
                DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
            `, op.CanonicalTable, op.RecordID, op.CanonicalPayload, eventTime); err != nil {
				return nil, err
			}
		}

		syncedIDs = append(syncedIDs, opID)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return syncedIDs, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func getEnv(key, fallback string) string {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	return val
}

func getEnvAsInt(key string, fallback int) int {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return n
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
