package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

const defaultChunkSize = 1000

// streamTableRows executes a query and streams rows in chunks.
func streamTableRows(
	ctx context.Context,
	db *sql.DB,
	table string,
	opts adapter.QueryOptions,
	onChunk func(columns []string, rows []map[string]any) error,
) error {
	where, whereArgs := buildWhere(opts.Filters, 1)
	dataSQL, dataArgs := buildSelect(table, where, whereArgs, opts)

	rows, err := db.QueryContext(ctx, dataSQL, dataArgs...)
	if err != nil {
		return fmt.Errorf("mssql: stream query %q: %w", table, err)
	}
	defer rows.Close()

	colNames, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("mssql: get stream columns: %w", err)
	}

	colTypes, _ := rows.ColumnTypes()
	chunk := make([]map[string]any, 0, defaultChunkSize)
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
			return fmt.Errorf("mssql: stream scan: %w", err)
		}

		row := make(map[string]any, len(colNames))
		for i, col := range colNames {
			var ct *sql.ColumnType
			if i < len(colTypes) {
				ct = colTypes[i]
			}
			row[col] = formatMSSQLValue(values[i], ct)
		}
		chunk = append(chunk, row)

		if len(chunk) >= defaultChunkSize {
			if err := onChunk(colNames, chunk); err != nil {
				return err
			}
			chunk = make([]map[string]any, 0, defaultChunkSize)
			hasStreamed = true
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("mssql: stream iterate: %w", err)
	}

	if len(chunk) > 0 || !hasStreamed {
		if err := onChunk(colNames, chunk); err != nil {
			return err
		}
	}

	return nil
}

// bulkInsert transactionally inserts multiple records in batches.
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

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("mssql: begin bulk tx: %w", err)
	}
	defer tx.Rollback()

	escapedCols := make([]string, len(columns))
	for i, c := range columns {
		escapedCols[i] = escapeIdentifier(c)
	}
	colsList := strings.Join(escapedCols, ", ")

	// SQL Server has a parameter limit of 2,100 per statement
	maxBatch := 500
	if len(columns) > 0 {
		paramLimit := 2000 / len(columns)
		if paramLimit < 1 {
			paramLimit = 1
		}
		if paramLimit < maxBatch {
			maxBatch = paramLimit
		}
	}

	var totalInserted int64

	for i := 0; i < len(records); i += maxBatch {
		end := i + maxBatch
		if end > len(records) {
			end = len(records)
		}
		batch := records[i:end]

		var placeholders strings.Builder
		args := make([]any, 0, len(batch)*len(columns))
		paramIdx := 1

		for rIdx, row := range batch {
			if rIdx > 0 {
				placeholders.WriteString(", ")
			}
			placeholders.WriteString("(")
			for cIdx, val := range row {
				if cIdx > 0 {
					placeholders.WriteString(", ")
				}
				placeholders.WriteString(fmt.Sprintf("@p%d", paramIdx))
				args = append(args, normalizeMutationValue(val))
				paramIdx++
			}
			placeholders.WriteString(")")
		}

		stmt := fmt.Sprintf(
			"INSERT INTO %s (%s) VALUES %s;",
			escapeIdentifier(table),
			colsList,
			placeholders.String(),
		)

		res, err := tx.ExecContext(ctx, stmt, args...)
		if err != nil {
			return 0, fmt.Errorf("mssql: bulk insert batch [%d-%d]: %w", i+1, end, err)
		}

		affected, _ := res.RowsAffected()
		totalInserted += affected
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("mssql: commit bulk tx: %w", err)
	}

	return totalInserted, nil
}
