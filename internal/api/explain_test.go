package api_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"pebblebase/internal/adapter"

	_ "modernc.org/sqlite"
)

func TestExplainQuery_Endpoint(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbPath := filepath.Join(t.TempDir(), "test_explain.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			email TEXT NOT NULL,
			created_at TEXT
		);
		CREATE INDEX idx_users_email ON users(email);
		INSERT INTO users (id, email) VALUES (1, 'test@example.com');
	`)
	if err != nil {
		t.Fatalf("setup tables: %v", err)
	}

	// 1. Create connection
	connPayload := map[string]any{
		"name":     "SQLite Explain Test",
		"type":     "sqlite",
		"mode":     "form",
		"filepath": dbPath,
	}
	body, _ := json.Marshal(connPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("create connection: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var connResp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &connResp); err != nil {
		t.Fatalf("unmarshal connection resp: %v", err)
	}
	connID := connResp.ID

	t.Run("Explain SELECT with Index", func(t *testing.T) {
		explainBody, _ := json.Marshal(map[string]string{
			"query": "SELECT * FROM users WHERE email = 'test@example.com'",
		})
		r := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/explain", connID), bytes.NewReader(explainBody))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var res adapter.ExplainResult
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal explain result: %v", err)
		}

		if res.Raw == "" {
			t.Errorf("expected non-empty raw plan")
		}
		if res.IndexUsed != "idx_users_email" {
			t.Errorf("expected index 'idx_users_email', got %q", res.IndexUsed)
		}
	})

	t.Run("Explain Empty Query returns 400", func(t *testing.T) {
		explainBody, _ := json.Marshal(map[string]string{
			"query": "   ",
		})
		r := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/explain", connID), bytes.NewReader(explainBody))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", w.Code)
		}
	})

	t.Run("Explain Invalid SQL returns 400", func(t *testing.T) {
		explainBody, _ := json.Marshal(map[string]string{
			"query": "SELECT * FROM non_existent_table_xyz_123",
		})
		r := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/explain", connID), bytes.NewReader(explainBody))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Explain Mutating Query on Read-Only Connection returns 403", func(t *testing.T) {
		// Create read-only connection
		roPayload := map[string]any{
			"name":      "SQLite Explain Read-Only",
			"type":      "sqlite",
			"mode":      "form",
			"filepath":  dbPath,
			"read_only": true,
		}
		roBody, _ := json.Marshal(roPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(roBody))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		var roConnResp struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &roConnResp)

		explainBody, _ := json.Marshal(map[string]string{
			"query": "DELETE FROM users WHERE id = 1",
		})
		r := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/explain", roConnResp.ID), bytes.NewReader(explainBody))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden, got %d: %s", w.Code, w.Body.String())
		}
	})
}
