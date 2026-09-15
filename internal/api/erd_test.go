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

	"pebblebase/internal/schema"

	_ "modernc.org/sqlite"
)

func TestERD_Endpoint(t *testing.T) {
	mux, _ := setupTestServer(t)

	// Create a SQLite database with foreign key relation
	dbPath := filepath.Join(t.TempDir(), "test_erd.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE authors (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL
		);
		CREATE TABLE books (
			id INTEGER PRIMARY KEY,
			title TEXT NOT NULL,
			author_id INTEGER REFERENCES authors(id)
		);
	`)
	if err != nil {
		t.Fatalf("create tables: %v", err)
	}

	// 1. Create connection
	connPayload := map[string]any{
		"name":     "SQLite ERD Test",
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
		t.Fatalf("unmarshal conn: %v", err)
	}
	connID := connResp.ID

	// 2. Query ERD endpoint
	reqERD := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/erd", connID), nil)
	recERD := httptest.NewRecorder()
	mux.ServeHTTP(recERD, reqERD)

	if recERD.Code != http.StatusOK {
		t.Fatalf("get erd failed: status %d: %s", recERD.Code, recERD.Body.String())
	}

	var erdResp struct {
		Tables    []schema.Table    `json:"tables"`
		Relations []schema.Relation `json:"relations"`
	}
	if err := json.Unmarshal(recERD.Body.Bytes(), &erdResp); err != nil {
		t.Fatalf("unmarshal erd: %v", err)
	}

	if len(erdResp.Tables) < 2 {
		t.Fatalf("expected at least 2 tables, got %d", len(erdResp.Tables))
	}

	// Verify tables exist
	tableMap := make(map[string]schema.Table)
	for _, tbl := range erdResp.Tables {
		tableMap[tbl.Name] = tbl
	}
	if _, ok := tableMap["authors"]; !ok {
		t.Errorf("expected 'authors' table in ERD response")
	}
	if _, ok := tableMap["books"]; !ok {
		t.Errorf("expected 'books' table in ERD response")
	}

	// Verify relation
	if len(erdResp.Relations) == 0 {
		t.Fatalf("expected at least 1 relation in ERD response, got 0")
	}

	rel := erdResp.Relations[0]
	if rel.FromTable != "books" || rel.ToTable != "authors" {
		t.Errorf("unexpected relation: got %s.%s -> %s.%s, expected books.author_id -> authors.id",
			rel.FromTable, rel.FromColumn, rel.ToTable, rel.ToColumn)
	}
}
