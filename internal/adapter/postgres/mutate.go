package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"pebblebase/internal/adapter"
)

// mutate executes an insert, update, or delete on the given table.
func mutate(ctx context.Context, pool *pgxpool.Pool, table string, op adapter.MutationOp) error {
	switch op.Type {
	case "insert":
		return execInsert(ctx, pool, table, op.Values)
	case "update":
		return execUpdate(ctx, pool, table, op.Where, op.Values)
	case "delete":
		return execDelete(ctx, pool, table, op.Where)
	default:
		return fmt.Errorf("postgres: unknown mutation type %q", op.Type)
	}
}

func execInsert(ctx context.Context, pool *pgxpool.Pool, table string, values map[string]any) error {
	cols := make([]string, 0, len(values))
	placeholders := make([]string, 0, len(values))
	args := make([]any, 0, len(values))

	i := 1
	for col, val := range values {
		cols = append(cols, fmt.Sprintf("%q", col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		args = append(args, val)
		i++
	}

	sql := fmt.Sprintf(
		`INSERT INTO %q (%s) VALUES (%s)`,
		table,
		strings.Join(cols, ", "),
		strings.Join(placeholders, ", "),
	)

	if _, err := pool.Exec(ctx, sql, args...); err != nil {
		return fmt.Errorf("postgres: insert into %q: %w", table, err)
	}
	return nil
}

func execUpdate(ctx context.Context, pool *pgxpool.Pool, table string, where, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("postgres: update %q: no values provided", table)
	}
	if len(where) == 0 {
		return fmt.Errorf("postgres: update %q: WHERE clause is required to prevent full-table update", table)
	}

	setClauses := make([]string, 0, len(values))
	args := make([]any, 0, len(values)+len(where))

	i := 1
	for col, val := range values {
		setClauses = append(setClauses, fmt.Sprintf("%q = $%d", col, i))
		args = append(args, val)
		i++
	}

	whereClauses := make([]string, 0, len(where))
	for col, val := range where {
		whereClauses = append(whereClauses, fmt.Sprintf("%q = $%d", col, i))
		args = append(args, val)
		i++
	}

	sql := fmt.Sprintf(
		`UPDATE %q SET %s WHERE %s`,
		table,
		strings.Join(setClauses, ", "),
		strings.Join(whereClauses, " AND "),
	)

	if _, err := pool.Exec(ctx, sql, args...); err != nil {
		return fmt.Errorf("postgres: update %q: %w", table, err)
	}
	return nil
}

func execDelete(ctx context.Context, pool *pgxpool.Pool, table string, where map[string]any) error {
	if len(where) == 0 {
		return fmt.Errorf("postgres: delete from %q: WHERE clause is required to prevent full-table delete", table)
	}

	clauses := make([]string, 0, len(where))
	args := make([]any, 0, len(where))

	i := 1
	for col, val := range where {
		clauses = append(clauses, fmt.Sprintf("%q = $%d", col, i))
		args = append(args, val)
		i++
	}

	sql := fmt.Sprintf(`DELETE FROM %q WHERE %s`, table, strings.Join(clauses, " AND "))

	if _, err := pool.Exec(ctx, sql, args...); err != nil {
		return fmt.Errorf("postgres: delete from %q: %w", table, err)
	}
	return nil
}
