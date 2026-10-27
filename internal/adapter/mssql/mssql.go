// Package mssql implements adapter.Adapter for Microsoft SQL Server databases using github.com/microsoft/go-mssqldb.
package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"

	_ "github.com/microsoft/go-mssqldb"
)

var (
	_ adapter.Adapter            = (*MSSQLAdapter)(nil)
	_ adapter.RawRunner          = (*MSSQLAdapter)(nil)
	_ adapter.StreamExporter     = (*MSSQLAdapter)(nil)
	_ adapter.BulkImporter       = (*MSSQLAdapter)(nil)
	_ adapter.QueryExplainer     = (*MSSQLAdapter)(nil)
	_ adapter.DDLProvider        = (*MSSQLAdapter)(nil)
	_ adapter.TableStatsProvider = (*MSSQLAdapter)(nil)
	_ adapter.MigrationRunner    = (*MSSQLAdapter)(nil)
)

// MSSQLAdapter implements adapter.Adapter for Microsoft SQL Server.
type MSSQLAdapter struct {
	db *sql.DB
}

// New creates an MSSQLAdapter and verifies connectivity with Ping.
func New(ctx context.Context, dsn string) (*MSSQLAdapter, error) {
	db, err := sql.Open("sqlserver", dsn)
	if err != nil {
		return nil, fmt.Errorf("mssql: open: %w", err)
	}

	// Sane connection pool defaults
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	a := &MSSQLAdapter{db: db}
	if err := a.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return a, nil
}

// Ping verifies that the SQL Server connection is alive.
func (a *MSSQLAdapter) Ping(ctx context.Context) error {
	if err := a.db.PingContext(ctx); err != nil {
		return fmt.Errorf("mssql: ping: %w", err)
	}
	return nil
}

// Close releases all pool connections.
func (a *MSSQLAdapter) Close() error {
	return a.db.Close()
}

// Introspect returns user-defined tables, columns, and relations.
func (a *MSSQLAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return introspect(ctx, a.db)
}

// Query fetches rows applying filtering, sorting, and T-SQL pagination.
func (a *MSSQLAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return queryTable(ctx, a.db, table, opts)
}

// Mutate executes insert, update, or delete on the given table.
func (a *MSSQLAdapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	return mutate(ctx, a.db, table, op)
}

// ExecuteRaw runs an arbitrary T-SQL statement.
func (a *MSSQLAdapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return executeRaw(ctx, a.db, query)
}

// StreamRows streams table rows in chunks for bulk export.
func (a *MSSQLAdapter) StreamRows(ctx context.Context, table string, opts adapter.QueryOptions, onChunk func(columns []string, rows []map[string]any) error) error {
	return streamTableRows(ctx, a.db, table, opts, onChunk)
}

// BulkInsert transactionally inserts multiple records in batches.
func (a *MSSQLAdapter) BulkInsert(ctx context.Context, table string, columns []string, records [][]any) (int64, error) {
	return bulkInsert(ctx, a.db, table, columns, records)
}
