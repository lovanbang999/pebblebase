// Package postgres implements adapter.Adapter for PostgreSQL databases using pgx/v5.
package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
)

// PostgresAdapter implements adapter.Adapter for PostgreSQL.
type PostgresAdapter struct {
	pool *pgxpool.Pool
}

// New creates a PostgresAdapter and verifies the connection with a Ping.
func New(ctx context.Context, dsn string) (*PostgresAdapter, error) {
	pool, err := pgxpool.New(ctx, dsn)
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
