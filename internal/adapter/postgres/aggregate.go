package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"

	"pebblebase/internal/adapter"
)

// Aggregate calculates column distributions, time-series, or stats for PostgreSQL.
func (a *PostgresAdapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
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
		query := fmt.Sprintf(`SELECT COALESCE(CAST(%q AS TEXT), '(NULL)') AS val, COUNT(*) AS cnt FROM %q %s GROUP BY %q ORDER BY cnt DESC LIMIT %d`,
			opts.Column, table, where, opts.Column, limit)

		rows, err := a.pool.Query(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("postgres aggregate distribution: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var label string
			var count int64
			if err := rows.Scan(&label, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("postgres scan distribution: %w", err)
			}
			labels = append(labels, label)
			values = append(values, count)
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
		truncBucket := "day"
		charFmt := "YYYY-MM-DD"
		switch strings.ToLower(opts.GroupBy) {
		case "week":
			truncBucket = "week"
			charFmt = "IYYY-IW"
		case "month":
			truncBucket = "month"
			charFmt = "YYYY-MM"
		}

		timeWhere := where
		if timeWhere == "" {
			timeWhere = fmt.Sprintf("WHERE %q IS NOT NULL", opts.Column)
		} else {
			timeWhere += fmt.Sprintf(" AND %q IS NOT NULL", opts.Column)
		}

		query := fmt.Sprintf(`SELECT to_char(date_trunc('%s', %q), '%s') AS bucket, COUNT(*) AS cnt FROM %q %s GROUP BY bucket ORDER BY bucket ASC LIMIT %d`,
			truncBucket, opts.Column, charFmt, table, timeWhere, limit*10)

		rows, err := a.pool.Query(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("postgres aggregate timeseries: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var bucket sql.NullString
			var count int64
			if err := rows.Scan(&bucket, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("postgres scan timeseries: %w", err)
			}
			if bucket.Valid && bucket.String != "" {
				labels = append(labels, bucket.String)
				values = append(values, count)
			}
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
			COUNT(%q),
			COALESCE(SUM(CASE WHEN %q IS NULL THEN 1 ELSE 0 END), 0),
			MIN(CAST(%q AS numeric))::float8,
			MAX(CAST(%q AS numeric))::float8,
			AVG(CAST(%q AS numeric))::float8,
			SUM(CAST(%q AS numeric))::float8
		FROM %q %s`,
			opts.Column, opts.Column, opts.Column, opts.Column, opts.Column, opts.Column, table, where)

		var totalRows, nonNullCount, nullCount int64
		var minVal, maxVal, avgVal, sumVal sql.NullFloat64

		err := a.pool.QueryRow(ctx, query, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount, &minVal, &maxVal, &avgVal, &sumVal)
		if err != nil {
			// If cast to numeric failed (e.g. non-numeric column), fallback to basic nullability count
			fallbackQuery := fmt.Sprintf(`SELECT COUNT(*), COUNT(%q), COALESCE(SUM(CASE WHEN %q IS NULL THEN 1 ELSE 0 END), 0) FROM %q %s`,
				opts.Column, opts.Column, table, where)
			if fErr := a.pool.QueryRow(ctx, fallbackQuery, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount); fErr != nil {
				return adapter.AggregateResult{}, fmt.Errorf("postgres aggregate stats: %w", fErr)
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

		query := fmt.Sprintf(`SELECT %s(%q)::float8 FROM %q %s`, aggFunc, opts.Column, table, where)
		var val sql.NullFloat64
		if err := a.pool.QueryRow(ctx, query, whereArgs...).Scan(&val); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("postgres aggregate %s: %w", fn, err)
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

// GetTableStats returns row count and estimated disk size for a PostgreSQL table.
func (a *PostgresAdapter) GetTableStats(ctx context.Context, table string) (adapter.TableStats, error) {
	var count int64
	if err := a.pool.QueryRow(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM %q`, table)).Scan(&count); err != nil {
		return adapter.TableStats{}, fmt.Errorf("postgres count table rows: %w", err)
	}

	var sizeBytes int64
	_ = a.pool.QueryRow(ctx, fmt.Sprintf(`SELECT pg_total_relation_size('%s'::regclass)`, strings.ReplaceAll(table, "'", "''"))).Scan(&sizeBytes)

	return adapter.TableStats{
		TotalRows: count,
		SizeBytes: sizeBytes,
	}, nil
}

func round2(f float64) float64 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	return math.Round(f*100) / 100
}
