// Package mysql implements adapter.Adapter for MySQL databases using go-sql-driver/mysql.
package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
)

// MySQLAdapter implements adapter.Adapter for MySQL.
type MySQLAdapter struct {
	db *sql.DB
}

// New creates a MySQLAdapter and verifies the connection with PingContext.
func New(ctx context.Context, dsn string) (*MySQLAdapter, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("mysql: open: %w", err)
	}

	// Sane connection pool defaults
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	a := &MySQLAdapter{db: db}
	if err := a.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return a, nil
}

// Ping verifies that the connection is alive.
func (a *MySQLAdapter) Ping(ctx context.Context) error {
	if err := a.db.PingContext(ctx); err != nil {
		return fmt.Errorf("mysql: ping: %w", err)
	}
	return nil
}

// Close releases all pool connections.
func (a *MySQLAdapter) Close() error {
	return a.db.Close()
}

// Introspect returns all user-defined tables in the active database with their
// columns and foreign-key relations.
func (a *MySQLAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return introspect(ctx, a.db)
}

// Query fetches rows from the given table applying optional filters, sort,
// and pagination. TotalCount reflects the count without pagination applied.
func (a *MySQLAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return queryTable(ctx, a.db, table, opts)
}

// Mutate executes an insert, update, or delete on the given table.
func (a *MySQLAdapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	return mutate(ctx, a.db, table, op)
}

// ExecuteRaw runs an arbitrary SQL statement and returns the columns, rows, latency, and rows affected.
func (a *MySQLAdapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return executeRaw(ctx, a.db, query)
}

// StreamRows streams table rows in chunks for bulk export.
func (a *MySQLAdapter) StreamRows(ctx context.Context, table string, opts adapter.QueryOptions, onChunk func(columns []string, rows []map[string]any) error) error {
	return streamTableRows(ctx, a.db, table, opts, onChunk)
}

// BulkInsert transactionally inserts multiple records in batches.
func (a *MySQLAdapter) BulkInsert(ctx context.Context, table string, columns []string, records [][]any) (int64, error) {
	return bulkInsert(ctx, a.db, table, columns, records)
}
