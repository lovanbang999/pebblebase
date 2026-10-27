// Package clickhouse implements adapter.Adapter for ClickHouse OLAP databases using github.com/ClickHouse/clickhouse-go/v2.
package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
)

var (
	_ adapter.Adapter            = (*ClickHouseAdapter)(nil)
	_ adapter.RawRunner          = (*ClickHouseAdapter)(nil)
	_ adapter.StreamExporter     = (*ClickHouseAdapter)(nil)
	_ adapter.BulkImporter       = (*ClickHouseAdapter)(nil)
	_ adapter.QueryExplainer     = (*ClickHouseAdapter)(nil)
	_ adapter.DDLProvider        = (*ClickHouseAdapter)(nil)
	_ adapter.TableStatsProvider = (*ClickHouseAdapter)(nil)
	_ adapter.MigrationRunner    = (*ClickHouseAdapter)(nil)
)

// ClickHouseAdapter implements adapter.Adapter for ClickHouse OLAP databases.
type ClickHouseAdapter struct {
	db *sql.DB
}

// New creates a ClickHouseAdapter, establishes the connection pool, and verifies connectivity.
func New(ctx context.Context, dsn string) (*ClickHouseAdapter, error) {
	opts, err := clickhouse.ParseDSN(dsn)
	if err != nil {
		return nil, fmt.Errorf("clickhouse: parse dsn: %w", err)
	}

	db := clickhouse.OpenDB(opts)
	// Standard connection pool limits to prevent memory bloat
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	db.SetConnMaxIdleTime(5 * time.Minute)
	db.SetConnMaxLifetime(30 * time.Minute)

	a := &ClickHouseAdapter{db: db}
	if err := a.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return a, nil
}

// Ping verifies that ClickHouse is reachable.
func (a *ClickHouseAdapter) Ping(ctx context.Context) error {
	if err := a.db.PingContext(ctx); err != nil {
		return fmt.Errorf("clickhouse: ping: %w", err)
	}
	return nil
}

// Close closes all database pool connections.
func (a *ClickHouseAdapter) Close() error {
	return a.db.Close()
}

// Introspect reads table metadata (including MergeTree, Log engines) and columns.
func (a *ClickHouseAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return introspect(ctx, a.db)
}

// Query fetches rows from a ClickHouse table with optional filtering, sorting, and pagination.
func (a *ClickHouseAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return queryTable(ctx, a.db, table, opts)
}

// Mutate executes insert, lightweight update, or lightweight delete.
func (a *ClickHouseAdapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	return mutate(ctx, a.db, table, op)
}

// ExecuteRaw runs an arbitrary ClickHouse SQL statement.
func (a *ClickHouseAdapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return executeRaw(ctx, a.db, query)
}

// StreamRows streams table rows in chunks of up to 5,000 for high-throughput OLAP exports.
func (a *ClickHouseAdapter) StreamRows(ctx context.Context, table string, opts adapter.QueryOptions, onChunk func(columns []string, rows []map[string]any) error) error {
	return streamTableRows(ctx, a.db, table, opts, onChunk)
}

// BulkInsert inserts rows in transactional batches.
func (a *ClickHouseAdapter) BulkInsert(ctx context.Context, table string, columns []string, records [][]any) (int64, error) {
	return bulkInsert(ctx, a.db, table, columns, records)
}
