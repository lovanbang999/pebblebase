package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/schema"
)

// TableMetadata holds ClickHouse-specific engine and storage details.
type TableMetadata struct {
	Name       string
	Engine     string
	TotalRows  uint64
	TotalBytes uint64
	PrimaryKey string
	SortingKey string
}

// introspect queries ClickHouse's system.tables and system.columns to build the unified schema model.
func introspect(ctx context.Context, db *sql.DB) ([]schema.Table, error) {
	tables, err := fetchTableMetadata(ctx, db)
	if err != nil {
		return nil, err
	}

	result := make([]schema.Table, 0, len(tables))
	for _, t := range tables {
		cols, err := fetchColumns(ctx, db, t.Name)
		if err != nil {
			return nil, err
		}
		result = append(result, schema.Table{
			Name:      t.Name,
			Columns:   cols,
			Relations: []schema.Relation{}, // ClickHouse is an analytical store without foreign-key constraints
		})
	}
	return result, nil
}

// fetchTableMetadata retrieves all tables and their storage engines (e.g. MergeTree, ReplacingMergeTree, Log).
func fetchTableMetadata(ctx context.Context, db *sql.DB) ([]TableMetadata, error) {
	const q = `
		SELECT 
			name,
			engine,
			total_rows,
			total_bytes,
			primary_key,
			sorting_key
		FROM system.tables
		WHERE database = currentDatabase()
		  AND is_temporary = 0
		ORDER BY name`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("clickhouse: fetch tables: %w", err)
	}
	defer rows.Close()

	var tables []TableMetadata
	for rows.Next() {
		var (
			name       string
			engine     string
			totalRows  sql.NullInt64
			totalBytes sql.NullInt64
			pk         sql.NullString
			sk         sql.NullString
		)
		if err := rows.Scan(&name, &engine, &totalRows, &totalBytes, &pk, &sk); err != nil {
			return nil, fmt.Errorf("clickhouse: scan table: %w", err)
		}

		tables = append(tables, TableMetadata{
			Name:       name,
			Engine:     engine,
			TotalRows:  uint64(totalRows.Int64),
			TotalBytes: uint64(totalBytes.Int64),
			PrimaryKey: pk.String,
			SortingKey: sk.String,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("clickhouse: iterate tables: %w", err)
	}
	return tables, nil
}

// fetchColumns returns columns for a table with type normalization and PK detection.
func fetchColumns(ctx context.Context, db *sql.DB, table string) ([]schema.Column, error) {
	const q = `
		SELECT 
			name,
			type,
			default_expression,
			is_in_primary_key
		FROM system.columns
		WHERE database = currentDatabase()
		  AND table = ?
		ORDER BY position`

	rows, err := db.QueryContext(ctx, q, table)
	if err != nil {
		return nil, fmt.Errorf("clickhouse: fetch columns for %q: %w", table, err)
	}
	defer rows.Close()

	var cols []schema.Column
	for rows.Next() {
		var (
			name        string
			rawType     string
			defaultExpr sql.NullString
			isPK        uint8
		)
		if err := rows.Scan(&name, &rawType, &defaultExpr, &isPK); err != nil {
			return nil, fmt.Errorf("clickhouse: scan column for %q: %w", table, err)
		}

		var defaultVal *string
		if defaultExpr.Valid && defaultExpr.String != "" {
			s := defaultExpr.String
			defaultVal = &s
		}

		isNullable := strings.HasPrefix(rawType, "Nullable(")
		cols = append(cols, schema.Column{
			Name:         name,
			Type:         normalizeType(rawType),
			Nullable:     isNullable,
			IsPrimaryKey: isPK == 1,
			IsForeignKey: false,
			DefaultValue: defaultVal,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("clickhouse: iterate columns for %q: %w", table, err)
	}

	return cols, nil
}

// normalizeType maps ClickHouse types (including Array, Map, Tuple, Int, Date) to unified schema types.
func normalizeType(rawType string) string {
	t := strings.TrimSpace(rawType)

	// Strip Nullable(...) and LowCardinality(...) wrappers
	for {
		if strings.HasPrefix(t, "Nullable(") && strings.HasSuffix(t, ")") {
			t = strings.TrimSpace(t[9 : len(t)-1])
			continue
		}
		if strings.HasPrefix(t, "LowCardinality(") && strings.HasSuffix(t, ")") {
			t = strings.TrimSpace(t[15 : len(t)-1])
			continue
		}
		break
	}

	lower := strings.ToLower(t)

	// Complex ClickHouse structures
	if strings.HasPrefix(lower, "array(") ||
		strings.HasPrefix(lower, "map(") ||
		strings.HasPrefix(lower, "tuple(") ||
		strings.HasPrefix(lower, "nested(") ||
		lower == "json" {
		return "json"
	}

	switch {
	case lower == "bool":
		return "bool"
	case strings.HasPrefix(lower, "int") || strings.HasPrefix(lower, "uint"):
		return "int"
	case strings.HasPrefix(lower, "float") || strings.HasPrefix(lower, "decimal"):
		return "float"
	case strings.HasPrefix(lower, "date") || strings.HasPrefix(lower, "datetime"):
		return "datetime"
	case lower == "uuid":
		return "uuid"
	case strings.HasPrefix(lower, "string") ||
		strings.HasPrefix(lower, "fixedstring") ||
		strings.HasPrefix(lower, "enum") ||
		lower == "ipv4" || lower == "ipv6":
		return "string"
	default:
		return "unknown"
	}
}
