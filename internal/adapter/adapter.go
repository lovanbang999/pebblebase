// Package adapter defines the database-agnostic interface that all driver
// implementations (Postgres, MySQL, MongoDB) must satisfy.
//
// All UI and API layers communicate exclusively through Adapter — no layer
// imports a concrete driver directly. This keeps the upper layers free of
// database-specific knowledge and makes adding new drivers straightforward.
package adapter

import (
	"context"
	"math"
	"time"

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

	// ExecuteRaw runs an arbitrary SQL statement or MongoDB command/query.
	ExecuteRaw(ctx context.Context, query string) (RawQueryResult, error)

	// Ping verifies that the underlying connection is alive.
	Ping(ctx context.Context) error

	// Close releases all resources held by the adapter.
	Close() error
}

// RawQueryResult holds the result of executing an arbitrary query.
type RawQueryResult struct {
	Columns         []string         `json:"columns"`
	Rows            []map[string]any `json:"rows"`
	ExecutionTimeMs float64          `json:"execution_time_ms"`
	RowsAffected    int64            `json:"rows_affected"`
	IsMutation      bool             `json:"is_mutation"`
}

// ElapsedMs calculates execution latency in milliseconds with 2-decimal precision.
func ElapsedMs(start time.Time) float64 {
	elapsed := float64(time.Since(start).Microseconds()) / 1000.0
	if elapsed < 0.01 {
		return 0.01
	}
	return math.Round(elapsed*100) / 100
}

// RawRunner is implemented by adapters capable of executing arbitrary raw queries.
type RawRunner interface {
	ExecuteRaw(ctx context.Context, query string) (RawQueryResult, error)
}

// StreamExporter is implemented by adapters supporting chunked row streaming for bulk exports.
type StreamExporter interface {
	StreamRows(ctx context.Context, table string, opts QueryOptions, onChunk func(columns []string, rows []map[string]any) error) error
}

// BulkImporter is implemented by adapters supporting transactional batch row insertion.
type BulkImporter interface {
	BulkInsert(ctx context.Context, table string, columns []string, records [][]any) (int64, error)
}

// IndexInfo describes a table index and its uniqueness.
type IndexInfo struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
	Primary bool     `json:"primary,omitempty"`
}

// DDLProvider is implemented by database adapters capable of providing table DDL and index definitions.
type DDLProvider interface {
	GetTableDDL(ctx context.Context, table string) (string, error)
	GetTableIndexes(ctx context.Context, table string) ([]IndexInfo, error)
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
	Rows       []map[string]any `json:"rows"`
	TotalCount int              `json:"total_count"`
}

// MutationOp describes an insert, update, or delete operation.
type MutationOp struct {
	Type   string // insert, update, delete
	Where  map[string]any
	Values map[string]any
}
