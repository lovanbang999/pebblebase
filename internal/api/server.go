// Package api implements the HTTP handlers for the Pebblebase REST API.
// All routes are registered on a standard http.ServeMux (Go 1.22+ method+path routing).
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"pebblebase/internal/adapter"
	mongoadapter "pebblebase/internal/adapter/mongodb"
	mysqladapter "pebblebase/internal/adapter/mysql"
	pgadapter "pebblebase/internal/adapter/postgres"
	sqliteadapter "pebblebase/internal/adapter/sqlite"
	"pebblebase/internal/storage"
)

// Server holds shared dependencies and exposes the route-registration method.
type Server struct {
	store *storage.Store
	enc   *storage.Encryptor
	cache *adapterCache
}

// NewServer creates a Server wired with the given store and encryptor.
func NewServer(store *storage.Store, enc *storage.Encryptor) *Server {
	return &Server{
		store: store,
		enc:   enc,
		cache: &adapterCache{entries: make(map[string]adapter.Adapter)},
	}
}

// RegisterRoutes registers all /api/* routes on mux.
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// Connection management
	mux.HandleFunc("POST /api/connections/test", s.testConnection)
	mux.HandleFunc("POST /api/connections", s.createConnection)
	mux.HandleFunc("GET /api/connections", s.listConnections)
	mux.HandleFunc("DELETE /api/connections/{id}", s.deleteConnection)
	mux.HandleFunc("POST /api/connections/{id}/ping", s.pingConnection)

	// Schema introspection
	mux.HandleFunc("GET /api/connections/{id}/tables", s.listTables)

	// Row operations
	mux.HandleFunc("GET /api/connections/{id}/tables/{table}/rows", s.queryRows)
	mux.HandleFunc("POST /api/connections/{id}/tables/{table}/rows", s.insertRow)
	mux.HandleFunc("PATCH /api/connections/{id}/tables/{table}/rows", s.updateRow)
	mux.HandleFunc("DELETE /api/connections/{id}/tables/{table}/rows", s.deleteRow)

	// Ad-hoc raw SQL and Mongo query execution
	mux.HandleFunc("POST /api/connections/{id}/query", s.executeRawQuery)

	// Bulk export & import
	mux.HandleFunc("GET /api/connections/{id}/tables/{table}/export", s.exportTable)
	mux.HandleFunc("POST /api/connections/{id}/tables/{table}/import", s.importTable)

	// Schema DDL & Indexes inspection
	mux.HandleFunc("GET /api/connections/{id}/tables/{table}/ddl", s.getTableDDL)
}

// --------------------------------------------------------------------------
// Adapter cache — keeps open connections alive for the server lifetime.
// Evicted only on explicit DELETE /api/connections/:id.
// --------------------------------------------------------------------------

type adapterCache struct {
	mu      sync.RWMutex
	entries map[string]adapter.Adapter
}

func (c *adapterCache) get(id string) (adapter.Adapter, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	a, ok := c.entries[id]
	return a, ok
}

func (c *adapterCache) set(id string, a adapter.Adapter) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[id] = a
}

func (c *adapterCache) delete(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if a, ok := c.entries[id]; ok {
		a.Close()
		delete(c.entries, id)
	}
}

// getAdapter returns a cached adapter or opens a new one from the stored DSN.
// Returns an error when SavePassword=false and the adapter is not cached
// (i.e., the server restarted and no password was retained).
func (s *Server) getAdapter(ctx context.Context, id string) (adapter.Adapter, error) {
	if a, ok := s.cache.get(id); ok {
		return a, nil
	}

	rec, err := s.store.Get(id)
	if err != nil {
		return nil, fmt.Errorf("connection %q not found", id)
	}
	if !rec.SavePassword {
		return nil, fmt.Errorf("connection %q has no saved password — please reconnect", id)
	}

	dsn, err := s.store.DSN(id)
	if err != nil {
		return nil, fmt.Errorf("decrypt DSN for %q: %w", id, err)
	}

	a, err := openAdapter(ctx, rec.Type, dsn)
	if err != nil {
		return nil, fmt.Errorf("open adapter for %q: %w", id, err)
	}
	s.cache.set(id, a)
	return a, nil
}

// openAdapter creates an adapter for the given database type and DSN.
func openAdapter(ctx context.Context, dbType, dsn string) (adapter.Adapter, error) {
	switch dbType {
	case "postgres":
		return pgadapter.New(ctx, dsn)
	case "mysql":
		return mysqladapter.New(ctx, dsn)
	case "mongodb":
		return mongoadapter.New(ctx, dsn)
	case "sqlite":
		return sqliteadapter.New(ctx, dsn)
	default:
		return nil, fmt.Errorf("unsupported database type: %q", dbType)
	}
}

// --------------------------------------------------------------------------
// HTTP helpers
// --------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writeJSON encode: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeBody(r *http.Request, v any) error {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return nil
}
