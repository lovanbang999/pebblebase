package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"

	"pebblebase/internal/adapter"
)

// Aggregate computes column analytics, distributions, time-series, or stats using ClickHouse vectorized aggregates.
func (a *ClickHouseAdapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
	escapedTable := escapeIdentifier(table)
	escapedCol := escapeIdentifier(opts.Column)

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
		query := fmt.Sprintf(
			`SELECT toString(COALESCE(CAST(%s AS String), '(NULL)')) AS val, count(*) AS cnt FROM %s %s GROUP BY val ORDER BY cnt DESC LIMIT %d`,
			escapedCol, escapedTable, where, limit,
		)

		rows, err := a.db.QueryContext(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("clickhouse aggregate distribution: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var label string
			var count int64
			if err := rows.Scan(&label, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("clickhouse scan distribution: %w", err)
			}
			labels = append(labels, label)
			values = append(values, count)
		}
		if err := rows.Err(); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("clickhouse aggregate distribution iterate: %w", err)
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
		timeFormat := "%Y-%m-%d"
		switch strings.ToLower(opts.GroupBy) {
		case "week":
			timeFormat = "%Y-W%V"
		case "month":
			timeFormat = "%Y-%m"
		}

		timeWhere := where
		if timeWhere == "" {
			timeWhere = fmt.Sprintf("WHERE isNotNull(%s)", escapedCol)
		} else {
			timeWhere += fmt.Sprintf(" AND isNotNull(%s)", escapedCol)
		}

		query := fmt.Sprintf(
			`SELECT formatDateTime(toDateTime(%s), '%s') AS bucket, count(*) AS cnt FROM %s %s GROUP BY bucket ORDER BY bucket ASC LIMIT %d`,
			escapedCol, timeFormat, escapedTable, timeWhere, limit*10,
		)

		rows, err := a.db.QueryContext(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("clickhouse aggregate timeseries: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var bucket sql.NullString
			var count int64
			if err := rows.Scan(&bucket, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("clickhouse scan timeseries: %w", err)
			}
			if bucket.Valid && bucket.String != "" {
				labels = append(labels, bucket.String)
				values = append(values, count)
			}
		}
		if err := rows.Err(); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("clickhouse aggregate timeseries iterate: %w", err)
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
			count(*),
			countIf(isNotNull(%s)),
			countIf(isNull(%s)),
			min(toFloat64OrNull(toString(%s))),
			max(toFloat64OrNull(toString(%s))),
			avg(toFloat64OrNull(toString(%s))),
			sum(toFloat64OrNull(toString(%s)))
		FROM %s %s`,
			escapedCol, escapedCol, escapedCol, escapedCol, escapedCol, escapedCol, escapedTable, where)

		var totalRows, nonNullCount, nullCount int64
		var minVal, maxVal, avgVal, sumVal sql.NullFloat64

		err := a.db.QueryRowContext(ctx, query, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount, &minVal, &maxVal, &avgVal, &sumVal)
		if err != nil {
			fallbackQuery := fmt.Sprintf(`SELECT count(*), countIf(isNotNull(%s)), countIf(isNull(%s)) FROM %s %s`,
				escapedCol, escapedCol, escapedTable, where)
			if fErr := a.db.QueryRowContext(ctx, fallbackQuery, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount); fErr != nil {
				return adapter.AggregateResult{}, fmt.Errorf("clickhouse aggregate stats: %w", fErr)
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
			stats["min"] = minVal.Float64
		}
		if maxVal.Valid {
			stats["max"] = maxVal.Float64
		}
		if avgVal.Valid {
			stats["avg"] = math.Round(avgVal.Float64*100) / 100
		}
		if sumVal.Valid {
			stats["sum"] = math.Round(sumVal.Float64*100) / 100
		}

		labels := []string{"Non-Null", "Null"}
		vals := []any{nonNullCount, nullCount}

		return adapter.AggregateResult{
			Labels: labels,
			Values: vals,
			Stats:  stats,
		}, nil

	default:
		return adapter.AggregateResult{}, fmt.Errorf("clickhouse aggregate: unsupported function %q", fn)
	}
}
