package mssql

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

var _ adapter.DDLProvider = (*MSSQLAdapter)(nil)
var _ adapter.TableStatsProvider = (*MSSQLAdapter)(nil)
var _ adapter.MigrationRunner = (*MSSQLAdapter)(nil)

// GetTableDDL constructs the CREATE TABLE statement for a SQL Server table.
func (a *MSSQLAdapter) GetTableDDL(ctx context.Context, table string) (string, error) {
	schemaName, tableName := splitSchemaAndTable(table)

	const q = `
		SELECT 
			c.name AS column_name,
			tp.name AS data_type,
			c.max_length,
			c.precision,
			c.scale,
			c.is_nullable,
			c.is_identity,
			OBJECT_DEFINITION(c.default_object_id) AS default_value
		FROM sys.columns c
		INNER JOIN sys.tables t ON c.object_id = t.object_id
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id
		WHERE s.name = @p1 AND t.name = @p2
		ORDER BY c.column_id`

	rows, err := a.db.QueryContext(ctx, q, schemaName, tableName)
	if err != nil {
		return "", fmt.Errorf("mssql: get table ddl columns: %w", err)
	}
	defer rows.Close()

	var colDefs []string
	for rows.Next() {
		var (
			name       string
			dataType   string
			maxLen     int16
			precision  uint8
			scale      uint8
			isNullable bool
			isIdentity bool
			defaultVal *string
		)
		if err := rows.Scan(&name, &dataType, &maxLen, &precision, &scale, &isNullable, &isIdentity, &defaultVal); err != nil {
			return "", fmt.Errorf("mssql: scan ddl column: %w", err)
		}

		typeStr := strings.ToUpper(dataType)
		switch typeStr {
		case "VARCHAR", "CHAR", "VARBINARY", "BINARY":
			if maxLen == -1 {
				typeStr += "(MAX)"
			} else {
				typeStr += fmt.Sprintf("(%d)", maxLen)
			}
		case "NVARCHAR", "NCHAR":
			if maxLen == -1 {
				typeStr += "(MAX)"
			} else {
				typeStr += fmt.Sprintf("(%d)", maxLen/2)
			}
		case "DECIMAL", "NUMERIC":
			typeStr += fmt.Sprintf("(%d, %d)", precision, scale)
		}

		colDef := fmt.Sprintf("[%s] %s", name, typeStr)
		if isIdentity {
			colDef += " IDENTITY(1,1)"
		}
		if isNullable {
			colDef += " NULL"
		} else {
			colDef += " NOT NULL"
		}
		if defaultVal != nil && *defaultVal != "" {
			colDef += " DEFAULT " + *defaultVal
		}
		colDefs = append(colDefs, "  "+colDef)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("mssql: iterate ddl columns: %w", err)
	}

	if len(colDefs) == 0 {
		return "", fmt.Errorf("mssql: table %q not found or has no columns", table)
	}

	indexes, _ := a.GetTableIndexes(ctx, table)
	for _, idx := range indexes {
		if idx.Primary {
			quotedCols := make([]string, len(idx.Columns))
			for i, c := range idx.Columns {
				quotedCols[i] = fmt.Sprintf("[%s]", c)
			}
			colDefs = append(colDefs, fmt.Sprintf("  CONSTRAINT [%s] PRIMARY KEY (%s)", idx.Name, strings.Join(quotedCols, ", ")))
			break
		}
	}

	ddl := fmt.Sprintf("CREATE TABLE %s (\n%s\n);", escapeIdentifier(table), strings.Join(colDefs, ",\n"))
	return ddl, nil
}

// GetTableIndexes returns all indexes for the given table.
func (a *MSSQLAdapter) GetTableIndexes(ctx context.Context, table string) ([]adapter.IndexInfo, error) {
	schemaName, tableName := splitSchemaAndTable(table)

	const q = `
		SELECT 
			i.name AS index_name,
			i.is_unique,
			i.is_primary_key,
			c.name AS column_name,
			ic.key_ordinal
		FROM sys.indexes i
		INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		INNER JOIN sys.tables t ON i.object_id = t.object_id
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1 AND t.name = @p2 AND i.is_hypothetical = 0 AND i.name IS NOT NULL
		ORDER BY i.name, ic.key_ordinal`

	rows, err := a.db.QueryContext(ctx, q, schemaName, tableName)
	if err != nil {
		return nil, fmt.Errorf("mssql: get table indexes for %q: %w", table, err)
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
			idxName    string
			unique     bool
			primary    bool
			columnName string
			ordinal    int
		)
		if err := rows.Scan(&idxName, &unique, &primary, &columnName, &ordinal); err != nil {
			return nil, fmt.Errorf("mssql: scan index row: %w", err)
		}

		g, ok := groups[idxName]
		if !ok {
			g = &group{unique: unique, primary: primary}
			groups[idxName] = g
			order = append(order, idxName)
		}
		g.columns = append(g.columns, columnName)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("mssql: iterate indexes: %w", err)
	}

	result := make([]adapter.IndexInfo, 0, len(order))
	for _, name := range order {
		g := groups[name]
		result = append(result, adapter.IndexInfo{
			Name:    name,
			Unique:  g.unique,
			Primary: g.primary,
			Columns: g.columns,
		})
	}
	return result, nil
}

// GetTableStats returns row count and estimated storage size in bytes.
func (a *MSSQLAdapter) GetTableStats(ctx context.Context, table string) (adapter.TableStats, error) {
	schemaName, tableName := splitSchemaAndTable(table)

	const q = `
		SELECT 
			COALESCE(SUM(p.rows), 0) AS total_rows,
			COALESCE(SUM(a.total_pages) * 8192, 0) AS size_bytes
		FROM sys.tables t
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		INNER JOIN sys.indexes i ON t.object_id = i.object_id
		INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
		INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
		WHERE s.name = @p1 AND t.name = @p2 AND i.index_id IN (0, 1)`

	var totalRows, sizeBytes int64
	err := a.db.QueryRowContext(ctx, q, schemaName, tableName).Scan(&totalRows, &sizeBytes)
	if err != nil {
		return adapter.TableStats{}, fmt.Errorf("mssql: get table stats for %q: %w", table, err)
	}

	return adapter.TableStats{
		TotalRows:     totalRows,
		SizeBytes:     sizeBytes,
		EstimatedRows: true,
		LastUpdated:   time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ExecuteMigration executes DDL migration statements or returns a dry-run plan.
func (a *MSSQLAdapter) ExecuteMigration(ctx context.Context, ddl string, dryRun bool) (adapter.MigrationResult, error) {
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

	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return adapter.MigrationResult{Success: false, Error: err.Error()}, err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, cleanDDL)
	if err != nil {
		return adapter.MigrationResult{Success: false, Error: err.Error()}, err
	}

	var affected int64
	if res != nil {
		affected, _ = res.RowsAffected()
	}

	if err := tx.Commit(); err != nil {
		return adapter.MigrationResult{Success: false, Error: err.Error()}, err
	}

	return adapter.MigrationResult{
		Success:      true,
		AffectedRows: affected,
		Plan:         plan,
		ExecutedAt:   time.Now().UTC().Format(time.RFC3339),
	}, nil
}
