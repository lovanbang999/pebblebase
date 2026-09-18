package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"

	"pebblebase/internal/adapter"
)

// Aggregate computes column-level analytics, distributions, time-series, or stats for MySQL.
func (a *MySQLAdapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
	escapedTable := fmt.Sprintf("`%s`", escapeIdentifier(table))
	escapedCol := fmt.Sprintf("`%s`", escapeIdentifier(opts.Column))

	where, whereArgs := buildWhere(opts.Filters)

	limit := opts.Limit
	if limit <= 0 {
		limit = 10
	}

	fn := strings.ToLower(opts.Function)
	if fn == "" {
		fn = "distribution"
	}

	switch fn {
	case "distribution":
		query := fmt.Sprintf(`SELECT COALESCE(CAST(%s AS CHAR), '(NULL)') AS val, COUNT(*) AS cnt FROM %s %s GROUP BY %s ORDER BY cnt DESC LIMIT %d`,
			escapedCol, escapedTable, where, escapedCol, limit)

		rows, err := a.db.QueryContext(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mysql aggregate distribution: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var label string
			var count int64
			if err := rows.Scan(&label, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mysql scan distribution: %w", err)
			}
			labels = append(labels, label)
			values = append(values, count)
		}
		if err := rows.Err(); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mysql aggregate distribution iterate: %w", err)
		}
		if labels == nil {
			labels = []string{}
			values = []any{}
		}

		return adapter.AggregateResult{
			Labels: labels,
			Values: values,
		}, nil

	case "timeseries":
		formatStr := "%Y-%m-%d"
		switch strings.ToLower(opts.GroupBy) {
		case "week":
			formatStr = "%Y-W%u"
		case "month":
			formatStr = "%Y-%m"
		}

		timeWhere := where
		if timeWhere == "" {
			timeWhere = fmt.Sprintf("WHERE %s IS NOT NULL", escapedCol)
		} else {
			timeWhere += fmt.Sprintf(" AND %s IS NOT NULL", escapedCol)
		}

		query := fmt.Sprintf(`SELECT DATE_FORMAT(%s, '%s') AS bucket, COUNT(*) AS cnt FROM %s %s GROUP BY bucket ORDER BY bucket ASC LIMIT %d`,
			escapedCol, formatStr, escapedTable, timeWhere, limit*10)

		rows, err := a.db.QueryContext(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mysql aggregate timeseries: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var bucket sql.NullString
			var count int64
			if err := rows.Scan(&bucket, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mysql scan timeseries: %w", err)
			}
			if bucket.Valid && bucket.String != "" {
				labels = append(labels, bucket.String)
				values = append(values, count)
			}
		}
		if err := rows.Err(); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mysql aggregate timeseries iterate: %w", err)
		}
		if labels == nil {
			labels = []string{}
			values = []any{}
		}

		return adapter.AggregateResult{
			Labels: labels,
			Values: values,
		}, nil

	case "stats", "summary":
		query := fmt.Sprintf(`SELECT 
			COUNT(*),
			COUNT(%s),
			COALESCE(SUM(CASE WHEN %s IS NULL THEN 1 ELSE 0 END), 0),
			MIN(%s),
			MAX(%s),
			AVG(%s),
			SUM(%s)
		FROM %s %s`,
			escapedCol, escapedCol, escapedCol, escapedCol, escapedCol, escapedCol, escapedTable, where)

		var totalRows, nonNullCount, nullCount int64
		var minVal, maxVal, avgVal, sumVal sql.NullFloat64

		err := a.db.QueryRowContext(ctx, query, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount, &minVal, &maxVal, &avgVal, &sumVal)
		if err != nil {
			fallbackQuery := fmt.Sprintf(`SELECT COUNT(*), COUNT(%s), COALESCE(SUM(CASE WHEN %s IS NULL THEN 1 ELSE 0 END), 0) FROM %s %s`,
				escapedCol, escapedCol, escapedTable, where)
			if fErr := a.db.QueryRowContext(ctx, fallbackQuery, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount); fErr != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mysql aggregate stats: %w", fErr)
			}
			return adapter.AggregateResult{
				Labels: []string{"Non-Null", "Null"},
				Values: []any{nonNullCount, nullCount},
				Stats: map[string]any{
					"total_rows":     totalRows,
					"non_null_count": nonNullCount,
					"null_count":     nullCount,
				},
			}, nil
		}

		stats := map[string]any{
			"total_rows":     totalRows,
			"non_null_count": nonNullCount,
			"null_count":     nullCount,
		}
		if minVal.Valid {
			stats["min"] = round2(minVal.Float64)
		}
		if maxVal.Valid {
			stats["max"] = round2(maxVal.Float64)
		}
		if avgVal.Valid {
			stats["avg"] = round2(avgVal.Float64)
		}
		if sumVal.Valid {
			stats["sum"] = round2(sumVal.Float64)
		}

		return adapter.AggregateResult{
			Labels: []string{"Non-Null", "Null"},
			Values: []any{nonNullCount, nullCount},
			Stats:  stats,
		}, nil

	default:
		aggFunc := strings.ToUpper(fn)
		if aggFunc != "COUNT" && aggFunc != "SUM" && aggFunc != "AVG" && aggFunc != "MIN" && aggFunc != "MAX" {
			return adapter.AggregateResult{}, fmt.Errorf("unsupported aggregate function: %s", fn)
		}

		query := fmt.Sprintf(`SELECT %s(%s) FROM %s %s`, aggFunc, escapedCol, escapedTable, where)
		var val sql.NullFloat64
		if err := a.db.QueryRowContext(ctx, query, whereArgs...).Scan(&val); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mysql aggregate %s: %w", fn, err)
		}

		var resVal any
		if val.Valid {
			resVal = round2(val.Float64)
		}
		return adapter.AggregateResult{
			Labels: []string{fn},
			Values: []any{resVal},
			Stats:  map[string]any{fn: resVal},
		}, nil
	}
}

// GetTableStats returns row count and estimated disk size for a MySQL table.
func (a *MySQLAdapter) GetTableStats(ctx context.Context, table string) (adapter.TableStats, error) {
	var totalRows, sizeBytes int64
	query := `SELECT COALESCE(TABLE_ROWS, 0), COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`
	if err := a.db.QueryRowContext(ctx, query, table).Scan(&totalRows, &sizeBytes); err != nil || totalRows == 0 {
		// Fallback to exact count if information_schema has 0 or fails
		_ = a.db.QueryRowContext(ctx, fmt.Sprintf("SELECT COUNT(*) FROM `%s`", escapeIdentifier(table))).Scan(&totalRows)
	}

	return adapter.TableStats{
		TotalRows:     totalRows,
		SizeBytes:     sizeBytes,
		EstimatedRows: true,
	}, nil
}

func round2(f float64) float64 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	return math.Round(f*100) / 100
}
