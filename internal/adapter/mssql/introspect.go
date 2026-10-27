package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/schema"
)

// introspect queries SQL Server system catalogs (sys.tables, sys.columns, sys.types, sys.indexes)
// or INFORMATION_SCHEMA to construct the unified schema model.
func introspect(ctx context.Context, db *sql.DB) ([]schema.Table, error) {
	tables, err := fetchTables(ctx, db)
	if err != nil {
		return nil, err
	}

	relations, err := fetchRelations(ctx, db)
	if err != nil {
		return nil, err
	}

	relByTable := make(map[string][]schema.Relation, len(relations))
	for _, r := range relations {
		relByTable[r.FromTable] = append(relByTable[r.FromTable], r)
	}

	fkCols := make(map[string]struct{}, len(relations))
	for _, r := range relations {
		fkCols[r.FromTable+"."+r.FromColumn] = struct{}{}
	}

	result := make([]schema.Table, 0, len(tables))
	for _, t := range tables {
		cols, err := fetchColumns(ctx, db, t, fkCols)
		if err != nil {
			return nil, err
		}
		result = append(result, schema.Table{
			Name:      t,
			Columns:   cols,
			Relations: relByTable[t],
		})
	}
	return result, nil
}

// fetchTables returns user tables from sys.tables or INFORMATION_SCHEMA.TABLES.
func fetchTables(ctx context.Context, db *sql.DB) ([]string, error) {
	const qSys = `
		SELECT 
			CASE 
				WHEN s.name = 'dbo' THEN t.name 
				ELSE s.name + '.' + t.name 
			END AS table_name
		FROM sys.tables t
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE t.is_ms_shipped = 0 AND t.name NOT LIKE 'dtproperties'
		ORDER BY s.name, t.name`

	rows, err := db.QueryContext(ctx, qSys)
	if err != nil {
		// Fallback to INFORMATION_SCHEMA
		return fetchTablesFallback(ctx, db)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("mssql: scan table name: %w", err)
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("mssql: iterate tables: %w", err)
	}
	return names, nil
}

