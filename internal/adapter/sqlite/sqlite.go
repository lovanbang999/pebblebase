// Package sqlite implements adapter.Adapter for SQLite databases using modernc.org/sqlite (pure Go, CGO-free).
package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"

	_ "modernc.org/sqlite"
)

// SQLiteAdapter implements adapter.Adapter for SQLite.
type SQLiteAdapter struct {
	db   *sql.DB
	path string
}

// New creates a SQLiteAdapter, validates file existence, and initializes connection pragmas.
func New(ctx context.Context, dsn string) (*SQLiteAdapter, error) {
	cleanPath := strings.TrimPrefix(dsn, "file:")
	if idx := strings.Index(cleanPath, "?"); idx != -1 {
		cleanPath = cleanPath[:idx]
	}

	// Validate file existence unless in-memory
	if cleanPath != ":memory:" && !strings.HasPrefix(cleanPath, ":memory:") {
		if _, err := os.Stat(cleanPath); err != nil {
			if os.IsNotExist(err) {
				return nil, fmt.Errorf("sqlite: file does not exist: %q", cleanPath)
			}
			return nil, fmt.Errorf("sqlite: stat file %q: %w", cleanPath, err)
		}
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("sqlite: open: %w", err)
	}

	// Safe connection pool parameters for embedded file database
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(10 * time.Minute)

	// Execute recommended Pragmas
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite: enable foreign_keys: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA busy_timeout = 5000;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite: set busy_timeout: %w", err)
	}
	if cleanPath != ":memory:" {
		// WAL mode enables concurrent readers alongside writers
		if _, err := db.ExecContext(ctx, "PRAGMA journal_mode = WAL;"); err != nil {
			// Non-fatal if filesystem doesn't support WAL (e.g. read-only mounts)
			_ = err
		}
	}

	a := &SQLiteAdapter{
		db:   db,
		path: cleanPath,
	}

	if err := a.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}

	return a, nil
}

// Ping verifies that the SQLite connection is responsive.
func (a *SQLiteAdapter) Ping(ctx context.Context) error {
	if err := a.db.PingContext(ctx); err != nil {
		return fmt.Errorf("sqlite: ping: %w", err)
	}
	return nil
}

// Close releases all pool connections.
func (a *SQLiteAdapter) Close() error {
	return a.db.Close()
}

// Introspect returns all user-defined tables with their columns and foreign-key relations.
func (a *SQLiteAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return introspect(ctx, a.db)
}

// Query fetches rows from the given table applying optional filters, sort, and pagination.
func (a *SQLiteAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return queryTable(ctx, a.db, table, opts)
}

// Mutate executes an insert, update, or delete on the given table.
func (a *SQLiteAdapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	return mutate(ctx, a.db, table, op)
}

// ExecuteRaw runs an arbitrary SQL statement and returns the columns, rows, latency, and rows affected.
func (a *SQLiteAdapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return executeRaw(ctx, a.db, query)
}
