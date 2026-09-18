// Package audit provides append-only audit logging for Pebblebase actions.
package audit

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// Action describes the type of action recorded in the audit log.
type Action string

const (
	ActionLogin          Action = "login"
	ActionQueryExecute   Action = "query_execute"
	ActionRowMutate      Action = "row_mutate"
	ActionSchemaChange   Action = "schema_change"
	ActionConnectionCreate Action = "connection_create"
)

// Entry is a single audit log record.
type Entry struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Username  string    `json:"username"`
	Action    Action    `json:"action"`
	Resource  string    `json:"resource"`
	Detail    string    `json:"detail"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"created_at"`
}

// Logger writes audit entries to a SQLite table.
type Logger struct {
	db *sql.DB
}

// NewLogger opens the audit_log table in the given DB, creating it if needed.
func NewLogger(db *sql.DB) (*Logger, error) {
	l := &Logger{db: db}
	if err := l.migrate(); err != nil {
		return nil, fmt.Errorf("audit migrate: %w", err)
	}
	return l, nil
}

func (l *Logger) migrate() error {
	_, err := l.db.Exec(`
		CREATE TABLE IF NOT EXISTS audit_log (
			id         TEXT PRIMARY KEY,
			user_id    TEXT NOT NULL,
			username   TEXT NOT NULL,
			action     TEXT NOT NULL,
			resource   TEXT NOT NULL DEFAULT '',
			detail     TEXT NOT NULL DEFAULT '',
			ip         TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL
		)
	`)
	return err
}

// Log appends an audit entry. Errors are only logged — callers are not blocked.
func (l *Logger) Log(ctx context.Context, userID, username string, action Action, resource, detail, ip string) {
	_, err := l.db.ExecContext(ctx,
		`INSERT INTO audit_log (id, user_id, username, action, resource, detail, ip, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), userID, username, string(action), resource, detail, ip, time.Now().UTC(),
	)
	if err != nil {
		log.Printf("audit: failed to write entry: %v", err)
	}
}

// List returns paginated audit entries, newest first.
func (l *Logger) List(ctx context.Context, limit, offset int) ([]Entry, int, error) {
	var total int
	if err := l.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_log").Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("audit count: %w", err)
	}

	rows, err := l.db.QueryContext(ctx,
		`SELECT id, user_id, username, action, resource, detail, ip, created_at
		 FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("audit list: %w", err)
	}
	defer rows.Close()

	var entries []Entry
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Username, &e.Action, &e.Resource, &e.Detail, &e.IP, &e.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("audit scan: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, total, rows.Err()
}

// ListQueryHistory returns query_execute audit entries for a specific connection name,
// with optional full-text search on the detail (SQL text) field. Results are newest first.
func (l *Logger) ListQueryHistory(ctx context.Context, connectionName, search string, limit, offset int) ([]Entry, int, error) {
	searchPattern := "%" + search + "%"

	var total int
	if err := l.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM audit_log
		 WHERE action = 'query_execute' AND resource = ? AND (? = '' OR detail LIKE ?)`,
		connectionName, search, searchPattern,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("audit history count: %w", err)
	}

	rows, err := l.db.QueryContext(ctx,
		`SELECT id, user_id, username, action, resource, detail, ip, created_at
		 FROM audit_log
		 WHERE action = 'query_execute' AND resource = ? AND (? = '' OR detail LIKE ?)
		 ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		connectionName, search, searchPattern, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("audit history list: %w", err)
	}
	defer rows.Close()

	var entries []Entry
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Username, &e.Action, &e.Resource, &e.Detail, &e.IP, &e.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("audit history scan: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, total, rows.Err()
}

// IPFromRequest extracts the client IP from the request, respecting X-Forwarded-For.
func IPFromRequest(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return fwd
	}
	return r.RemoteAddr
}
