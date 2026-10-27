package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

// mutate executes an insert, update, or delete on the given SQL Server table.
func mutate(ctx context.Context, db *sql.DB, table string, op adapter.MutationOp) error {
	switch op.Type {
	case "insert":
		return execInsert(ctx, db, table, op.Values)
	case "update":
		return execUpdate(ctx, db, table, op.Where, op.Values)
	case "delete":
		return execDelete(ctx, db, table, op.Where)
	default:
		return fmt.Errorf("mssql: unknown mutation type %q", op.Type)
	}
}

func execInsert(ctx context.Context, db *sql.DB, table string, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("mssql: insert into %s: no values provided", table)
	}

	cols := make([]string, 0, len(values))
	placeholders := make([]string, 0, len(values))
	args := make([]any, 0, len(values))
	paramIdx := 1

	for col, val := range values {
		cols = append(cols, escapeIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("@p%d", paramIdx))
		args = append(args, normalizeMutationValue(val))
		paramIdx++
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		escapeIdentifier(table),
		strings.Join(cols, ", "),
		strings.Join(placeholders, ", "),
	)

	if _, err := db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("mssql: insert into %s: %w", table, err)
	}
	return nil
}

func execUpdate(ctx context.Context, db *sql.DB, table string, where, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("mssql: update %s: no values provided", table)
	}
	if len(where) == 0 {
		return fmt.Errorf("mssql: update %s: WHERE clause is required to prevent full-table update", table)
	}

	setClauses := make([]string, 0, len(values))
	args := make([]any, 0, len(values)+len(where))
	paramIdx := 1

	for col, val := range values {
		setClauses = append(setClauses, fmt.Sprintf("%s = @p%d", escapeIdentifier(col), paramIdx))
		args = append(args, normalizeMutationValue(val))
		paramIdx++
	}

	whereClauses := make([]string, 0, len(where))
	for col, val := range where {
		if val == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("%s IS NULL", escapeIdentifier(col)))
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("%s = @p%d", escapeIdentifier(col), paramIdx))
			args = append(args, normalizeMutationValue(val))
			paramIdx++
		}
	}

	query := fmt.Sprintf(
		"UPDATE %s SET %s WHERE %s",
		escapeIdentifier(table),
		strings.Join(setClauses, ", "),
		strings.Join(whereClauses, " AND "),
	)

	if _, err := db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("mssql: update %s: %w", table, err)
	}
	return nil
}

func execDelete(ctx context.Context, db *sql.DB, table string, where map[string]any) error {
	if len(where) == 0 {
		return fmt.Errorf("mssql: delete from %s: WHERE clause is required to prevent full-table delete", table)
	}

	whereClauses := make([]string, 0, len(where))
	args := make([]any, 0, len(where))
	paramIdx := 1

	for col, val := range where {
		if val == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("%s IS NULL", escapeIdentifier(col)))
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("%s = @p%d", escapeIdentifier(col), paramIdx))
			args = append(args, normalizeMutationValue(val))
			paramIdx++
		}
	}

	query := fmt.Sprintf(
		"DELETE FROM %s WHERE %s",
		escapeIdentifier(table),
		strings.Join(whereClauses, " AND "),
	)

	if _, err := db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("mssql: delete from %s: %w", table, err)
	}
	return nil
}

func normalizeMutationValue(val any) any {
	return val
}
