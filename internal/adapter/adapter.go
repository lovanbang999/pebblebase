// Package adapter defines the database-agnostic interface that all driver
// implementations (Postgres, MySQL, MongoDB) must satisfy.
//
// All UI and API layers communicate exclusively through Adapter — no layer
// imports a concrete driver directly. This keeps the upper layers free of
// database-specific knowledge and makes adding new drivers straightforward.
package adapter

import (
	"context"

	"pebblebase/internal/schema"
)

// Adapter is the contract that Postgres, MySQL, and MongoDB adapters must all implement.
// UI and API layers ONLY communicate through this interface — never import specific
// drivers directly.
type Adapter interface {
	// Introspect returns the full structure of the database: tables, columns, and relations.
	Introspect(ctx context.Context) ([]schema.Table, error)

	// Query fetches rows from the given table with optional filtering, sorting, and pagination.
	Query(ctx context.Context, table string, opts QueryOptions) (QueryResult, error)

	// Mutate performs an insert, update, or delete operation on the given table.
	Mutate(ctx context.Context, table string, op MutationOp) error

	// Ping verifies that the underlying connection is alive.
	Ping(ctx context.Context) error

	// Close releases all resources held by the adapter.
	Close() error
}

// QueryOptions controls filtering, sorting, and pagination for Query calls.
type QueryOptions struct {
	Limit    int
	Offset   int
	Filters  []Filter
	SortBy   string
	SortDesc bool
}

// Filter represents a single WHERE condition applied to a Query.
type Filter struct {
	Column   string
	Operator string // eq, neq, gt, lt, contains, in
	Value    any
}

// QueryResult holds the rows returned by a Query call along with the total
// unfiltered count, which the frontend uses for pagination.
type QueryResult struct {
	Rows       []map[string]any
	TotalCount int
}

// MutationOp describes an insert, update, or delete operation.
type MutationOp struct {
	Type   string // insert, update, delete
	Where  map[string]any
	Values map[string]any
}
