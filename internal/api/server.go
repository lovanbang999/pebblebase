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
	"time"

	"pebblebase/internal/adapter"
	clickhouseadapter "pebblebase/internal/adapter/clickhouse"
	mongoadapter "pebblebase/internal/adapter/mongodb"
	mssqladapter "pebblebase/internal/adapter/mssql"
	mysqladapter "pebblebase/internal/adapter/mysql"
	pgadapter "pebblebase/internal/adapter/postgres"
	redisadapter "pebblebase/internal/adapter/redis"
	sqliteadapter "pebblebase/internal/adapter/sqlite"
	"pebblebase/internal/ai"
	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
	"pebblebase/internal/consolesession"
	"pebblebase/internal/migration"
	"pebblebase/internal/savedquery"
	"pebblebase/internal/storage"
)

// Server holds shared dependencies and exposes the route-registration method.
type Server struct {
	store           *storage.Store
	enc             *storage.Encryptor
	cache           *adapterCache
	authSvc         *auth.Service
	auditLog        *audit.Logger
	querySvc        *savedquery.Store
	migrationSvc    *migration.Store
	aiSvc           *ai.Service
	authEnabled     bool
	consoleSessions *consolesession.Manager
	consoleCancel   context.CancelFunc
}

// NewServer creates a Server wired with the given dependencies.
// Pass nil for optional services or when running in test mode.
func NewServer(store *storage.Store, enc *storage.Encryptor, authSvc *auth.Service, auditLog *audit.Logger, querySvc *savedquery.Store, migrationSvc *migration.Store, aiSvc *ai.Service, authEnabled bool) *Server {
	ctx, cancel := context.WithCancel(context.Background())
	sessions := consolesession.New(4, 16)
	go sessions.Run(ctx)
	return &Server{
		consoleSessions: sessions, consoleCancel: cancel,
		store:        store,
		enc:          enc,
		cache:        newAdapterCache(10, 15*time.Minute),
		authSvc:      authSvc,
		auditLog:     auditLog,
		querySvc:     querySvc,
		migrationSvc: migrationSvc,
		aiSvc:        aiSvc,
		authEnabled:  authEnabled,
	}
}

// SetAIService updates the AI service reference on the Server.
func (s *Server) SetAIService(aiSvc *ai.Service) {
	s.aiSvc = aiSvc
}

