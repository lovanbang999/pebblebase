package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"pebblebase/internal/adapter"
)

// queryTable executes a SELECT against the given table with filtering, sort,
// and pagination applied. TotalCount is the count without pagination.
func queryTable(ctx context.Context, pool *pgxpool.Pool, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	where, args := buildWhere(opts.Filters)

	// Safe to interpolate table name here because it comes from Introspect(),
	// not from raw user input.
	baseFrom := fmt.Sprintf("FROM %q %s", table, where)

	// Count query — no ORDER BY / LIMIT needed.
	countSQL := "SELECT COUNT(*) " + baseFrom
	var total int
	if err := pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("postgres: count %q: %w", table, err)
	}

	// Data query.
	dataSQL := buildSelect(table, where, opts)
	rows, err := pool.Query(ctx, dataSQL, args...)
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("postgres: query %q: %w", table, err)
	}
	defer rows.Close()

	fieldDescs := rows.FieldDescriptions()
	colNames := make([]string, len(fieldDescs))
	for i, fd := range fieldDescs {
		colNames[i] = string(fd.Name)
	}

	var result []map[string]any
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return adapter.QueryResult{}, fmt.Errorf("postgres: scan row: %w", err)
		}
		row := make(map[string]any, len(colNames))
		for i, col := range colNames {
			row[col] = values[i]
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("postgres: iterate rows: %w", err)
	}

	return adapter.QueryResult{Rows: result, TotalCount: total}, nil
}

// buildSelect constructs the full SELECT statement including ORDER BY and LIMIT.
func buildSelect(table, where string, opts adapter.QueryOptions) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, `SELECT * FROM %q %s`, table, where)

	if opts.SortBy != "" {
		dir := "ASC"
		if opts.SortDesc {
			dir = "DESC"
		}
		fmt.Fprintf(&sb, ` ORDER BY %q %s`, opts.SortBy, dir)
	}

	if opts.Limit > 0 {
		fmt.Fprintf(&sb, " LIMIT %d", opts.Limit)
	}
	if opts.Offset > 0 {
		fmt.Fprintf(&sb, " OFFSET %d", opts.Offset)
	}

	return sb.String()
}

// buildWhere builds a parameterized WHERE clause from a slice of filters.
// Returns the clause string (empty string if no filters) and the argument slice.
func buildWhere(filters []adapter.Filter) (string, []any) {
	if len(filters) == 0 {
		return "", nil
	}

	clauses := make([]string, 0, len(filters))
	args := make([]any, 0, len(filters))

	for _, f := range filters {
		n := len(args) + 1
		switch f.Operator {
		case "eq":
			clauses = append(clauses, fmt.Sprintf("%q = $%d", f.Column, n))
			args = append(args, f.Value)
		case "neq":
			clauses = append(clauses, fmt.Sprintf("%q != $%d", f.Column, n))
			args = append(args, f.Value)
		case "gt":
			clauses = append(clauses, fmt.Sprintf("%q > $%d", f.Column, n))
			args = append(args, f.Value)
		case "lt":
			clauses = append(clauses, fmt.Sprintf("%q < $%d", f.Column, n))
			args = append(args, f.Value)
		case "contains":
			clauses = append(clauses, fmt.Sprintf("%q ILIKE $%d", f.Column, n))
			args = append(args, "%"+fmt.Sprintf("%v", f.Value)+"%")
		case "in":
			clauses = append(clauses, fmt.Sprintf("%q = ANY($%d)", f.Column, n))
			args = append(args, f.Value)
		default:
			// Unknown operator — skip rather than produce invalid SQL.
			continue
		}
	}

	if len(clauses) == 0 {
		return "", nil
	}
	return "WHERE " + strings.Join(clauses, " AND "), args
}
