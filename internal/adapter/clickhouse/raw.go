package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

func executeRaw(ctx context.Context, db *sql.DB, query string) (adapter.RawQueryResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return adapter.RawQueryResult{}, fmt.Errorf("query cannot be empty")
	}

	upper := strings.ToUpper(cleanQuery)
	isMutation := isMutationSQL(upper)

	isQueryLike := strings.HasPrefix(upper, "SELECT") ||
		strings.HasPrefix(upper, "SHOW") ||
		strings.HasPrefix(upper, "DESCRIBE") ||
		strings.HasPrefix(upper, "DESC") ||
		strings.HasPrefix(upper, "EXPLAIN") ||
		strings.HasPrefix(upper, "WITH")

	if isQueryLike {
		rows, err := db.QueryContext(ctx, cleanQuery)
		if err == nil {
			defer rows.Close()
			colNames, err := rows.Columns()
			if err == nil && len(colNames) > 0 {
				colTypes, _ := rows.ColumnTypes()
				var result []map[string]any
				for rows.Next() {
					values := make([]any, len(colNames))
					valuePtrs := make([]any, len(colNames))
					for i := range values {
						valuePtrs[i] = &values[i]
					}

					if err := rows.Scan(valuePtrs...); err != nil {
						return adapter.RawQueryResult{}, fmt.Errorf("clickhouse: scan row: %w", err)
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
					return adapter.RawQueryResult{}, fmt.Errorf("clickhouse: iterate rows: %w", err)
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
			return adapter.RawQueryResult{}, fmt.Errorf("clickhouse: query error: %w", err)
		}
	}

	res, err := db.ExecContext(ctx, cleanQuery)
	if err != nil {
		return adapter.RawQueryResult{}, fmt.Errorf("clickhouse: exec error: %w", err)
	}

	var affected int64
	if res != nil {
		affected, _ = res.RowsAffected()
	}

	return adapter.RawQueryResult{
		Columns:         []string{},
		Rows:            []map[string]any{},
		ExecutionTimeMs: adapter.ElapsedMs(start),
		RowsAffected:    affected,
		IsMutation:      true,
	}, nil
}

func isMutationSQL(upper string) bool {
	return strings.HasPrefix(upper, "INSERT") ||
		strings.HasPrefix(upper, "ALTER") ||
		strings.HasPrefix(upper, "CREATE") ||
		strings.HasPrefix(upper, "DROP") ||
		strings.HasPrefix(upper, "TRUNCATE") ||
		strings.HasPrefix(upper, "OPTIMIZE")
}
