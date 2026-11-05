package api_test

import (
	"bytes"
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

func TestPipelinePreview_NonMongoRejection(t *testing.T) {
	mux, store := setupTestServer(t)

	dbPath := filepath.Join(t.TempDir(), "test_preview.db")
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

	rec, err := store.Save("sqlite-for-preview-test", "sqlite", "", "", "", "", dbPath, true)
	if err != nil {
		t.Fatalf("create conn: %v", err)
	}

	payload := map[string]any{
		"stages": `[{"$match": {"id": 1}}]`,
		"limit":  10,
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/users/pipeline-preview", rec.ID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	// Since SQLite adapter does not implement PipelinePreviewer, should return 400 Bad Request
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for non-mongo connection, got %d: %s", w.Code, w.Body.String())
	}
}
