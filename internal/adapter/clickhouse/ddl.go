package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

var _ adapter.DDLProvider = (*ClickHouseAdapter)(nil)
var _ adapter.TableStatsProvider = (*ClickHouseAdapter)(nil)
var _ adapter.MigrationRunner = (*ClickHouseAdapter)(nil)

// GetTableDDL executes SHOW CREATE TABLE to retrieve the ClickHouse table definition.
func (a *ClickHouseAdapter) GetTableDDL(ctx context.Context, table string) (string, error) {
	q := fmt.Sprintf("SHOW CREATE TABLE %s", escapeIdentifier(table))
	var statement string
	if err := a.db.QueryRowContext(ctx, q).Scan(&statement); err != nil {
		return "", fmt.Errorf("clickhouse: show create table %q: %w", table, err)
	}

	ddl := strings.TrimSpace(statement)
	if !strings.HasSuffix(ddl, ";") {
		ddl += ";"
	}
	return ddl, nil
}

// GetTableIndexes inspects the primary key, sorting key, and skipping indices of a ClickHouse table.
func (a *ClickHouseAdapter) GetTableIndexes(ctx context.Context, table string) ([]adapter.IndexInfo, error) {
	const q = `
		SELECT 
			primary_key,
			sorting_key
		FROM system.tables
		WHERE database = currentDatabase()
		  AND name = ?`

	var pk, sk sql.NullString
	if err := a.db.QueryRowContext(ctx, q, table).Scan(&pk, &sk); err != nil {
		return nil, fmt.Errorf("clickhouse: get table indexes for %q: %w", table, err)
	}

	var result []adapter.IndexInfo

	if pk.Valid && pk.String != "" {
		cols := strings.Split(pk.String, ",")
		for i, c := range cols {
			cols[i] = strings.TrimSpace(c)
		}
		result = append(result, adapter.IndexInfo{
			Name:    "PRIMARY",
			Unique:  false, // ClickHouse primary key doesn't enforce strict uniqueness unless ReplacingMergeTree
			Primary: true,
			Columns: cols,
		})
	}

	if sk.Valid && sk.String != "" && sk.String != pk.String {
		cols := strings.Split(sk.String, ",")
		for i, c := range cols {
			cols[i] = strings.TrimSpace(c)
		}
		result = append(result, adapter.IndexInfo{
			Name:    "ORDER_BY",
			Unique:  false,
			Primary: false,
			Columns: cols,
		})
	}

	return result, nil
}

// GetTableStats returns total row count and storage size in bytes from system.tables.
func (a *ClickHouseAdapter) GetTableStats(ctx context.Context, table string) (adapter.TableStats, error) {
	const q = `
		SELECT 
			total_rows,
			total_bytes
		FROM system.tables
		WHERE database = currentDatabase()
		  AND name = ?`

	var totalRows, totalBytes sql.NullInt64
	if err := a.db.QueryRowContext(ctx, q, table).Scan(&totalRows, &totalBytes); err != nil {
		return adapter.TableStats{}, fmt.Errorf("clickhouse: get table stats for %q: %w", table, err)
	}

	return adapter.TableStats{
		TotalRows:     totalRows.Int64,
		SizeBytes:     totalBytes.Int64,
		EstimatedRows: false,
		LastUpdated:   time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ExecuteMigration executes DDL migration statements against ClickHouse.
func (a *ClickHouseAdapter) ExecuteMigration(ctx context.Context, ddl string, dryRun bool) (adapter.MigrationResult, error) {
	cleanDDL := strings.TrimSpace(ddl)
	if cleanDDL == "" {
		return adapter.MigrationResult{Success: false, Error: "empty DDL"}, fmt.Errorf("empty DDL")
	}

	plan := []string{cleanDDL}
	if dryRun {
		return adapter.MigrationResult{
			Success:      true,
			AffectedRows: 0,
			Plan:         plan,
			ExecutedAt:   time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	res, err := a.db.ExecContext(ctx, cleanDDL)
	if err != nil {
		return adapter.MigrationResult{Success: false, Error: err.Error()}, err
	}

	var affected int64
	if res != nil {
		affected, _ = res.RowsAffected()
	}

	return adapter.MigrationResult{
		Success:      true,
		AffectedRows: affected,
		Plan:         plan,
		ExecutedAt:   time.Now().UTC().Format(time.RFC3339),
	}, nil
}
