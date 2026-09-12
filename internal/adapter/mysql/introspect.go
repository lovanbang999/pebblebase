package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/schema"
)

// introspect queries MySQL's information_schema to build the unified schema model.
func introspect(ctx context.Context, db *sql.DB) ([]schema.Table, error) {
	tables, err := fetchTables(ctx, db)
	if err != nil {
		return nil, err
	}

	relations, err := fetchRelations(ctx, db)
	if err != nil {
		return nil, err
	}

	// Group relations by source table for O(1) lookup.
	relByTable := make(map[string][]schema.Relation, len(relations))
	for _, r := range relations {
		relByTable[r.FromTable] = append(relByTable[r.FromTable], r)
	}

	// Build FK column set for quick IsForeignKey annotation.
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

// fetchTables returns all user-defined table names in the active database.
func fetchTables(ctx context.Context, db *sql.DB) ([]string, error) {
	const q = `
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = DATABASE()
		  AND table_type   = 'BASE TABLE'
		ORDER BY table_name`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("mysql: fetch tables: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("mysql: scan table name: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// fetchColumns returns columns for a single table annotated with PK and FK metadata.
func fetchColumns(ctx context.Context, db *sql.DB, table string, fkCols map[string]struct{}) ([]schema.Column, error) {
	const q = `
		SELECT
			column_name,
			data_type,
			is_nullable,
			column_default,
			column_key
		FROM information_schema.columns
		WHERE table_schema = DATABASE()
		  AND table_name   = ?
		ORDER BY ordinal_position`

	rows, err := db.QueryContext(ctx, q, table)
	if err != nil {
		return nil, fmt.Errorf("mysql: fetch columns for %q: %w", table, err)
	}
	defer rows.Close()

	var cols []schema.Column
	for rows.Next() {
		var (
			name         string
			rawType      string
			isNullable   string
			defaultVal   *string
			columnKey    string
		)
		if err := rows.Scan(&name, &rawType, &isNullable, &defaultVal, &columnKey); err != nil {
			return nil, fmt.Errorf("mysql: scan column for %q: %w", table, err)
		}

		_, isFk := fkCols[table+"."+name]
		cols = append(cols, schema.Column{
			Name:         name,
			Type:         normalizeType(rawType),
			Nullable:     strings.EqualFold(isNullable, "YES"),
			IsPrimaryKey: columnKey == "PRI",
			IsForeignKey: isFk,
			DefaultValue: defaultVal,
		})
	}
	return cols, rows.Err()
}

// fetchRelations returns all foreign-key relationships defined in the current database.
func fetchRelations(ctx context.Context, db *sql.DB) ([]schema.Relation, error) {
	const q = `
		SELECT
			constraint_name,
			table_name,
			column_name,
			referenced_table_name,
			referenced_column_name
		FROM information_schema.key_column_usage
		WHERE table_schema = DATABASE()
		  AND referenced_table_name IS NOT NULL
		ORDER BY constraint_name, ordinal_position`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("mysql: fetch relations: %w", err)
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
			return nil, fmt.Errorf("mysql: scan relation: %w", err)
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

// normalizeType maps MySQL data types to schema.Column types.
func normalizeType(dataType string) string {
	switch strings.ToLower(dataType) {
	case "varchar", "char", "text", "tinytext", "mediumtext", "longtext", "enum", "set":
		return "string"
	case "int", "tinyint", "smallint", "mediumint", "bigint", "integer":
		return "int"
	case "float", "double", "decimal", "numeric":
		return "float"
	case "bool", "boolean":
		return "bool"
	case "datetime", "timestamp", "date", "time", "year":
		return "datetime"
	case "json":
		return "json"
	case "blob", "tinyblob", "mediumblob", "longblob", "binary", "varbinary":
		return "binary"
	default:
		return "unknown"
	}
}