func fetchTablesFallback(ctx context.Context, db *sql.DB) ([]string, error) {
	const q = `
		SELECT 
			CASE 
				WHEN TABLE_SCHEMA = 'dbo' THEN TABLE_NAME 
				ELSE TABLE_SCHEMA + '.' + TABLE_NAME 
			END AS table_name
		FROM INFORMATION_SCHEMA.TABLES
		WHERE TABLE_TYPE = 'BASE TABLE'
		ORDER BY TABLE_SCHEMA, TABLE_NAME`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("mssql: fetch tables fallback: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("mssql: scan table name: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// splitSchemaAndTable parses "schema.table" or "table" (defaulting schema to "dbo").
func splitSchemaAndTable(fullTable string) (string, string) {
	parts := strings.Split(fullTable, ".")
	if len(parts) >= 2 {
		return strings.Trim(parts[0], "[]"), strings.Trim(parts[1], "[]")
	}
	return "dbo", strings.Trim(parts[0], "[]")
}

// fetchColumns inspects columns, data types, nullability, defaults, and primary key status.
func fetchColumns(ctx context.Context, db *sql.DB, table string, fkCols map[string]struct{}) ([]schema.Column, error) {
	schemaName, tableName := splitSchemaAndTable(table)

	const qSys = `
		SELECT 
			c.name AS column_name,
			tp.name AS data_type,
			c.is_nullable,
			OBJECT_DEFINITION(c.default_object_id) AS default_value,
			CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key
		FROM sys.columns c
		INNER JOIN sys.tables t ON c.object_id = t.object_id
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id
		LEFT JOIN (
			SELECT ic.object_id, ic.column_id
			FROM sys.index_columns ic
			INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
			WHERE i.is_primary_key = 1
		) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
		WHERE s.name = @p1 AND t.name = @p2
		ORDER BY c.column_id`

	rows, err := db.QueryContext(ctx, qSys, schemaName, tableName)
	if err != nil {
		return fetchColumnsFallback(ctx, db, table, schemaName, tableName, fkCols)
	}
	defer rows.Close()

	var cols []schema.Column
	for rows.Next() {
		var (
			name       string
			rawType    string
			nullable   bool
			defaultVal *string
			isPK       bool
		)
		if err := rows.Scan(&name, &rawType, &nullable, &defaultVal, &isPK); err != nil {
			return nil, fmt.Errorf("mssql: scan column for %q: %w", table, err)
		}

		_, isFK := fkCols[table+"."+name]
		cols = append(cols, schema.Column{
			Name:         name,
			Type:         normalizeType(rawType),
			Nullable:     nullable,
			IsPrimaryKey: isPK,
			IsForeignKey: isFK,
			DefaultValue: cleanDefaultValue(defaultVal),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("mssql: iterate columns: %w", err)
	}

	if len(cols) == 0 {
		return fetchColumnsFallback(ctx, db, table, schemaName, tableName, fkCols)
	}

	return cols, nil
}

func fetchColumnsFallback(ctx context.Context, db *sql.DB, fullTable, schemaName, tableName string, fkCols map[string]struct{}) ([]schema.Column, error) {
	const q = `
		SELECT 
			c.COLUMN_NAME,
			c.DATA_TYPE,
			c.IS_NULLABLE,
			c.COLUMN_DEFAULT,
			CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK
		FROM INFORMATION_SCHEMA.COLUMNS c
		LEFT JOIN (
			SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
			FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
			JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
				ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
				AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
			WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
		) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA 
			AND c.TABLE_NAME = pk.TABLE_NAME 
			AND c.COLUMN_NAME = pk.COLUMN_NAME
		WHERE c.TABLE_SCHEMA = @p1 AND c.TABLE_NAME = @p2
		ORDER BY c.ORDINAL_POSITION`

	rows, err := db.QueryContext(ctx, q, schemaName, tableName)
	if err != nil {
		return nil, fmt.Errorf("mssql: fetch columns fallback for %q: %w", fullTable, err)
	}
	defer rows.Close()

	var cols []schema.Column
	for rows.Next() {
		var (
			name       string
			rawType    string
			isNullable string
			defaultVal *string
			isPK       bool
		)
		if err := rows.Scan(&name, &rawType, &isNullable, &defaultVal, &isPK); err != nil {
			return nil, fmt.Errorf("mssql: scan fallback column for %q: %w", fullTable, err)
		}

		_, isFK := fkCols[fullTable+"."+name]
		cols = append(cols, schema.Column{
			Name:         name,
			Type:         normalizeType(rawType),
			Nullable:     strings.EqualFold(isNullable, "YES"),
			IsPrimaryKey: isPK,
			IsForeignKey: isFK,
			DefaultValue: cleanDefaultValue(defaultVal),
		})
	}
	return cols, rows.Err()
}

// cleanDefaultValue strips outer SQL Server parentheses e.g. "((0))" -> "0"
func cleanDefaultValue(v *string) *string {
	if v == nil {
		return nil
	}
	s := strings.TrimSpace(*v)
	for strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		s = strings.TrimSpace(s[1 : len(s)-1])
	}
	return &s
}

// fetchRelations returns all foreign-key relationships in the database.
func fetchRelations(ctx context.Context, db *sql.DB) ([]schema.Relation, error) {
	const q = `
		SELECT 
			fk.name AS constraint_name,
			CASE 
				WHEN from_s.name = 'dbo' THEN from_t.name 
				ELSE from_s.name + '.' + from_t.name 
			END AS from_table,
			from_c.name AS from_column,
			CASE 
				WHEN to_s.name = 'dbo' THEN to_t.name 
				ELSE to_s.name + '.' + to_t.name 
			END AS to_table,
			to_c.name AS to_column
		FROM sys.foreign_keys fk
		INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
		INNER JOIN sys.tables from_t ON fkc.parent_object_id = from_t.object_id
		INNER JOIN sys.schemas from_s ON from_t.schema_id = from_s.schema_id
		INNER JOIN sys.columns from_c ON fkc.parent_object_id = from_c.object_id AND fkc.parent_column_id = from_c.column_id
		INNER JOIN sys.tables to_t ON fkc.referenced_object_id = to_t.object_id
		INNER JOIN sys.schemas to_s ON to_t.schema_id = to_s.schema_id
		INNER JOIN sys.columns to_c ON fkc.referenced_object_id = to_c.object_id AND fkc.referenced_column_id = to_c.column_id
		ORDER BY fk.name`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return fetchRelationsFallback(ctx, db)
	}
	defer rows.Close()

	var rels []schema.Relation
	for rows.Next() {
		var (
			name      string
			fromTable string
			fromCol   string
			toTable   string
			toCol     string
		)
		if err := rows.Scan(&name, &fromTable, &fromCol, &toTable, &toCol); err != nil {
			return nil, fmt.Errorf("mssql: scan relation: %w", err)
		}
		rels = append(rels, schema.Relation{
			Name:       name,
			Type:       schema.OneToMany,
			FromTable:  fromTable,
			FromColumn: fromCol,
			ToTable:    toTable,
			ToColumn:   toCol,
		})
	}
	return rels, rows.Err()
}

func fetchRelationsFallback(ctx context.Context, db *sql.DB) ([]schema.Relation, error) {
	const q = `
		SELECT 
			rc.CONSTRAINT_NAME,
			kcu1.TABLE_NAME AS from_table,
			kcu1.COLUMN_NAME AS from_column,
			kcu2.TABLE_NAME AS to_table,
			kcu2.COLUMN_NAME AS to_column
		FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
		JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu1 
			ON rc.CONSTRAINT_NAME = kcu1.CONSTRAINT_NAME
		JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2 
			ON rc.UNIQUE_CONSTRAINT_NAME = kcu2.CONSTRAINT_NAME
		ORDER BY rc.CONSTRAINT_NAME`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		// Non-fatal if fallback fails; return empty relations list
		return nil, nil
	}
	defer rows.Close()

	var rels []schema.Relation
	for rows.Next() {
		var (
			name      string
			fromTable string
			fromCol   string
			toTable   string
			toCol     string
		)
		if err := rows.Scan(&name, &fromTable, &fromCol, &toTable, &toCol); err != nil {
			return nil, fmt.Errorf("mssql: scan fallback relation: %w", err)
		}
		rels = append(rels, schema.Relation{
			Name:       name,
			Type:       schema.OneToMany,
			FromTable:  fromTable,
			FromColumn: fromCol,
			ToTable:    toTable,
			ToColumn:   toCol,
		})
	}
	return rels, rows.Err()
}

// normalizeType maps SQL Server data types to normalized schema types.
func normalizeType(dataType string) string {
	dt := strings.ToLower(strings.TrimSpace(dataType))

	switch dt {
	case "int", "bigint", "smallint", "tinyint":
		return "int"
	case "bit":
		return "bool"
	case "decimal", "numeric", "float", "real", "money", "smallmoney":
		return "float"
	case "datetime", "datetime2", "smalldatetime", "date", "time", "datetimeoffset":
		return "datetime"
	case "char", "varchar", "nchar", "nvarchar", "text", "ntext", "sysname":
		return "string"
	case "uniqueidentifier":
		return "uuid"
	case "binary", "varbinary", "image", "timestamp", "rowversion":
		return "binary"
	case "xml", "json":
		return "json"
	default:
		if strings.Contains(dt, "char") || strings.Contains(dt, "text") {
			return "string"
		}
		if strings.Contains(dt, "int") {
			return "int"
		}
		if strings.Contains(dt, "time") || strings.Contains(dt, "date") {
			return "datetime"
		}
		return "unknown"
	}
}
