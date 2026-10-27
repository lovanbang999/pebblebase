package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

// queryTable executes a SELECT against a ClickHouse table with filtering,
// sorting, and LIMIT/OFFSET pagination.
func queryTable(ctx context.Context, db *sql.DB, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	where, whereArgs := buildWhere(opts.Filters)

	baseFrom := fmt.Sprintf("FROM %s %s", escapeIdentifier(table), where)

	// Count query
	countSQL := "SELECT count(*) " + baseFrom
	var total int
	if err := db.QueryRowContext(ctx, countSQL, whereArgs...).Scan(&total); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("clickhouse: count %s: %w", table, err)
	}

	// Data query
	dataSQL, dataArgs := buildSelect(table, where, whereArgs, opts)
	rows, err := db.QueryContext(ctx, dataSQL, dataArgs...)
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("clickhouse: query %s: %w", table, err)
	}
	defer rows.Close()

	colNames, err := rows.Columns()
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("clickhouse: get columns: %w", err)
	}

	colTypes, _ := rows.ColumnTypes()

	var result []map[string]any
	for rows.Next() {
		values := make([]any, len(colNames))
		valuePtrs := make([]any, len(colNames))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return adapter.QueryResult{}, fmt.Errorf("clickhouse: scan row: %w", err)
		}

		row := make(map[string]any, len(colNames))
		for i, col := range colNames {
			var ct *sql.ColumnType
			if i < len(colTypes) {
				ct = colTypes[i]
			}
			row[col] = formatClickHouseValue(values[i], ct)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("clickhouse: iterate rows: %w", err)
	}

	if result == nil {
		result = []map[string]any{}
	}

	return adapter.QueryResult{Rows: result, TotalCount: total}, nil
}

// buildSelect generates a SELECT query for ClickHouse.
func buildSelect(table, where string, whereArgs []any, opts adapter.QueryOptions) (string, []any) {
	var sb strings.Builder
	fmt.Fprintf(&sb, "SELECT * FROM %s %s", escapeIdentifier(table), where)

	args := append([]any{}, whereArgs...)

	if opts.SortBy != "" {
		dir := "ASC"
		if opts.SortDesc {
			dir = "DESC"
		}
		fmt.Fprintf(&sb, " ORDER BY %s %s", escapeIdentifier(opts.SortBy), dir)
	}

	if opts.Limit > 0 {
		fmt.Fprintf(&sb, " LIMIT %d", opts.Limit)
		if opts.Offset > 0 {
			fmt.Fprintf(&sb, " OFFSET %d", opts.Offset)
		}
	} else if opts.Offset > 0 {
		// ClickHouse allows large upper bound when only offset is given
		fmt.Fprintf(&sb, " LIMIT 18446744073709551615 OFFSET %d", opts.Offset)
	}

	return sb.String(), args
}

// buildWhere constructs the WHERE clause using standard positional placeholders ?.
func buildWhere(filters []adapter.Filter) (string, []any) {
	if len(filters) == 0 {
		return "", nil
	}

	var clauses []string
	var args []any

	for _, f := range filters {
		col := escapeIdentifier(f.Column)
		op := strings.ToLower(f.Operator)

		switch op {
		case "eq", "=":
			clauses = append(clauses, fmt.Sprintf("%s = ?", col))
			args = append(args, f.Value)
		case "neq", "!=", "<>":
			clauses = append(clauses, fmt.Sprintf("%s != ?", col))
			args = append(args, f.Value)
		case "gt", ">":
			clauses = append(clauses, fmt.Sprintf("%s > ?", col))
			args = append(args, f.Value)
		case "gte", ">=":
			clauses = append(clauses, fmt.Sprintf("%s >= ?", col))
			args = append(args, f.Value)
		case "lt", "<":
			clauses = append(clauses, fmt.Sprintf("%s < ?", col))
			args = append(args, f.Value)
		case "lte", "<=":
			clauses = append(clauses, fmt.Sprintf("%s <= ?", col))
			args = append(args, f.Value)
		case "contains", "like":
			clauses = append(clauses, fmt.Sprintf("%s LIKE ?", col))
			args = append(args, fmt.Sprintf("%%%v%%", f.Value))
		case "in":
			vals, ok := f.Value.([]any)
			if !ok || len(vals) == 0 {
				clauses = append(clauses, "1=0")
			} else {
				placeholders := strings.Repeat("?, ", len(vals)-1) + "?"
				clauses = append(clauses, fmt.Sprintf("%s IN (%s)", col, placeholders))
				args = append(args, vals...)
			}
		default:
			clauses = append(clauses, fmt.Sprintf("%s = ?", col))
			args = append(args, f.Value)
		}
	}

	return "WHERE " + strings.Join(clauses, " AND "), args
}

// escapeIdentifier escapes ClickHouse table and column names with backticks.
func escapeIdentifier(name string) string {
	parts := strings.Split(name, ".")
	escapedParts := make([]string, len(parts))
	for i, p := range parts {
		trimmed := strings.Trim(p, "`")
		escapedParts[i] = "`" + strings.ReplaceAll(trimmed, "`", "\\`") + "`"
	}
	return strings.Join(escapedParts, ".")
}
