package api

import (
	"net/http"
	"net/http/httptest"
	"pebblebase/internal/storage"
	"strings"
	"testing"
)

func TestWorkspaceRoutesWithoutPorts(t *testing.T) {
	store, err := storage.NewStore(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = server.Close() })
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest("GET", "/api/workspaces", nil))
	if response.Code != 200 || !strings.Contains(response.Body.String(), "Default") {
		t.Fatal(response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest("PUT", "/api/workspaces", strings.NewReader(`{"version":1,"workspaces":[]}`)))
	if response.Code != 400 {
		t.Fatal("last workspace deletion accepted", response.Code)
	}
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest("PUT", "/api/workspaces", strings.NewReader(`{"version":1,"workspaces":[{"id":"other","name":"Other","colour":"#ffffff","connectionIds":[]}]}`)))
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
}
