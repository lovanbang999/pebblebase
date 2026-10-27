package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

// queryTable executes a SELECT against a SQL Server table with filtering,
// sorting, and T-SQL OFFSET-FETCH pagination.
func queryTable(ctx context.Context, db *sql.DB, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	where, whereArgs := buildWhere(opts.Filters, 1)

	baseFrom := fmt.Sprintf("FROM %s %s", escapeIdentifier(table), where)

	// Count query
	countSQL := "SELECT COUNT(*) " + baseFrom
	var total int
	if err := db.QueryRowContext(ctx, countSQL, whereArgs...).Scan(&total); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mssql: count %s: %w", table, err)
	}

	// Data query
	dataSQL, dataArgs := buildSelect(table, where, whereArgs, opts)
	rows, err := db.QueryContext(ctx, dataSQL, dataArgs...)
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mssql: query %s: %w", table, err)
	}
	defer rows.Close()

	colNames, err := rows.Columns()
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mssql: get columns: %w", err)
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
			return adapter.QueryResult{}, fmt.Errorf("mssql: scan row: %w", err)
		}

		row := make(map[string]any, len(colNames))
		for i, col := range colNames {
			var ct *sql.ColumnType
			if i < len(colTypes) {
				ct = colTypes[i]
			}
			row[col] = formatMSSQLValue(values[i], ct)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mssql: iterate rows: %w", err)
	}

	if result == nil {
		result = []map[string]any{}
	}

	return adapter.QueryResult{Rows: result, TotalCount: total}, nil
}

// buildSelect generates the SELECT statement adhering to T-SQL OFFSET...FETCH syntax.
func buildSelect(table, where string, whereArgs []any, opts adapter.QueryOptions) (string, []any) {
	var sb strings.Builder
	fmt.Fprintf(&sb, "SELECT * FROM %s %s", escapeIdentifier(table), where)

	args := append([]any{}, whereArgs...)

	// In MSSQL, OFFSET / FETCH NEXT strictly requires an ORDER BY clause.
	hasPagination := opts.Limit > 0 || opts.Offset > 0
	if opts.SortBy != "" {
		dir := "ASC"
		if opts.SortDesc {
			dir = "DESC"
		}
		fmt.Fprintf(&sb, " ORDER BY %s %s", escapeIdentifier(opts.SortBy), dir)
	} else if hasPagination {
		// T-SQL standard dummy ordering for stable OFFSET pagination when no sort column specified
		sb.WriteString(" ORDER BY (SELECT NULL)")
	}

	if opts.Limit > 0 {
		fmt.Fprintf(&sb, " OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", opts.Offset, opts.Limit)
	} else if opts.Offset > 0 {
		fmt.Fprintf(&sb, " OFFSET %d ROWS", opts.Offset)
	}

	return sb.String(), args
}

// buildWhere builds the WHERE clause using @p1, @p2, ... parameter placeholders.
func buildWhere(filters []adapter.Filter, startParamIdx int) (string, []any) {
	if len(filters) == 0 {
		return "", nil
	}

	var clauses []string
	var args []any
	paramCounter := startParamIdx

	for _, f := range filters {
		col := escapeIdentifier(f.Column)
		op := strings.ToLower(f.Operator)

		switch op {
		case "eq", "=":
			clauses = append(clauses, fmt.Sprintf("%s = @p%d", col, paramCounter))
			args = append(args, f.Value)
			paramCounter++
		case "neq", "!=", "<>":
			clauses = append(clauses, fmt.Sprintf("%s <> @p%d", col, paramCounter))
			args = append(args, f.Value)
			paramCounter++
		case "gt", ">":
			clauses = append(clauses, fmt.Sprintf("%s > @p%d", col, paramCounter))
			args = append(args, f.Value)
			paramCounter++
		case "gte", ">=":
			clauses = append(clauses, fmt.Sprintf("%s >= @p%d", col, paramCounter))
			args = append(args, f.Value)
			paramCounter++
		case "lt", "<":
			clauses = append(clauses, fmt.Sprintf("%s < @p%d", col, paramCounter))
			args = append(args, f.Value)
			paramCounter++
		case "lte", "<=":
			clauses = append(clauses, fmt.Sprintf("%s <= @p%d", col, paramCounter))
			args = append(args, f.Value)
			paramCounter++
		case "contains", "like":
			clauses = append(clauses, fmt.Sprintf("%s LIKE @p%d", col, paramCounter))
			args = append(args, fmt.Sprintf("%%%v%%", f.Value))
			paramCounter++
		case "in":
			vals, ok := f.Value.([]any)
			if !ok || len(vals) == 0 {
				clauses = append(clauses, "1=0")
			} else {
				var placeholders []string
				for _, v := range vals {
					placeholders = append(placeholders, fmt.Sprintf("@p%d", paramCounter))
					args = append(args, v)
					paramCounter++
				}
				clauses = append(clauses, fmt.Sprintf("%s IN (%s)", col, strings.Join(placeholders, ", ")))
			}
		default:
			clauses = append(clauses, fmt.Sprintf("%s = @p%d", col, paramCounter))
			args = append(args, f.Value)
			paramCounter++
		}
	}

	return "WHERE " + strings.Join(clauses, " AND "), args
}

// escapeIdentifier encloses identifier or schema.table parts in square brackets [].
func escapeIdentifier(name string) string {
	parts := strings.Split(name, ".")
	escapedParts := make([]string, len(parts))
	for i, p := range parts {
		trimmed := strings.Trim(p, "[]")
		escapedParts[i] = "[" + strings.ReplaceAll(trimmed, "]", "]]") + "]"
	}
	return strings.Join(escapedParts, ".")
}
