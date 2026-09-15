package api_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"pebblebase/internal/adapter"
	"pebblebase/internal/api"
	"pebblebase/internal/migration"
	"pebblebase/internal/storage"

	_ "modernc.org/sqlite"
)

func setupMigrationTestServer(t *testing.T) (http.Handler, *storage.Store, *migration.Store, string, string) {
	t.Helper()
	dir := t.TempDir()

	key, err := storage.LoadOrGenerateKey(dir)
	if err != nil {
		t.Fatalf("LoadOrGenerateKey: %v", err)
	}
	enc, err := storage.NewEncryptor(key)
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}
	store, err := storage.NewStore(dir, enc)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	metaDB, err := sql.Open("sqlite", filepath.Join(dir, "meta.db"))
	if err != nil {
		t.Fatalf("open meta.db: %v", err)
	}

	migStore, err := migration.NewStore(metaDB)
	if err != nil {
		t.Fatalf("migration.NewStore: %v", err)
	}

	// Create a test target SQLite database
	targetDBPath := filepath.Join(dir, "target.db")
	db, err := sql.Open("sqlite", targetDBPath)
	if err != nil {
		t.Fatalf("create target db: %v", err)
	}
	_, err = db.Exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);")
	db.Close()
	if err != nil {
		t.Fatalf("exec create table items: %v", err)
	}

	// Save connection in store
	rec, err := store.Save("Target SQLite", "sqlite", "", "", "", targetDBPath, targetDBPath, true, storage.SaveParams{Filepath: targetDBPath})
	if err != nil {
		t.Fatalf("save conn: %v", err)
	}

	// Save a read-only connection as well
	roRec, err := store.Save("RO SQLite", "sqlite", "", "", "", targetDBPath, targetDBPath, true, storage.SaveParams{Filepath: targetDBPath, ReadOnly: true})
	if err != nil {
		t.Fatalf("save ro conn: %v", err)
	}

	mux := http.NewServeMux()
	srv := api.NewServer(store, enc, nil, nil, nil, migStore, false)
	srv.RegisterRoutes(mux)

	return mux, store, migStore, rec.ID, roRec.ID
}

func TestMigrationAPI_DryRunAndLive(t *testing.T) {
	mux, _, migStore, connID, roConnID := setupMigrationTestServer(t)

	// 1. Dry Run
	dryReqBody := map[string]any{
		"ddl":     "ALTER TABLE items ADD COLUMN price REAL;",
		"dry_run": true,
	}
	bodyBytes, _ := json.Marshal(dryReqBody)
	req := httptest.NewRequest("POST", "/api/connections/"+connID+"/migrations", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var dryResult adapter.MigrationResult
	if err := json.Unmarshal(rec.Body.Bytes(), &dryResult); err != nil {
		t.Fatalf("unmarshal dry-run result: %v", err)
	}
	if !dryResult.Success {
		t.Fatalf("expected dry-run success, got: %s", dryResult.Error)
	}
	if len(dryResult.Plan) != 1 {
		t.Fatalf("expected 1 plan operation, got %d", len(dryResult.Plan))
	}

	// Verify history count is still 0 after dry-run
	history, total, err := migStore.List(context.Background(), connID, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if total != 0 || len(history) != 0 {
		t.Fatalf("expected 0 history items after dry-run, got %d", total)
	}

	// 2. Read-Only check on live migration
	liveReqBody := map[string]any{
		"ddl":     "ALTER TABLE items ADD COLUMN price REAL;",
		"dry_run": false,
	}
	liveBytes, _ := json.Marshal(liveReqBody)
	roReq := httptest.NewRequest("POST", "/api/connections/"+roConnID+"/migrations", bytes.NewReader(liveBytes))
	roRec := httptest.NewRecorder()
	mux.ServeHTTP(roRec, roReq)
	if roRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on read-only live migration, got %d", roRec.Code)
	}

	// 3. Live Run on writable connection
	liveReq := httptest.NewRequest("POST", "/api/connections/"+connID+"/migrations", bytes.NewReader(liveBytes))
	liveRec := httptest.NewRecorder()
	mux.ServeHTTP(liveRec, liveReq)

	if liveRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on live run, got %d: %s", liveRec.Code, liveRec.Body.String())
	}

	var liveResult adapter.MigrationResult
	if err := json.Unmarshal(liveRec.Body.Bytes(), &liveResult); err != nil {
		t.Fatalf("unmarshal live result: %v", err)
	}
	if !liveResult.Success {
		t.Fatalf("expected live run success, got: %s", liveResult.Error)
	}

	// Verify history now contains 1 record
	history, total, err = migStore.List(context.Background(), connID, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if total != 1 || len(history) != 1 {
		t.Fatalf("expected 1 history item, got %d", total)
	}
	migrationID := history[0].ID

	// 4. GET /api/connections/:id/migrations
	getReq := httptest.NewRequest("GET", "/api/connections/"+connID+"/migrations", nil)
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("expected 200 for GET migrations, got %d", getRec.Code)
	}

	// 5. POST /api/connections/:id/migrations/:mid/rollback
	rollReq := httptest.NewRequest("POST", "/api/connections/"+connID+"/migrations/"+migrationID+"/rollback", nil)
	rollRec := httptest.NewRecorder()
	mux.ServeHTTP(rollRec, rollReq)

	if rollRec.Code != http.StatusOK {
		t.Fatalf("expected 200 for rollback, got %d: %s", rollRec.Code, rollRec.Body.String())
	}

	var rollResult adapter.MigrationResult
	if err := json.Unmarshal(rollRec.Body.Bytes(), &rollResult); err != nil {
		t.Fatalf("unmarshal rollback result: %v", err)
	}
	if !rollResult.Success {
		t.Fatalf("expected rollback success, got: %s", rollResult.Error)
	}

	// History should now have 2 records (original + rollback)
	history, total, err = migStore.List(context.Background(), connID, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if total != 2 || len(history) != 2 {
		t.Fatalf("expected 2 history items after rollback, got total=%d, len=%d", total, len(history))
	}
}
