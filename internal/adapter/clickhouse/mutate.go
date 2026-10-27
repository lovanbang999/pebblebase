package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

// mutate executes an insert, update, or delete on the given ClickHouse table.
func mutate(ctx context.Context, db *sql.DB, table string, op adapter.MutationOp) error {
	switch op.Type {
	case "insert":
		return execInsert(ctx, db, table, op.Values)
	case "update":
		return execUpdate(ctx, db, table, op.Where, op.Values)
	case "delete":
		return execDelete(ctx, db, table, op.Where)
	default:
		return fmt.Errorf("clickhouse: unknown mutation type %q", op.Type)
	}
}

func execInsert(ctx context.Context, db *sql.DB, table string, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("clickhouse: insert into %s: no values provided", table)
	}

	cols := make([]string, 0, len(values))
	placeholders := make([]string, 0, len(values))
	args := make([]any, 0, len(values))

	for col, val := range values {
		cols = append(cols, escapeIdentifier(col))
		placeholders = append(placeholders, "?")
		args = append(args, val)
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		escapeIdentifier(table),
		strings.Join(cols, ", "),
		strings.Join(placeholders, ", "),
	)

	if _, err := db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("clickhouse: insert into %s: %w", table, err)
	}
	return nil
}

func execUpdate(ctx context.Context, db *sql.DB, table string, where, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("clickhouse: update %s: no values provided", table)
	}
	if len(where) == 0 {
		return fmt.Errorf("clickhouse: update %s: WHERE clause is required to prevent full-table mutation", table)
	}

	setClauses := make([]string, 0, len(values))
	args := make([]any, 0, len(values)+len(where))

	for col, val := range values {
		setClauses = append(setClauses, fmt.Sprintf("%s = ?", escapeIdentifier(col)))
		args = append(args, val)
	}

	whereClauses := make([]string, 0, len(where))
	for col, val := range where {
		if val == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("%s IS NULL", escapeIdentifier(col)))
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("%s = ?", escapeIdentifier(col)))
			args = append(args, val)
		}
	}

	// ClickHouse lightweight mutation syntax: ALTER TABLE table UPDATE col = val WHERE condition
	query := fmt.Sprintf(
		"ALTER TABLE %s UPDATE %s WHERE %s",
		escapeIdentifier(table),
		strings.Join(setClauses, ", "),
		strings.Join(whereClauses, " AND "),
	)

	if _, err := db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("clickhouse: update %s: %w", table, err)
	}
	return nil
}

func execDelete(ctx context.Context, db *sql.DB, table string, where map[string]any) error {
	if len(where) == 0 {
		return fmt.Errorf("clickhouse: delete from %s: WHERE clause is required to prevent full-table delete", table)
	}

	whereClauses := make([]string, 0, len(where))
	args := make([]any, 0, len(where))

	for col, val := range where {
		if val == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("%s IS NULL", escapeIdentifier(col)))
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("%s = ?", escapeIdentifier(col)))
			args = append(args, val)
		}
	}

	// ClickHouse lightweight delete syntax: ALTER TABLE table DELETE WHERE condition
	query := fmt.Sprintf(
		"ALTER TABLE %s DELETE WHERE %s",
		escapeIdentifier(table),
		strings.Join(whereClauses, " AND "),
	)

	if _, err := db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("clickhouse: delete from %s: %w", table, err)
	}
	return nil
}
