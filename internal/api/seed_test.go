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

func TestGenerateSeedSQL_API(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "seed_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	// Create users and orders tables with foreign key relationship
	_, err = db.Exec(`
		PRAGMA foreign_keys = ON;
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL,
			full_name TEXT,
			created_at DATETIME
		);
		CREATE TABLE orders (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			order_status TEXT NOT NULL,
			total_amount REAL,
			created_at DATETIME,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("create test schema: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Seed Test DB",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create connection: %s", rec.Body.String())
	}
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	// 1. Success case: Seed orders table with FK to users
	seedBody, _ := json.Marshal(map[string]any{
		"table": "orders",
		"count": 5,
	})
	seedReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/seed", connResp.ID), bytes.NewReader(seedBody))
	seedRec := httptest.NewRecorder()
	mux.ServeHTTP(seedRec, seedReq)

	if seedRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", seedRec.Code, seedRec.Body.String())
	}

	var resp struct {
		Table        string   `json:"table"`
		Count        int      `json:"count"`
		TablesSeeded []string `json:"tables_seeded"`
		SQL          string   `json:"sql"`
	}
	if err := json.NewDecoder(seedRec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Table != "orders" {
		t.Errorf("expected table 'orders', got %q", resp.Table)
	}
	if resp.Count != 5 {
		t.Errorf("expected count 5, got %d", resp.Count)
	}
	if len(resp.TablesSeeded) != 2 {
		t.Fatalf("expected 2 tables seeded (users and orders), got %v", resp.TablesSeeded)
	}
	if resp.TablesSeeded[0] != "users" || resp.TablesSeeded[1] != "orders" {
		t.Errorf("expected [users, orders], got %v", resp.TablesSeeded)
	}

	// 2. Validate SQL output: users must be inserted before orders
	userPos := strings.Index(resp.SQL, `INSERT INTO "users"`)
	orderPos := strings.Index(resp.SQL, `INSERT INTO "orders"`)
	if userPos == -1 || orderPos == -1 {
		t.Fatalf("expected INSERT statements for both users and orders: %s", resp.SQL)
	}
	if userPos >= orderPos {
		t.Errorf("expected users INSERT before orders INSERT in generated SQL")
	}

	// 3. Test executing the generated SQL against the SQLite database!
	testDB, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite for verification: %v", err)
	}
	defer testDB.Close()

	if _, err := testDB.Exec(resp.SQL); err != nil {
		t.Fatalf("executing generated seed SQL failed with FK error: %v\nSQL was:\n%s", err, resp.SQL)
	}

	// Verify rows were successfully inserted
	var userCount, orderCount int
	_ = testDB.QueryRow("SELECT count(*) FROM users").Scan(&userCount)
	_ = testDB.QueryRow("SELECT count(*) FROM orders").Scan(&orderCount)

	if userCount != 5 {
		t.Errorf("expected 5 users inserted, got %d", userCount)
	}
	if orderCount != 5 {
		t.Errorf("expected 5 orders inserted, got %d", orderCount)
	}
}
