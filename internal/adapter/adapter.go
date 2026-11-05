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

	// Aggregate calculates metrics, distributions, or time-series buckets for a column.
	Aggregate(ctx context.Context, table string, opts AggregateOptions) (AggregateResult, error)

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

// ExplainResult holds the structured execution plan and key execution statistics.
type ExplainResult struct {
	Plan            any     `json:"plan"`
	EstimatedRows   *int64  `json:"estimated_rows,omitempty"`
	ActualRows      *int64  `json:"actual_rows,omitempty"`
	ExecutionTimeMs float64 `json:"execution_time_ms,omitempty"`
	IndexUsed       string  `json:"index_used,omitempty"`
	Format          string  `json:"format,omitempty"`
	Raw             string  `json:"raw,omitempty"`
}

// QueryExplainer is an optional interface implemented by database adapters capable of explaining queries.
type QueryExplainer interface {
	ExplainQuery(ctx context.Context, query string) (ExplainResult, error)
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
	Name       string   `json:"name"`
	Columns    []string `json:"columns"`
	Unique     bool     `json:"unique"`
	Primary    bool     `json:"primary,omitempty"`
	Definition string   `json:"definition,omitempty"`
}

// DDLProvider is implemented by database adapters capable of providing table DDL and index definitions.
type DDLProvider interface {
	GetTableDDL(ctx context.Context, table string) (string, error)
	GetTableIndexes(ctx context.Context, table string) ([]IndexInfo, error)
}

// MigrationResult holds the output of a migration dry-run or live execution.
type MigrationResult struct {
	Success      bool     `json:"success"`
	AffectedRows int64    `json:"affected_rows"`
	Plan         []string `json:"plan"`
	Error        string   `json:"error,omitempty"`
	ExecutedAt   string   `json:"executed_at,omitempty"`
	RollbackSQL  string   `json:"rollback_sql,omitempty"`
}

// MigrationRunner is implemented by database adapters that can execute or preview DDL migrations.
type MigrationRunner interface {
	ExecuteMigration(ctx context.Context, ddl string, dryRun bool) (MigrationResult, error)
}

// TableStats holds metadata statistics for a table.
type TableStats struct {
	TotalRows     int64  `json:"total_rows"`
	SizeBytes     int64  `json:"size_bytes"`
	EstimatedRows bool   `json:"estimated_rows"`
	LastUpdated   string `json:"last_updated,omitempty"`
}

// TableStatsProvider is implemented by database adapters that can report table size and stats.
type TableStatsProvider interface {
	GetTableStats(ctx context.Context, table string) (TableStats, error)
}

// AggregateOptions defines parameters for column aggregation requests.
type AggregateOptions struct {
	Column   string   `json:"column"`
	Function string   `json:"function"` // "distribution", "stats", "timeseries" (or "count", "sum", "avg", "min", "max")
	GroupBy  string   `json:"group_by"` // time bucket: "day", "week", "month" (for datetime columns)
	Filters  []Filter `json:"filters"`
	Limit    int      `json:"limit"`
}

// AggregateResult holds the computed aggregate labels, values, and summary statistics.
type AggregateResult struct {
	Labels []string       `json:"labels"`
	Values []any          `json:"values"`
	Stats  map[string]any `json:"stats,omitempty"` // For numeric/general stats (min, max, avg, sum, count, null_count, total_count)
}

// QueryOptions controls filtering, sorting, and pagination for Query calls.
type QueryOptions struct {
	Limit      int
	Offset     int
	Filters    []Filter
	SortBy     string
	SortDesc   bool
	RawFilter  string
	Projection string
	MaxTimeMS  int
	Collation  string
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
	Rows        []map[string]any `json:"rows"`
	TotalCount  int              `json:"total_count"`
	QueryTimeMs float64          `json:"query_time_ms,omitempty"`
}

// ValueMatch is a bounded sample returned by the cross-database search adapter path.
type ValueMatch struct {
	Table     string           `json:"table"`
	Count     int              `json:"count"`
	Column    string           `json:"column"`
	Rows      []map[string]any `json:"rows"`
	Truncated bool             `json:"truncated,omitempty"`
}

// MutationOp describes an insert, update, or delete operation.
type MutationOp struct {
	Type   string // insert, update, delete
	Where  map[string]any
	Values map[string]any
}

// SchemaConstraint preserves ordered columns, including composite foreign keys.
type SchemaConstraint struct {
	Name             string   `json:"name"`
	Kind             string   `json:"kind"`
	Definition       string   `json:"definition,omitempty"`
	Columns          []string `json:"columns"`
	ReferenceTable   string   `json:"reference_table,omitempty"`
	ReferenceSchema  string   `json:"reference_schema,omitempty"`
	ReferenceColumns []string `json:"reference_columns,omitempty"`
}
type ConstraintProvider interface {
	GetSchemaConstraints(context.Context) (map[string][]SchemaConstraint, error)
}

// MongoTypeDistribution holds the count and percentage for a specific BSON type.
type MongoTypeDistribution struct {
	Type       string  `json:"type"`
	Count      int     `json:"count"`
	Percentage float64 `json:"percentage"`
}

// MongoFieldStats provides descriptive statistics for numeric, date, and string values.
type MongoFieldStats struct {
	Min             any      `json:"min,omitempty"`
	Max             any      `json:"max,omitempty"`
	Avg             *float64 `json:"avg,omitempty"`
	MinLength       *int     `json:"min_length,omitempty"`
	MaxLength       *int     `json:"max_length,omitempty"`
	AvgLength       *float64 `json:"avg_length,omitempty"`
	DistinctSamples []any    `json:"distinct_samples,omitempty"`
}

// MongoFieldAnalysis captures the complete sampled schema profile for a collection field.
type MongoFieldAnalysis struct {
	Name          string                  `json:"name"`
	Count         int                     `json:"count"`
	Frequency     float64                 `json:"frequency"`
	MissingCount  int                     `json:"missing_count"`
	MissingRate   float64                 `json:"missing_rate"`
	Types         []MongoTypeDistribution `json:"types"`
	IsPolymorphic bool                    `json:"is_polymorphic"`
	Stats         MongoFieldStats         `json:"stats"`
}

// MongoSchemaAnalysisResult represents the aggregate outcome of collection schema sampling.
type MongoSchemaAnalysisResult struct {
	Collection      string               `json:"collection"`
	TotalSampled    int                  `json:"total_sampled"`
	TotalFields     int                  `json:"total_fields"`
	ExecutionTimeMs float64              `json:"execution_time_ms"`
	Fields          []MongoFieldAnalysis `json:"fields"`
}

// MongoSchemaAnalyzer is implemented by database adapters capable of sampling documents and analyzing field schemas.
type MongoSchemaAnalyzer interface {
	AnalyzeSchema(ctx context.Context, table string, sampleSize int) (*MongoSchemaAnalysisResult, error)
}

// PipelinePreviewResult holds intermediate documents and execution metrics for aggregation stages.
type PipelinePreviewResult struct {
	Documents       []map[string]any `json:"documents"`
	Count           int              `json:"count"`
	ExecutionTimeMs float64          `json:"execution_time_ms"`
}

// PipelinePreviewer is implemented by database adapters capable of previewing aggregation pipeline stages.
type PipelinePreviewer interface {
	PreviewPipeline(ctx context.Context, table string, stagesJSON string, limit int) (*PipelinePreviewResult, error)
}
