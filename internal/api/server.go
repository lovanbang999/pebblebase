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
	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
	"pebblebase/internal/migration"
	"pebblebase/internal/savedquery"
	"pebblebase/internal/storage"
)

// Server holds shared dependencies and exposes the route-registration method.
type Server struct {
	store        *storage.Store
	enc          *storage.Encryptor
	cache        *adapterCache
	authSvc      *auth.Service
	auditLog     *audit.Logger
	querySvc     *savedquery.Store
	migrationSvc *migration.Store
	authEnabled  bool
}

// NewServer creates a Server wired with the given store and encryptor.
// Pass nil authSvc / auditLog to run without authentication (authEnabled=false).
func NewServer(store *storage.Store, enc *storage.Encryptor, authSvc *auth.Service, auditLog *audit.Logger, querySvc *savedquery.Store, migrationSvc *migration.Store, authEnabled bool) *Server {
	return &Server{
		store:        store,
		enc:          enc,
		cache:        &adapterCache{entries: make(map[string]adapter.Adapter)},
		authSvc:      authSvc,
		auditLog:     auditLog,
		querySvc:     querySvc,
		migrationSvc: migrationSvc,
		authEnabled:  authEnabled,
	}
}

// RegisterRoutes registers all /api/* routes on mux.
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// Public auth routes (never guarded)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)

	// Build middleware chain for protected routes
	protect := s.protectMiddleware()

	// Auth user management
	mux.Handle("GET /api/auth/me", protect(http.HandlerFunc(s.handleMe)))
	mux.Handle("GET /api/auth/users", protect(http.HandlerFunc(s.handleListUsers)))
	mux.Handle("POST /api/auth/users", protect(http.HandlerFunc(s.handleCreateUser)))
	mux.Handle("DELETE /api/auth/users/{id}", protect(http.HandlerFunc(s.handleDeleteUser)))
	mux.Handle("PATCH /api/auth/users/{id}/password", protect(http.HandlerFunc(s.handleChangePassword)))

	// Audit log
	mux.Handle("GET /api/audit/logs", protect(http.HandlerFunc(s.handleListAuditLogs)))

	// Connection management
	mux.Handle("POST /api/connections/test", protect(http.HandlerFunc(s.testConnection)))
	mux.Handle("POST /api/connections", protect(http.HandlerFunc(s.createConnection)))
	mux.Handle("GET /api/connections", protect(http.HandlerFunc(s.listConnections)))
	mux.Handle("DELETE /api/connections/{id}", protect(http.HandlerFunc(s.deleteConnection)))
	mux.Handle("POST /api/connections/{id}/ping", protect(http.HandlerFunc(s.pingConnection)))

	// Schema introspection
	mux.Handle("GET /api/connections/{id}/tables", protect(http.HandlerFunc(s.listTables)))
	mux.Handle("GET /api/connections/{id}/erd", protect(http.HandlerFunc(s.getERD)))

	// Row operations
	mux.Handle("GET /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.queryRows)))
	mux.Handle("POST /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.insertRow)))
	mux.Handle("PATCH /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.updateRow)))
	mux.Handle("DELETE /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.deleteRow)))

	// Ad-hoc raw SQL and Mongo query execution
	mux.Handle("POST /api/connections/{id}/query", protect(http.HandlerFunc(s.executeRawQuery)))

	// Bulk export & import
	mux.Handle("GET /api/connections/{id}/tables/{table}/export", protect(http.HandlerFunc(s.exportTable)))
	mux.Handle("POST /api/connections/{id}/tables/{table}/import", protect(http.HandlerFunc(s.importTable)))

	// Schema DDL & Indexes inspection
	mux.Handle("GET /api/connections/{id}/tables/{table}/ddl", protect(http.HandlerFunc(s.getTableDDL)))

	// Column Analytics & Table Statistics
	mux.Handle("GET /api/connections/{id}/tables/{table}/aggregate", protect(http.HandlerFunc(s.handleAggregate)))
	mux.Handle("GET /api/connections/{id}/tables/{table}/stats", protect(http.HandlerFunc(s.handleTableStats)))

	// Saved Queries (Query Library)
	mux.Handle("GET /api/connections/{id}/saved-queries", protect(http.HandlerFunc(s.listSavedQueries)))
	mux.Handle("POST /api/connections/{id}/saved-queries", protect(http.HandlerFunc(s.createSavedQuery)))
	mux.Handle("PATCH /api/connections/{id}/saved-queries/{qid}", protect(http.HandlerFunc(s.updateSavedQuery)))
	mux.Handle("DELETE /api/connections/{id}/saved-queries/{qid}", protect(http.HandlerFunc(s.deleteSavedQuery)))
	mux.Handle("GET /api/connections/{id}/saved-queries/{qid}/export", protect(http.HandlerFunc(s.exportSavedQuery)))

	// In-App Schema Migrations
	mux.Handle("POST /api/connections/{id}/migrations", protect(http.HandlerFunc(s.executeMigration)))
	mux.Handle("GET /api/connections/{id}/migrations", protect(http.HandlerFunc(s.listMigrations)))
	mux.Handle("POST /api/connections/{id}/migrations/{mid}/rollback", protect(http.HandlerFunc(s.rollbackMigration)))
}

// protectMiddleware returns a middleware wrapper that enforces JWT auth when
// authEnabled is true. When auth is disabled, the handler is passed through as-is.
func (s *Server) protectMiddleware() func(http.Handler) http.Handler {
	if !s.authEnabled || s.authSvc == nil {
		return func(h http.Handler) http.Handler { return h }
	}
	return auth.AuthMiddleware(s.authSvc, []string{"/api/auth/login"})
}

// viewerBlocked reports whether the request should be blocked due to the caller
// being a read-only Viewer. Returns true and writes a 403 when blocked.
func (s *Server) viewerBlocked(w http.ResponseWriter, r *http.Request) bool {
	if s.authEnabled && auth.IsViewer(r) {
		writeError(w, http.StatusForbidden, "read-only access: mutations are not allowed for viewer role")
		return true
	}
	return false
}

// logAudit writes an audit log entry if audit logging is enabled.
func (s *Server) logAudit(r *http.Request, action audit.Action, resource, detail string) {
	if s.auditLog == nil {
		return
	}
	userID := ""
	username := "anonymous"
	if claims := auth.ClaimsFromContext(r.Context()); claims != nil {
		userID = claims.UserID
		username = claims.Username
	}
	s.auditLog.Log(r.Context(), userID, username, action, resource, detail, audit.IPFromRequest(r))
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
