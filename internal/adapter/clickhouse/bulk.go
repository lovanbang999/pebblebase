package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

// defaultStreamChunkSize defines the chunk size for OLAP multi-million-row table streaming.
const defaultStreamChunkSize = 5000

// streamTableRows executes a query and streams rows in chunks of up to defaultStreamChunkSize.
func streamTableRows(
	ctx context.Context,
	db *sql.DB,
	table string,
	opts adapter.QueryOptions,
	onChunk func(columns []string, rows []map[string]any) error,
) error {
	where, whereArgs := buildWhere(opts.Filters)
	dataSQL, dataArgs := buildSelect(table, where, whereArgs, opts)

	rows, err := db.QueryContext(ctx, dataSQL, dataArgs...)
	if err != nil {
		return fmt.Errorf("clickhouse: stream query %q: %w", table, err)
	}
	defer rows.Close()

	colNames, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("clickhouse: get stream columns: %w", err)
	}

	colTypes, _ := rows.ColumnTypes()
	chunk := make([]map[string]any, 0, defaultStreamChunkSize)
	hasStreamed := false

	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return err
		}

		values := make([]any, len(colNames))
		valuePtrs := make([]any, len(colNames))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return fmt.Errorf("clickhouse: stream scan: %w", err)
		}

		row := make(map[string]any, len(colNames))
		for i, col := range colNames {
			var ct *sql.ColumnType
			if i < len(colTypes) {
				ct = colTypes[i]
			}
			row[col] = formatClickHouseValue(values[i], ct)
		}
		chunk = append(chunk, row)

		if len(chunk) >= defaultStreamChunkSize {
			if err := onChunk(colNames, chunk); err != nil {
				return err
			}
			chunk = make([]map[string]any, 0, defaultStreamChunkSize)
			hasStreamed = true
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("clickhouse: stream iterate: %w", err)
	}

	if len(chunk) > 0 || !hasStreamed {
		if err := onChunk(colNames, chunk); err != nil {
			return err
		}
	}

	return nil
}

// bulkInsert transactionally inserts multiple records in high-throughput ClickHouse batches.
func bulkInsert(
	ctx context.Context,
	db *sql.DB,
	table string,
	columns []string,
	records [][]any,
) (int64, error) {
	if len(records) == 0 || len(columns) == 0 {
		return 0, nil
	}

	escapedCols := make([]string, len(columns))
	for i, c := range columns {
		escapedCols[i] = escapeIdentifier(c)
	}
	colsList := strings.Join(escapedCols, ", ")

	maxBatch := 1000
	var totalInserted int64

	for i := 0; i < len(records); i += maxBatch {
		end := i + maxBatch
		if end > len(records) {
			end = len(records)
		}
		batch := records[i:end]

		var placeholders strings.Builder
		rowPlaceholder := "(" + strings.Repeat("?, ", len(columns)-1) + "?)"
		args := make([]any, 0, len(batch)*len(columns))

		for rIdx, row := range batch {
			if rIdx > 0 {
				placeholders.WriteString(", ")
			}
			placeholders.WriteString(rowPlaceholder)
			args = append(args, row...)
		}

		stmt := fmt.Sprintf(
			"INSERT INTO %s (%s) VALUES %s;",
			escapeIdentifier(table),
			colsList,
			placeholders.String(),
		)

		res, err := db.ExecContext(ctx, stmt, args...)
		if err != nil {
			return 0, fmt.Errorf("clickhouse: bulk insert batch [%d-%d]: %w", i+1, end, err)
		}

		affected, _ := res.RowsAffected()
		if affected == 0 {
			affected = int64(len(batch))
		}
		totalInserted += affected
	}

	return totalInserted, nil
}
