package api_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestMongoSchemaAnalysis_NonMongoRejection(t *testing.T) {
	mux, store := setupTestServer(t)

	// Create a test SQLite database
	dbPath := filepath.Join(t.TempDir(), "test_schema.db")
	f, err := os.Create(dbPath)
	if err != nil {
		t.Fatalf("create test db: %v", err)
	}
	f.Close()

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, _ = db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);`)
	db.Close()

	rec, err := store.Save("sqlite-for-mongo-schema-test", "sqlite", "", "", "", "", dbPath, true)
	if err != nil {
		t.Fatalf("create conn: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/mongo-schema?sample_size=500", rec.ID), nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	// Since SQLite adapter does not implement MongoSchemaAnalyzer, should return 400 Bad Request
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for non-mongo connection, got %d: %s", w.Code, w.Body.String())
	}

	var errResp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err == nil {
		if errResp["error"] == "" {
			t.Errorf("expected error message in response body, got empty")
		}
	}
}