// RegisterRoutes registers all /api/* routes on mux.
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// Public auth routes (never guarded)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)

	// Build middleware chain for protected routes
	protect := s.protectMiddleware()
	adminProtect := func(handler http.Handler) http.Handler {
		return protect(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if s.authEnabled && !auth.RequireAdmin(w, r) {
				return
			}
			handler.ServeHTTP(w, r)
		}))
	}

	// Auth user management
	mux.Handle("GET /api/auth/me", protect(http.HandlerFunc(s.handleMe)))
	mux.Handle("GET /api/auth/users", adminProtect(http.HandlerFunc(s.handleListUsers)))
	mux.Handle("POST /api/auth/users", adminProtect(http.HandlerFunc(s.handleCreateUser)))
	mux.Handle("PATCH /api/auth/users/{id}", adminProtect(http.HandlerFunc(s.handleUpdateUserAccess)))
	mux.Handle("DELETE /api/auth/users/{id}", adminProtect(http.HandlerFunc(s.handleDeleteUser)))
	mux.Handle("PATCH /api/auth/users/{id}/password", protect(http.HandlerFunc(s.handleChangePassword)))

	// Audit log
	mux.Handle("GET /api/audit/logs", adminProtect(http.HandlerFunc(s.handleListAuditLogs)))

	mux.Handle("GET /api/workspaces", protect(http.HandlerFunc(s.listWorkspaces)))
	mux.Handle("PUT /api/workspaces", adminProtect(http.HandlerFunc(s.saveWorkspaces)))
	// Connection management
	mux.Handle("POST /api/connections/test", adminProtect(http.HandlerFunc(s.testConnection)))
	mux.Handle("POST /api/connections", adminProtect(http.HandlerFunc(s.createConnection)))
	mux.Handle("PUT /api/connections/{id}", adminProtect(http.HandlerFunc(s.updateConnection)))
	mux.Handle("GET /api/connections", protect(http.HandlerFunc(s.listConnections)))
	mux.Handle("DELETE /api/connections/{id}", adminProtect(http.HandlerFunc(s.deleteConnection)))
	mux.Handle("POST /api/connections/{id}/ping", protect(http.HandlerFunc(s.pingConnection)))

	// Schema introspection
	mux.Handle("GET /api/connections/{id}/tables", protect(http.HandlerFunc(s.listTables)))
	mux.Handle("GET /api/connections/{id}/erd", protect(http.HandlerFunc(s.getERD)))

	// Row operations
	mux.Handle("GET /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.queryRows)))
	mux.Handle("POST /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.insertRow)))
	mux.Handle("PATCH /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.updateRow)))
	mux.Handle("DELETE /api/connections/{id}/tables/{table}/rows", protect(http.HandlerFunc(s.deleteRow)))

	// Redis Key Browser & Multi-Type Value Operations
	mux.Handle("GET /api/connections/{id}/redis/scan", protect(http.HandlerFunc(s.handleRedisScan)))
	mux.Handle("GET /api/connections/{id}/redis/key", protect(http.HandlerFunc(s.handleRedisKeyDetail)))
	mux.Handle("PUT /api/connections/{id}/redis/key", protect(http.HandlerFunc(s.handleRedisKeyUpdate)))
	mux.Handle("POST /api/connections/{id}/redis/key/item", protect(http.HandlerFunc(s.handleRedisKeyItemMutate)))
	mux.Handle("DELETE /api/connections/{id}/redis/key", protect(http.HandlerFunc(s.handleRedisKeyDelete)))

	// Redis Pub/Sub Streaming & Publishing
	mux.Handle("GET /api/connections/{id}/redis/pubsub/stream", protect(http.HandlerFunc(s.handleRedisPubSubStream)))
	mux.Handle("POST /api/connections/{id}/redis/pubsub/publish", protect(http.HandlerFunc(s.handleRedisPubSubPublish)))

	mux.Handle("POST /api/connections/{id}/console-sessions", protect(http.HandlerFunc(s.beginConsoleSession)))
	mux.Handle("POST /api/console-sessions/{session}/query", protect(http.HandlerFunc(s.executeConsoleSession)))
	mux.Handle("POST /api/console-sessions/{session}/commit", protect(http.HandlerFunc(s.finishConsoleSession)))
	mux.Handle("POST /api/console-sessions/{session}/rollback", protect(http.HandlerFunc(s.finishConsoleSession)))
	mux.Handle("DELETE /api/console-sessions/{session}", protect(http.HandlerFunc(s.finishConsoleSession)))
	mux.Handle("GET /api/connections/{id}/schema-metadata", protect(http.HandlerFunc(s.getSchemaMetadata)))
	mux.Handle("POST /api/find-everywhere", protect(http.HandlerFunc(s.findEverywhere)))
	mux.Handle("POST /api/references/resolve", protect(http.HandlerFunc(s.resolveReferences)))
	// Ad-hoc raw SQL and Mongo query execution
	mux.Handle("POST /api/connections/{id}/query", protect(http.HandlerFunc(s.executeRawQuery)))
	mux.Handle("POST /api/connections/{id}/explain", protect(http.HandlerFunc(s.explainQuery)))

	// Bulk export & import
	mux.Handle("GET /api/connections/{id}/tables/{table}/export", protect(http.HandlerFunc(s.exportTable)))
	mux.Handle("POST /api/connections/{id}/tables/{table}/import", protect(http.HandlerFunc(s.importTable)))

	// Schema DDL, Indexes & Diff
	mux.Handle("GET /api/connections/{id}/tables/{table}/ddl", protect(http.HandlerFunc(s.getTableDDL)))
	mux.Handle("POST /api/connections/{id}/seed", protect(http.HandlerFunc(s.generateSeedSQL)))
	mux.Handle("GET /api/diff", protect(http.HandlerFunc(s.handleSchemaDiff)))

	// Column Analytics & Table Statistics
	mux.Handle("GET /api/connections/{id}/tables/{table}/aggregate", protect(http.HandlerFunc(s.handleAggregate)))
	mux.Handle("GET /api/connections/{id}/tables/{table}/stats", protect(http.HandlerFunc(s.handleTableStats)))

	// Saved Queries (Query Library)
	mux.Handle("GET /api/connections/{id}/saved-queries", protect(http.HandlerFunc(s.listSavedQueries)))
	mux.Handle("POST /api/connections/{id}/saved-queries", protect(http.HandlerFunc(s.createSavedQuery)))
	mux.Handle("PATCH /api/connections/{id}/saved-queries/{qid}", protect(http.HandlerFunc(s.updateSavedQuery)))
	mux.Handle("DELETE /api/connections/{id}/saved-queries/{qid}", protect(http.HandlerFunc(s.deleteSavedQuery)))
	mux.Handle("GET /api/connections/{id}/saved-queries/{qid}/export", protect(http.HandlerFunc(s.exportSavedQuery)))

	// Query History (audit log, filtered by connection)
	mux.Handle("GET /api/connections/{id}/query-history", protect(http.HandlerFunc(s.handleQueryHistory)))

	// In-App Schema Migrations
	mux.Handle("POST /api/connections/{id}/migrations", protect(http.HandlerFunc(s.executeMigration)))
	mux.Handle("GET /api/connections/{id}/migrations", protect(http.HandlerFunc(s.listMigrations)))
	mux.Handle("POST /api/connections/{id}/migrations/{mid}/rollback", protect(http.HandlerFunc(s.rollbackMigration)))

	// Privacy-First AI BYO Key Vault & LLM Providers
	mux.Handle("GET /api/ai/config", adminProtect(http.HandlerFunc(s.handleGetAIConfig)))
	mux.Handle("GET /api/ai/status", protect(http.HandlerFunc(s.handleAIStatus)))
	mux.Handle("POST /api/ai/config", adminProtect(http.HandlerFunc(s.handleSaveAIConfig)))
	mux.Handle("POST /api/ai/test", adminProtect(http.HandlerFunc(s.handleTestAIConnection)))
	mux.Handle("GET /api/ai/providers", protect(http.HandlerFunc(s.handleGetAIProviders)))
	mux.Handle("POST /api/ai/generate", protect(http.HandlerFunc(s.handleAIGenerate)))
	mux.Handle("POST /api/ai/query-assist", protect(http.HandlerFunc(s.handleAIQueryAssist)))
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
// Adapter cache — manages open database connection pools with LRU eviction
// and idle-timeout expiration to prevent memory bloat across multiple databases.
// --------------------------------------------------------------------------

type cacheEntry struct {
	adapter      adapter.Adapter
	lastAccessed time.Time
}

type adapterCache struct {
	mu          sync.Mutex
	entries     map[string]*cacheEntry
	maxCapacity int
	idleTTL     time.Duration
	stopReaper  chan struct{}
	closeOnce   sync.Once
}

func newAdapterCache(maxCapacity int, idleTTL time.Duration) *adapterCache {
	if maxCapacity <= 0 {
		maxCapacity = 10
	}
	if idleTTL <= 0 {
		idleTTL = 15 * time.Minute
	}
	c := &adapterCache{
		entries:     make(map[string]*cacheEntry),
		maxCapacity: maxCapacity,
		idleTTL:     idleTTL,
		stopReaper:  make(chan struct{}),
	}
	c.startReaper(1 * time.Minute)
	return c
}

func (c *adapterCache) get(id string) (adapter.Adapter, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, ok := c.entries[id]
	if !ok {
		return nil, false
	}

	// Check if the connection has been idle beyond the configured TTL
	if c.idleTTL > 0 && time.Since(entry.lastAccessed) > c.idleTTL {
		if entry.adapter != nil {
			_ = entry.adapter.Close()
		}
		delete(c.entries, id)
		return nil, false
	}

	entry.lastAccessed = time.Now()
	return entry.adapter, true
}

func (c *adapterCache) set(id string, a adapter.Adapter) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if existing, ok := c.entries[id]; ok {
		if existing.adapter != nil && existing.adapter != a {
			_ = existing.adapter.Close()
		}
		existing.adapter = a
		existing.lastAccessed = time.Now()
		return
	}

	// If capacity reached, evict the least recently accessed adapter
	if len(c.entries) >= c.maxCapacity {
		var oldestID string
		var oldestTime time.Time
		first := true
		for k, entry := range c.entries {
			if first || entry.lastAccessed.Before(oldestTime) {
				oldestID = k
				oldestTime = entry.lastAccessed
				first = false
			}
		}
		if oldestID != "" {
			if evicted := c.entries[oldestID]; evicted != nil && evicted.adapter != nil {
				_ = evicted.adapter.Close()
			}
			delete(c.entries, oldestID)
		}
	}

	c.entries[id] = &cacheEntry{
		adapter:      a,
		lastAccessed: time.Now(),
	}
}

func (c *adapterCache) delete(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if entry, ok := c.entries[id]; ok {
		if entry.adapter != nil {
			_ = entry.adapter.Close()
		}
		delete(c.entries, id)
	}
}

func (c *adapterCache) closeAll() {
	c.closeOnce.Do(func() {
		close(c.stopReaper)
	})
	c.mu.Lock()
	defer c.mu.Unlock()
	for id, entry := range c.entries {
		if entry != nil && entry.adapter != nil {
			_ = entry.adapter.Close()
		}
		delete(c.entries, id)
	}
}

func (c *adapterCache) reapExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.idleTTL <= 0 {
		return
	}
	now := time.Now()
	for id, entry := range c.entries {
		if now.Sub(entry.lastAccessed) > c.idleTTL {
			if entry.adapter != nil {
				_ = entry.adapter.Close()
			}
			delete(c.entries, id)
		}
	}
}

func (c *adapterCache) startReaper(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-c.stopReaper:
				return
			case <-ticker.C:
				c.reapExpired()
			}
		}
	}()
}

// Close gracefully closes all active database adapter pools.
func (s *Server) Close() error {
	if s.consoleCancel != nil {
		s.consoleCancel()
	}
	if s.consoleSessions != nil {
		s.consoleSessions.Close()
	}
	if s.cache != nil {
		s.cache.closeAll()
	}
	return nil
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
	case "redis":
		return redisadapter.New(ctx, dsn)
	case "mssql", "sqlserver":
		return mssqladapter.New(ctx, dsn)
	case "clickhouse":
		return clickhouseadapter.New(ctx, dsn)
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
