package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"pebblebase/internal/adapter"
)

const defaultChunkSize = 1000

// streamTableRows executes a query and streams rows in chunks of up to defaultChunkSize.
func streamTableRows(
	ctx context.Context,
	pool *pgxpool.Pool,
	table string,
	opts adapter.QueryOptions,
	onChunk func(columns []string, rows []map[string]any) error,
) error {
	where, args := buildWhere(opts.Filters)
	dataSQL := buildSelect(table, where, opts)

	rows, err := pool.Query(ctx, dataSQL, args...)
	if err != nil {
		return fmt.Errorf("postgres: stream query %q: %w", table, err)
	}
	defer rows.Close()

	fieldDescs := rows.FieldDescriptions()
	colNames := make([]string, len(fieldDescs))
	for i, fd := range fieldDescs {
		colNames[i] = string(fd.Name)
	}

	chunk := make([]map[string]any, 0, defaultChunkSize)

	hasStreamed := false

	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return err
		}

		values, err := rows.Values()
		if err != nil {
			return fmt.Errorf("postgres: stream scan: %w", err)
		}

		row := make(map[string]any, len(colNames))
		for i, col := range colNames {
			row[col] = values[i]
		}
		chunk = append(chunk, row)

		if len(chunk) >= defaultChunkSize {
			if err := onChunk(colNames, chunk); err != nil {
				return err
			}
			hasStreamed = true
			chunk = make([]map[string]any, 0, defaultChunkSize)
		}
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("postgres: stream iterate: %w", err)
	}

	// Flush remaining rows if any, or flush empty chunk if 0 rows returned
	if len(chunk) > 0 || !hasStreamed {
		if err := onChunk(colNames, chunk); err != nil {
			return err
		}
	}

	return nil
}

// bulkInsert inserts rows within an atomic PostgreSQL database transaction.
func bulkInsert(
	ctx context.Context,
	pool *pgxpool.Pool,
	table string,
	columns []string,
	records [][]any,
) (int64, error) {
	if len(records) == 0 || len(columns) == 0 {
		return 0, nil
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("postgres: begin bulk tx: %w", err)
	}
	defer tx.Rollback(ctx)

	escapedCols := make([]string, len(columns))
	for i, c := range columns {
		escapedCols[i] = fmt.Sprintf("%q", c)
	}
	colsList := strings.Join(escapedCols, ", ")

	maxBatch := 500
	if len(columns) > 0 {
		paramLimit := 65000 / len(columns)
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
		paramCounter := 1

		for rIdx, row := range batch {
			if rIdx > 0 {
				placeholders.WriteString(", ")
			}
			placeholders.WriteString("(")
			for cIdx, val := range row {
				if cIdx > 0 {
					placeholders.WriteString(", ")
				}
				fmt.Fprintf(&placeholders, "$%d", paramCounter)
				paramCounter++
				args = append(args, val)
			}
			placeholders.WriteString(")")
		}

		stmt := fmt.Sprintf(`INSERT INTO %q (%s) VALUES %s;`, table, colsList, placeholders.String())

		tag, err := tx.Exec(ctx, stmt, args...)
		if err != nil {
			return 0, fmt.Errorf("postgres: bulk insert batch rows [%d-%d]: %w", i+1, end, err)
		}

		totalInserted += tag.RowsAffected()
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("postgres: commit bulk tx: %w", err)
	}

	return totalInserted, nil
}
