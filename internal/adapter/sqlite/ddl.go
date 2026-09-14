package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

var _ adapter.DDLProvider = (*SQLiteAdapter)(nil)

// GetTableDDL queries sqlite_master to retrieve the full CREATE TABLE statement and any indexes.
func (a *SQLiteAdapter) GetTableDDL(ctx context.Context, table string) (string, error) {
	var tableSQL sql.NullString
	err := a.db.QueryRowContext(ctx,
		`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&tableSQL)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("sqlite: table %q not found", table)
		}
		return "", fmt.Errorf("sqlite: get table ddl: %w", err)
	}
	if !tableSQL.Valid || strings.TrimSpace(tableSQL.String) == "" {
		return "", fmt.Errorf("sqlite: table %q has no creation sql", table)
	}

	ddl := strings.TrimSpace(tableSQL.String)
	if !strings.HasSuffix(ddl, ";") {
		ddl += ";"
	}

	// Fetch any explicit secondary indexes on this table
	rows, err := a.db.QueryContext(ctx,
		`SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name`, table)
	if err == nil {
		defer rows.Close()
		var indexStatements []string
		for rows.Next() {
			var idxSQL string
			if err := rows.Scan(&idxSQL); err == nil && strings.TrimSpace(idxSQL) != "" {
				stmt := strings.TrimSpace(idxSQL)
				if !strings.HasSuffix(stmt, ";") {
					stmt += ";"
				}
				indexStatements = append(indexStatements, stmt)
			}
		}
		if len(indexStatements) > 0 {
			ddl += "\n\n-- Indexes\n" + strings.Join(indexStatements, "\n")
		}
	}

	return ddl, nil
}

// GetTableIndexes returns all primary and secondary index definitions for the given table.
func (a *SQLiteAdapter) GetTableIndexes(ctx context.Context, table string) ([]adapter.IndexInfo, error) {
	q := fmt.Sprintf(`PRAGMA index_list("%s")`, escapeIdentifier(table))
	rows, err := a.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("sqlite: index_list: %w", err)
	}
	defer rows.Close()

	type rawIdx struct {
		seq     int
		name    string
		unique  int
		origin  string
		partial int
	}

	var rawList []rawIdx
	for rows.Next() {
		var item rawIdx
		if err := rows.Scan(&item.seq, &item.name, &item.unique, &item.origin, &item.partial); err != nil {
			return nil, fmt.Errorf("sqlite: scan index_list: %w", err)
		}
		rawList = append(rawList, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var result []adapter.IndexInfo
	for _, idx := range rawList {
		infoQ := fmt.Sprintf(`PRAGMA index_info("%s")`, escapeIdentifier(idx.name))
		infoRows, err := a.db.QueryContext(ctx, infoQ)
		if err != nil {
			continue
		}

		var cols []string
		for infoRows.Next() {
			var (
				seqno int
				cid   int
				name  string
			)
			if err := infoRows.Scan(&seqno, &cid, &name); err == nil {
				cols = append(cols, name)
			}
		}
		infoRows.Close()

		result = append(result, adapter.IndexInfo{
			Name:    idx.name,
			Columns: cols,
			Unique:  idx.unique == 1,
			Primary: idx.origin == "pk",
		})
	}

	return result, nil
}
