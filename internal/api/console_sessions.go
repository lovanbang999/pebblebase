package api

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/auth"
	"pebblebase/internal/consolesession"
)

type consoleSessionStarter interface {
	BeginConsoleSession(context.Context) (consolesession.Transaction, error)
}

// Each session has a dedicated adapter pool, so cache eviction cannot close a
// transaction's pool. Caps bound the total number of these pinned connections.
type ownedConsoleTransaction struct {
	consolesession.Transaction
	pool   adapter.Adapter
	once   sync.Once
	check  func() bool
	engine string
}

var consoleControlTokens = regexp.MustCompile(`(?i)\b(BEGIN|START|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|PREPARE|EXECUTE|CALL|DO|COPY|VACUUM|LOCK|UNLOCK|GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|RENAME|USE)\b`)

func (t *ownedConsoleTransaction) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	if !t.check() {
		return adapter.RawQueryResult{}, errors.New("read-only mode")
	}
	// Transaction controls and statements with implicit commit semantics must not
	// escape the session lifetime. DDL remains available in Auto mode.
	clean := strings.TrimSpace(stripSQLCommentsAndStrings(query))
	clean = strings.TrimSpace(strings.TrimSuffix(clean, ";"))
	if strings.Contains(query, "/*!") || strings.Contains(query, "/*M!") || regexp.MustCompile(`(?i)^SET\b`).MatchString(clean) {
		return adapter.RawQueryResult{}, errors.New("statement not supported in manual mode")
	}
	if !regexp.MustCompile(`(?i)^(SELECT|INSERT|UPDATE|DELETE|WITH|SHOW|EXPLAIN|DESCRIBE|DESC)\b`).MatchString(clean) || consoleControlTokens.MatchString(clean) || strings.Contains(clean, ";") {
		return adapter.RawQueryResult{}, errors.New("statement not supported in manual mode")
	}
	return t.Transaction.ExecuteRaw(ctx, query)
}
func (t *ownedConsoleTransaction) release() { t.once.Do(func() { _ = t.pool.Close() }) }
func (t *ownedConsoleTransaction) Commit(ctx context.Context) error {
	defer t.release()
	return t.Transaction.Commit(ctx)
}
func (t *ownedConsoleTransaction) Rollback(ctx context.Context) error {
	defer t.release()
	return t.Transaction.Rollback(ctx)
}

func (s *Server) consoleOwner(r *http.Request) string {
	if claims := auth.ClaimsFromContext(r.Context()); claims != nil {
		return claims.UserID
	}
	if !s.authEnabled {
		return "local-desktop"
	}
	return ""
}
func sessionError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, consolesession.ErrUnavailable):
		writeError(w, 404, "console session not found")
	case errors.Is(err, consolesession.ErrTabInUse):
		writeError(w, 409, "console tab already has a session")
	case errors.Is(err, consolesession.ErrCapacity):
		writeError(w, 429, "console session capacity reached (4 per user, 16 total)")
	case errors.Is(err, consolesession.ErrAborted):
		writeError(w, 409, "transaction aborted: rollback required")
	default:
		writeError(w, 400, "console session operation failed")
	}
}
func (s *Server) beginConsoleSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TabID string `json:"tab_id"`
	}
	if decodeBody(r, &req) != nil || strings.TrimSpace(req.TabID) == "" || len(req.TabID) > 256 {
		writeError(w, 400, "valid tab_id is required")
		return
	}
	id := r.PathValue("id")
	rec, err := s.store.Get(id)
	if err != nil {
		writeError(w, 404, "connection not found")
		return
	}
	if rec.ReadOnly || auth.IsViewer(r) {
		writeError(w, 403, "read-only mode: mutating queries are forbidden")
		return
	}
	if rec.Type != "postgres" && rec.Type != "mysql" {
		writeError(w, 400, "manual mode supports PostgreSQL and MySQL only")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	sessionID, err := s.consoleSessions.Begin(ctx, s.consoleOwner(r), req.TabID, func(ctx context.Context) (consolesession.Transaction, error) {
		dsn, err := s.store.DSN(id)
		if err != nil {
			return nil, err
		}
		pool, err := openAdapter(ctx, rec.Type, dsn)
		if err != nil {
			return nil, err
		}
		transferred := false
		defer func() {
			if !transferred {
				_ = pool.Close()
			}
		}()
		starter, ok := pool.(consoleSessionStarter)
		if !ok {
			return nil, errors.New("unsupported engine")
		}
		tx, err := starter.BeginConsoleSession(ctx)
		if err != nil {
			return nil, err
		}
		transferred = true
		return &ownedConsoleTransaction{Transaction: tx, pool: pool, engine: rec.Type, check: func() bool { current, err := s.store.Get(id); return err == nil && !current.ReadOnly }}, nil
	})
	if err != nil {
		sessionError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": sessionID, "idle_timeout_seconds": 300})
}
func (s *Server) executeConsoleSession(w http.ResponseWriter, r *http.Request) {
	var req executeQueryRequest
	if decodeBody(r, &req) != nil || strings.TrimSpace(req.Query) == "" {
		writeError(w, 400, "query cannot be empty")
		return
	}
	if auth.IsViewer(r) {
		writeError(w, 403, "read-only mode: mutating queries are forbidden")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	result, err := s.consoleSessions.Execute(ctx, r.PathValue("session"), s.consoleOwner(r), req.Query)
	if err != nil {
		sessionError(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (s *Server) finishConsoleSession(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := s.consoleSessions.Finish(ctx, r.PathValue("session"), s.consoleOwner(r), strings.HasSuffix(r.URL.Path, "/commit"))
	if err != nil {
		sessionError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"closed": true})
}
