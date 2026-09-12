package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

// mutate executes an insert, update, or delete on the given MySQL table.
func mutate(ctx context.Context, db *sql.DB, table string, op adapter.MutationOp) error {
	switch op.Type {
	case "insert":
		return execInsert(ctx, db, table, op.Values)
	case "update":
		return execUpdate(ctx, db, table, op.Where, op.Values)
	case "delete":
		return execDelete(ctx, db, table, op.Where)
	default:
		return fmt.Errorf("mysql: unknown mutation type %q", op.Type)
	}
}

func execInsert(ctx context.Context, db *sql.DB, table string, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("mysql: insert into `%s`: no values provided", table)
	}

	cols := make([]string, 0, len(values))
	placeholders := make([]string, 0, len(values))
	args := make([]any, 0, len(values))

	for col, val := range values {
		cols = append(cols, fmt.Sprintf("`%s`", escapeIdentifier(col)))
		placeholders = append(placeholders, "?")
		args = append(args, val)
	}

	sql := fmt.Sprintf(
		"INSERT INTO `%s` (%s) VALUES (%s)",
		escapeIdentifier(table),
		strings.Join(cols, ", "),
		strings.Join(placeholders, ", "),
	)

	if _, err := db.ExecContext(ctx, sql, args...); err != nil {
		return fmt.Errorf("mysql: insert into `%s`: %w", table, err)
	}
	return nil
}

func execUpdate(ctx context.Context, db *sql.DB, table string, where, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("mysql: update `%s`: no values provided", table)
	}
	if len(where) == 0 {
		return fmt.Errorf("mysql: update `%s`: WHERE clause is required to prevent full-table update", table)
	}

	setClauses := make([]string, 0, len(values))
	args := make([]any, 0, len(values)+len(where))

	for col, val := range values {
		setClauses = append(setClauses, fmt.Sprintf("`%s` = ?", escapeIdentifier(col)))
		args = append(args, val)
	}

	whereClauses := make([]string, 0, len(where))
	for col, val := range where {
		whereClauses = append(whereClauses, fmt.Sprintf("`%s` = ?", escapeIdentifier(col)))
		args = append(args, val)
	}

	sql := fmt.Sprintf(
		"UPDATE `%s` SET %s WHERE %s",
		escapeIdentifier(table),
		strings.Join(setClauses, ", "),
		strings.Join(whereClauses, " AND "),
	)

	if _, err := db.ExecContext(ctx, sql, args...); err != nil {
		return fmt.Errorf("mysql: update `%s`: %w", table, err)
	}
	return nil
}

func execDelete(ctx context.Context, db *sql.DB, table string, where map[string]any) error {
	if len(where) == 0 {
		return fmt.Errorf("mysql: delete from `%s`: WHERE clause is required to prevent full-table delete", table)
	}

	clauses := make([]string, 0, len(where))
	args := make([]any, 0, len(where))

	for col, val := range where {
		clauses = append(clauses, fmt.Sprintf("`%s` = ?", escapeIdentifier(col)))
		args = append(args, val)
	}

	sql := fmt.Sprintf(
		"DELETE FROM `%s` WHERE %s",
		escapeIdentifier(table),
		strings.Join(clauses, " AND "),
	)

	if _, err := db.ExecContext(ctx, sql, args...); err != nil {
		return fmt.Errorf("mysql: delete from `%s`: %w", table, err)
	}
	return nil
}
