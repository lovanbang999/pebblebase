package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"

	"pebblebase/internal/adapter"
)

// Aggregate computes column-level analytics, distributions, time-series, or stats for SQL Server.
func (a *MSSQLAdapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
	escapedTable := escapeIdentifier(table)
	escapedCol := escapeIdentifier(opts.Column)

	where, whereArgs := buildWhere(opts.Filters, 1)

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
			`SELECT TOP (%d) COALESCE(CAST(%s AS NVARCHAR(4000)), '(NULL)') AS val, COUNT(*) AS cnt FROM %s %s GROUP BY %s ORDER BY cnt DESC`,
			limit, escapedCol, escapedTable, where, escapedCol,
		)

		rows, err := a.db.QueryContext(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mssql aggregate distribution: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var label string
			var count int64
			if err := rows.Scan(&label, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mssql scan distribution: %w", err)
			}
			labels = append(labels, label)
			values = append(values, count)
		}
		if err := rows.Err(); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mssql aggregate distribution iterate: %w", err)
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
		timeExpr := fmt.Sprintf("CONVERT(VARCHAR(10), %s, 120)", escapedCol)
		switch strings.ToLower(opts.GroupBy) {
		case "week":
			timeExpr = fmt.Sprintf("FORMAT(%s, 'yyyy') + '-W' + RIGHT('0' + CAST(DATEPART(iso_week, %s) AS VARCHAR(2)), 2)", escapedCol, escapedCol)
		case "month":
			timeExpr = fmt.Sprintf("FORMAT(%s, 'yyyy-MM')", escapedCol)
		}

		timeWhere := where
		if timeWhere == "" {
			timeWhere = fmt.Sprintf("WHERE %s IS NOT NULL", escapedCol)
		} else {
			timeWhere += fmt.Sprintf(" AND %s IS NOT NULL", escapedCol)
		}

		query := fmt.Sprintf(
			`SELECT TOP (%d) %s AS bucket, COUNT(*) AS cnt FROM %s %s GROUP BY %s ORDER BY bucket ASC`,
			limit*10, timeExpr, escapedTable, timeWhere, timeExpr,
		)

		rows, err := a.db.QueryContext(ctx, query, whereArgs...)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mssql aggregate timeseries: %w", err)
		}
		defer rows.Close()

		var labels []string
		var values []any
		for rows.Next() {
			var bucket sql.NullString
			var count int64
			if err := rows.Scan(&bucket, &count); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mssql scan timeseries: %w", err)
			}
			if bucket.Valid && bucket.String != "" {
				labels = append(labels, bucket.String)
				values = append(values, count)
			}
		}
		if err := rows.Err(); err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mssql aggregate timeseries iterate: %w", err)
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
			MIN(CAST(%s AS FLOAT)),
			MAX(CAST(%s AS FLOAT)),
			AVG(CAST(%s AS FLOAT)),
			SUM(CAST(%s AS FLOAT))
		FROM %s %s`,
			escapedCol, escapedCol, escapedCol, escapedCol, escapedCol, escapedCol, escapedTable, where)

		var totalRows, nonNullCount, nullCount int64
		var minVal, maxVal, avgVal, sumVal sql.NullFloat64

		err := a.db.QueryRowContext(ctx, query, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount, &minVal, &maxVal, &avgVal, &sumVal)
		if err != nil {
			fallbackQuery := fmt.Sprintf(`SELECT COUNT(*), COUNT(%s), COALESCE(SUM(CASE WHEN %s IS NULL THEN 1 ELSE 0 END), 0) FROM %s %s`,
				escapedCol, escapedCol, escapedTable, where)
			if fErr := a.db.QueryRowContext(ctx, fallbackQuery, whereArgs...).Scan(&totalRows, &nonNullCount, &nullCount); fErr != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mssql aggregate stats: %w", fErr)
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
		return adapter.AggregateResult{}, fmt.Errorf("mssql aggregate: unsupported function %q", fn)
	}
}
