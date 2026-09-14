package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"pebblebase/internal/adapter"
)

func executeRaw(ctx context.Context, pool *pgxpool.Pool, query string) (adapter.RawQueryResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return adapter.RawQueryResult{}, fmt.Errorf("query cannot be empty")
	}

	upper := strings.ToUpper(cleanQuery)
	isMutation := isMutationSQL(upper)

	isQueryLike := strings.HasPrefix(upper, "SELECT") ||
		strings.HasPrefix(upper, "SHOW") ||
		strings.HasPrefix(upper, "EXPLAIN") ||
		strings.HasPrefix(upper, "WITH") ||
		strings.Contains(upper, "RETURNING")

	if isQueryLike {
		rows, err := pool.Query(ctx, cleanQuery)
		if err == nil {
			defer rows.Close()
			fds := rows.FieldDescriptions()
			colNames := make([]string, len(fds))
			for i, fd := range fds {
				colNames[i] = string(fd.Name)
			}

			if len(colNames) > 0 {
				var result []map[string]any
				for rows.Next() {
					values, err := rows.Values()
					if err != nil {
						return adapter.RawQueryResult{}, fmt.Errorf("postgres: scan row: %w", err)
					}
					row := make(map[string]any, len(colNames))
					for i, col := range colNames {
						row[col] = values[i]
					}
					result = append(result, row)
				}
				if err := rows.Err(); err != nil {
					return adapter.RawQueryResult{}, fmt.Errorf("postgres: iterate rows: %w", err)
				}
				if result == nil {
					result = []map[string]any{}
				}
				return adapter.RawQueryResult{
					Columns:         colNames,
					Rows:            result,
					ExecutionTimeMs: adapter.ElapsedMs(start),
					RowsAffected:    int64(len(result)),
					IsMutation:      isMutation,
				}, nil
			}
		} else if !isMutation {
			return adapter.RawQueryResult{}, fmt.Errorf("postgres: query error: %w", err)
		}
	}

	commandTag, err := pool.Exec(ctx, cleanQuery)
	if err != nil {
		return adapter.RawQueryResult{}, fmt.Errorf("postgres: exec error: %w", err)
	}

	return adapter.RawQueryResult{
		Columns:         []string{},
		Rows:            []map[string]any{},
		ExecutionTimeMs: adapter.ElapsedMs(start),
		RowsAffected:    commandTag.RowsAffected(),
		IsMutation:      true,
	}, nil
}

func isMutationSQL(upper string) bool {
	for _, kw := range []string{"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "REPLACE", "RENAME", "GRANT", "REVOKE"} {
		if strings.HasPrefix(upper, kw) {
			return true
		}
	}
	return false
}
