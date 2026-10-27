// Package postgres implements adapter.Adapter for PostgreSQL databases using pgx/v5.
package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
)

var (
	_ adapter.Adapter            = (*PostgresAdapter)(nil)
	_ adapter.RawRunner          = (*PostgresAdapter)(nil)
	_ adapter.StreamExporter     = (*PostgresAdapter)(nil)
	_ adapter.BulkImporter       = (*PostgresAdapter)(nil)
	_ adapter.QueryExplainer     = (*PostgresAdapter)(nil)
	_ adapter.DDLProvider        = (*PostgresAdapter)(nil)
	_ adapter.TableStatsProvider = (*PostgresAdapter)(nil)
	_ adapter.MigrationRunner    = (*PostgresAdapter)(nil)
)

// PostgresAdapter implements adapter.Adapter for PostgreSQL.
type PostgresAdapter struct {
	pool *pgxpool.Pool
}

// New creates a PostgresAdapter with standardized connection pool limits and verifies connectivity.
func New(ctx context.Context, dsn string) (*PostgresAdapter, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("postgres: parse dsn: %w", err)
	}

	// Standard connection pool limits to prevent memory bloat
	cfg.MaxConns = 10
	cfg.MinConns = 0
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: create pool: %w", err)
	}
	a := &PostgresAdapter{pool: pool}
	if err := a.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return a, nil
}

// Ping verifies the connection is alive.
func (a *PostgresAdapter) Ping(ctx context.Context) error {
	if err := a.pool.Ping(ctx); err != nil {
		return fmt.Errorf("postgres: ping: %w", err)
	}
	return nil
}

// Close releases all pool connections.
func (a *PostgresAdapter) Close() error {
	a.pool.Close()
	return nil
}

// Introspect returns all user-defined tables in the public schema with their
// columns and foreign-key relations.
func (a *PostgresAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return introspect(ctx, a.pool)
}

// Query fetches rows from the given table applying optional filters, sort,
// and pagination. TotalCount reflects the count without pagination applied.
func (a *PostgresAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return queryTable(ctx, a.pool, table, opts)
}

// Mutate executes an insert, update, or delete on the given table.
func (a *PostgresAdapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	return mutate(ctx, a.pool, table, op)
}

// ExecuteRaw runs an arbitrary SQL statement and returns the columns, rows, latency, and rows affected.
func (a *PostgresAdapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return executeRaw(ctx, a.pool, query)
}

// StreamRows streams table rows in chunks for bulk export.
func (a *PostgresAdapter) StreamRows(ctx context.Context, table string, opts adapter.QueryOptions, onChunk func(columns []string, rows []map[string]any) error) error {
	return streamTableRows(ctx, a.pool, table, opts, onChunk)
}

// BulkInsert transactionally inserts multiple records in batches.
func (a *PostgresAdapter) BulkInsert(ctx context.Context, table string, columns []string, records [][]any) (int64, error) {
	return bulkInsert(ctx, a.pool, table, columns, records)
}
