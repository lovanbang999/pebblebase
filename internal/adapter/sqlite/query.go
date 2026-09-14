package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

// queryTable executes a SELECT against the given SQLite table with filtering,
// sorting, and pagination applied.
func queryTable(ctx context.Context, db *sql.DB, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	where, whereArgs := buildWhere(opts.Filters)

	baseFrom := fmt.Sprintf(`FROM "%s" %s`, escapeIdentifier(table), where)

	// Count query
	countSQL := "SELECT COUNT(*) " + baseFrom
	var total int
	if err := db.QueryRowContext(ctx, countSQL, whereArgs...).Scan(&total); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("sqlite: count %q: %w", table, err)
	}

	// Data query
	dataSQL, dataArgs := buildSelect(table, where, whereArgs, opts)
	rows, err := db.QueryContext(ctx, dataSQL, dataArgs...)
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("sqlite: query %q: %w", table, err)
	}
	defer rows.Close()

	colNames, err := rows.Columns()
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("sqlite: get columns: %w", err)
	}

	var result []map[string]any
	for rows.Next() {
		values := make([]any, len(colNames))
		valuePtrs := make([]any, len(colNames))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return adapter.QueryResult{}, fmt.Errorf("sqlite: scan row: %w", err)
		}

		row := make(map[string]any, len(colNames))
		for i, col := range colNames {
			val := values[i]
			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("sqlite: iterate rows: %w", err)
	}

	if result == nil {
		result = []map[string]any{}
	}

	return adapter.QueryResult{Rows: result, TotalCount: total}, nil
}

func buildSelect(table, where string, whereArgs []any, opts adapter.QueryOptions) (string, []any) {
	var sb strings.Builder
	fmt.Fprintf(&sb, `SELECT * FROM "%s" %s`, escapeIdentifier(table), where)

	args := append([]any{}, whereArgs...)

	if opts.SortBy != "" {
		dir := "ASC"
		if opts.SortDesc {
			dir = "DESC"
		}
		fmt.Fprintf(&sb, ` ORDER BY "%s" %s`, escapeIdentifier(opts.SortBy), dir)
	}

	if opts.Limit > 0 {
		fmt.Fprintf(&sb, " LIMIT %d", opts.Limit)
		if opts.Offset > 0 {
			fmt.Fprintf(&sb, " OFFSET %d", opts.Offset)
		}
	} else if opts.Offset > 0 {
		fmt.Fprintf(&sb, " LIMIT -1 OFFSET %d", opts.Offset)
	}

	return sb.String(), args
}

func buildWhere(filters []adapter.Filter) (string, []any) {
	if len(filters) == 0 {
		return "", nil
	}

	clauses := make([]string, 0, len(filters))
	args := make([]any, 0, len(filters))

	for _, f := range filters {
		col := fmt.Sprintf(`"%s"`, escapeIdentifier(f.Column))
		switch f.Operator {
		case "eq":
			clauses = append(clauses, col+" = ?")
			args = append(args, f.Value)
		case "neq":
			clauses = append(clauses, col+" != ?")
			args = append(args, f.Value)
		case "gt":
			clauses = append(clauses, col+" > ?")
			args = append(args, f.Value)
		case "lt":
			clauses = append(clauses, col+" < ?")
			args = append(args, f.Value)
		case "contains":
			clauses = append(clauses, col+" LIKE ?")
			args = append(args, fmt.Sprintf("%%%v%%", f.Value))
		case "in":
			clauses = append(clauses, col+" IN (?)")
			args = append(args, f.Value)
		default:
			clauses = append(clauses, col+" = ?")
			args = append(args, f.Value)
		}
	}

	return "WHERE " + strings.Join(clauses, " AND "), args
}

func escapeIdentifier(s string) string {
	return strings.ReplaceAll(s, `"`, `""`)
}
