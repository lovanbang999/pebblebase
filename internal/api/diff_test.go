package api_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestSchemaDiff_API(t *testing.T) {
	mux, _ := setupTestServer(t)

	tempDir := t.TempDir()
	devDBFile := filepath.Join(tempDir, "dev.db")
	stagingDBFile := filepath.Join(tempDir, "staging.db")

	// 1. Initialize dev_db (source): users, orders, products
	devDB, err := sql.Open("sqlite", devDBFile)
	if err != nil {
		t.Fatalf("open dev sqlite: %v", err)
	}
	_, err = devDB.Exec(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL,
			age INTEGER NOT NULL
		);
		CREATE TABLE orders (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			total REAL NOT NULL
		);
		CREATE TABLE products (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			price REAL NOT NULL
		);
	`)
	devDB.Close()
	if err != nil {
		t.Fatalf("init dev schema: %v", err)
	}

	// 2. Initialize staging_db (target): users with age as TEXT, missing orders and products
	stagingDB, err := sql.Open("sqlite", stagingDBFile)
	if err != nil {
		t.Fatalf("open staging sqlite: %v", err)
	}
	_, err = stagingDB.Exec(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL,
			age TEXT NOT NULL
		);
	`)
	stagingDB.Close()
	if err != nil {
		t.Fatalf("init staging schema: %v", err)
	}

	// Helper to create connection
	createConn := func(name, file string) string {
		body, _ := json.Marshal(map[string]any{
			"name":          name,
			"type":          "sqlite",
			"filepath":      file,
			"save_password": true,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create connection %s failed: %s", name, rec.Body.String())
		}
		var resp struct {
			ID string `json:"id"`
		}
		_ = json.NewDecoder(rec.Body).Decode(&resp)
		return resp.ID
	}

	devConnID := createConn("Dev DB", devDBFile)
	stagingConnID := createConn("Staging DB", stagingDBFile)

	// 3. Request Schema Diff: from dev -> to staging
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/diff?from=%s&to=%s", devConnID, stagingConnID), nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/diff returned code %d: %s", rec.Code, rec.Body.String())
	}

	var diffResult struct {
		FromConnection struct {
			Name string `json:"name"`
		} `json:"from_connection"`
		ToConnection struct {
			Name string `json:"name"`
		} `json:"to_connection"`
		Summary struct {
			TablesAdded    int `json:"tables_added"`
			TablesRemoved  int `json:"tables_removed"`
			TablesModified int `json:"tables_modified"`
		} `json:"summary"`
		MigrationSQL string `json:"migration_sql"`
	}

	if err := json.NewDecoder(rec.Body).Decode(&diffResult); err != nil {
		t.Fatalf("decode diff response: %v", err)
	}

	// Checkpoint assertions:
	// Staging is missing 2 tables (orders, products) and has 1 column type mismatch (age)
	if diffResult.Summary.TablesAdded != 2 {
		t.Errorf("expected 2 tables added, got %d", diffResult.Summary.TablesAdded)
	}
	if diffResult.Summary.TablesModified != 1 {
		t.Errorf("expected 1 table modified (users), got %d", diffResult.Summary.TablesModified)
	}
	if diffResult.Summary.TablesRemoved != 0 {
		t.Errorf("expected 0 tables removed, got %d", diffResult.Summary.TablesRemoved)
	}

	// Verify Migration SQL contains CREATE TABLE for orders & products
	sqlText := diffResult.MigrationSQL
	if !strings.Contains(sqlText, `CREATE TABLE "orders"`) {
		t.Errorf("expected CREATE TABLE \"orders\", got:\n%s", sqlText)
	}
	if !strings.Contains(sqlText, `CREATE TABLE "products"`) {
		t.Errorf("expected CREATE TABLE \"products\", got:\n%s", sqlText)
	}

	// 4. Execute the migration SQL on staging DB to confirm it successfully runs
	targetDB, err := sql.Open("sqlite", stagingDBFile)
	if err != nil {
		t.Fatalf("re-open staging db: %v", err)
	}
	defer targetDB.Close()

	if _, err := targetDB.Exec(sqlText); err != nil {
		t.Fatalf("failed to execute generated migration SQL on target: %v\nSQL:\n%s", err, sqlText)
	}

	// Verify tables now exist in staging
	var tableCount int
	err = targetDB.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('orders', 'products')`).Scan(&tableCount)
	if err != nil {
		t.Fatalf("query sqlite_master: %v", err)
	}
	if tableCount != 2 {
		t.Errorf("expected 2 new tables in staging after migration, found %d", tableCount)
	}
}

func TestSchemaDiff_Validation(t *testing.T) {
	mux, _ := setupTestServer(t)

	// Missing params
	req := httptest.NewRequest(http.MethodGet, "/api/diff", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing params, got %d", rec.Code)
	}

	// Same connId for from and to
	req2 := httptest.NewRequest(http.MethodGet, "/api/diff?from=conn1&to=conn1", nil)
	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for same connection id, got %d", rec2.Code)
	}
}
