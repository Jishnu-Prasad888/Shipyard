package main

import (
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

const version = "0.1.0"

type Server struct {
	db      *pgxpool.Pool
	cache   *redis.Client
	started time.Time
}

type SyncOperation struct {
	ID        string          `json:"id"`
	Operation string          `json:"operation"`
	Table     string          `json:"table"`
	RecordID  string          `json:"recordId"`
	Data      json.RawMessage `json:"data"`
	Timestamp int64           `json:"timestamp"`
}

type SyncRequest struct {
	Source     string          `json:"source"`
	Operations []SyncOperation `json:"operations"`
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

	r := chi.NewRouter()
	r.Use(corsMiddleware)
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer, middleware.Timeout(60*time.Second))

	r.Get("/health", srv.handleHealth)
	r.Get("/sync/status", srv.handleSyncStatus)
	r.Post("/sync", srv.handleSync)
	r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": version})
	})

	port := getEnv("PORT", "8080")
	log.Printf("shipyard sync server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
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
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

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
	return err
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

	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = "shipyard-app"
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer tx.Rollback(ctx)

	syncedIDs := make([]string, 0, len(req.Operations))

	for _, op := range req.Operations {
		normalizedOp := strings.ToUpper(strings.TrimSpace(op.Operation))
		if normalizedOp != "CREATE" && normalizedOp != "UPDATE" && normalizedOp != "DELETE" {
			writeError(w, http.StatusBadRequest, errors.New("operation must be CREATE, UPDATE, or DELETE"))
			return
		}
		if strings.TrimSpace(op.Table) == "" || strings.TrimSpace(op.RecordID) == "" {
			writeError(w, http.StatusBadRequest, errors.New("table and recordId are required"))
			return
		}

		opID := op.ID
		if opID == "" {
			opID = uuid.NewString()
		}
		eventTime := time.Now().UTC()
		if op.Timestamp > 0 {
			eventTime = time.UnixMilli(op.Timestamp)
		}

		payload := op.Data
		if payload == nil {
			payload = json.RawMessage("null")
		}

		_, err := tx.Exec(ctx, `
            INSERT INTO sync_events (id, source, table_name, record_id, operation, payload, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING
        `, opID, source, op.Table, op.RecordID, normalizedOp, payload, eventTime)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}

		switch normalizedOp {
		case "DELETE":
			if _, err := tx.Exec(ctx, `DELETE FROM records_state WHERE table_name = $1 AND record_id = $2`, op.Table, op.RecordID); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
		default:
			if _, err := tx.Exec(ctx, `
                INSERT INTO records_state (table_name, record_id, payload, updated_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (table_name, record_id)
                DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
            `, op.Table, op.RecordID, payload, eventTime); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
		}

		syncedIDs = append(syncedIDs, opID)
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	_ = s.cache.Set(ctx, "shipyard:last_sync", time.Now().UTC().Format(time.RFC3339), 0).Err()

	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"synced":    len(syncedIDs),
		"syncedIds": syncedIDs,
		"message":   fmt.Sprintf("Synced %d change(s)", len(syncedIDs)),
	})
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
