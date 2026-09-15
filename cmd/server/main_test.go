package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pebblebase"
	"pebblebase/internal/api"
	"pebblebase/internal/storage"
)

func setupTestServer(t *testing.T) *http.ServeMux {
	t.Helper()
	dir := t.TempDir()

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}

	enc, err := storage.NewEncryptor(key)
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}

	store, err := storage.NewStore(dir, enc)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"OK"}`))
	})

	srv := api.NewServer(store, enc, nil, nil, nil, nil, false)
	srv.RegisterRoutes(mux)

	frontendFS, err := pebblebase.FrontendFS()
	if err != nil {
		t.Fatalf("FrontendFS: %v", err)
	}
	mux.Handle("/", spaHandler(frontendFS))

	return mux
}

func TestHealthCheck(t *testing.T) {
	mux := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

func TestSPA_RootIndex(t *testing.T) {
	mux := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for root, got %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "<!doctype html>") && !strings.Contains(body, "<html") {
		t.Errorf("expected HTML content on root, got: %s", body)
	}
}

func TestSPA_ClientRouteFallback(t *testing.T) {
	mux := setupTestServer(t)

	// A client-side SPA route like /connections/my-db
	req := httptest.NewRequest(http.MethodGet, "/connections/my-db", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on SPA client route, got %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "<!doctype html>") && !strings.Contains(body, "<html") {
		t.Errorf("expected HTML fallback on client route, got: %s", body)
	}
}

func TestSPA_NonExistentAPI404(t *testing.T) {
	mux := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/nonexistent_endpoint", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown API, got %d", rec.Code)
	}
	var errResp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("unmarshal 404 response: %v", err)
	}
	if errResp["error"] != "not found" {
		t.Errorf("expected 'not found', got %q", errResp["error"])
	}
}
