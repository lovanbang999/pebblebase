package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

var _ adapter.DDLProvider = (*MySQLAdapter)(nil)

// GetTableDDL executes SHOW CREATE TABLE to retrieve the full table creation SQL.
func (a *MySQLAdapter) GetTableDDL(ctx context.Context, table string) (string, error) {
	q := fmt.Sprintf("SHOW CREATE TABLE `%s`", escapeIdentifier(table))
	var tblName, createSQL string
	err := a.db.QueryRowContext(ctx, q).Scan(&tblName, &createSQL)
	if err != nil {
		return "", fmt.Errorf("mysql: show create table %q: %w", table, err)
	}

	ddl := strings.TrimSpace(createSQL)
	if !strings.HasSuffix(ddl, ";") {
		ddl += ";"
	}
	return ddl, nil
}

// GetTableIndexes queries information_schema.statistics for table index metadata.
func (a *MySQLAdapter) GetTableIndexes(ctx context.Context, table string) ([]adapter.IndexInfo, error) {
	const q = `
		SELECT
			index_name,
			non_unique,
			column_name,
			seq_in_index
		FROM information_schema.statistics
		WHERE table_schema = DATABASE()
		  AND table_name   = ?
		ORDER BY index_name, seq_in_index`

	rows, err := a.db.QueryContext(ctx, q, table)
	if err != nil {
		return nil, fmt.Errorf("mysql: get table indexes for %q: %w", table, err)
	}
	defer rows.Close()

	type group struct {
		unique  bool
		primary bool
		columns []string
	}

	groups := make(map[string]*group)
	var order []string

	for rows.Next() {
		var (
			idxName   string
			nonUnique int
			colName   sql.NullString
			seq       int
		)
		if err := rows.Scan(&idxName, &nonUnique, &colName, &seq); err != nil {
			return nil, fmt.Errorf("mysql: scan statistics for %q: %w", table, err)
		}

		g, exists := groups[idxName]
		if !exists {
			g = &group{
				unique:  nonUnique == 0,
				primary: idxName == "PRIMARY",
			}
			groups[idxName] = g
			order = append(order, idxName)
		}
		if colName.Valid {
			g.columns = append(g.columns, colName.String)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]adapter.IndexInfo, 0, len(order))
	for _, name := range order {
		g := groups[name]
		result = append(result, adapter.IndexInfo{
			Name:    name,
			Columns: g.columns,
			Unique:  g.unique,
			Primary: g.primary,
		})
	}

	return result, nil
}
