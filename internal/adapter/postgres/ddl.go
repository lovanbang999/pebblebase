package postgres

import (
	"context"
	"fmt"
	"strings"

	"pebblebase/internal/adapter"
)

var _ adapter.DDLProvider = (*PostgresAdapter)(nil)

// GetTableDDL inspects Postgres information_schema and pg_indexes to generate a complete CREATE TABLE script.
func (a *PostgresAdapter) GetTableDDL(ctx context.Context, table string) (string, error) {
	// 1. Fetch Columns
	const colQuery = `
		SELECT
			column_name,
			data_type,
			udt_name,
			character_maximum_length,
			numeric_precision,
			numeric_scale,
			is_nullable,
			column_default
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name   = $1
		ORDER BY ordinal_position`

	rows, err := a.pool.Query(ctx, colQuery, table)
	if err != nil {
		return "", fmt.Errorf("postgres: get columns for %q: %w", table, err)
	}
	defer rows.Close()

	type colDef struct {
		name      string
		dataType  string
		udtName   string
		charLen   *int
		numPrec   *int
		numScale  *int
		nullable  string
		colDefVal *string
	}

	var cols []colDef
	for rows.Next() {
		var c colDef
		if err := rows.Scan(
			&c.name,
			&c.dataType,
			&c.udtName,
			&c.charLen,
			&c.numPrec,
			&c.numScale,
			&c.nullable,
			&c.colDefVal,
		); err != nil {
			return "", fmt.Errorf("postgres: scan column for %q: %w", table, err)
		}
		cols = append(cols, c)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}

	if len(cols) == 0 {
		return "", fmt.Errorf("postgres: table %q not found or has no columns", table)
	}

	constraints, err := a.GetSchemaConstraints(ctx)
	if err != nil {
		return "", err
	}
	var pkName string
	var pkCols []string
	for _, constraint := range constraints[table] {
		if constraint.Kind == "primary_key" {
			pkName = constraint.Name
			pkCols = constraint.Columns
		}
	}

	// 4. Assemble CREATE TABLE Statement
	var lines []string
	for _, c := range cols {
		typeStr := c.dataType
		switch c.dataType {
		case "character varying":
			if c.charLen != nil {
				typeStr = fmt.Sprintf("varchar(%d)", *c.charLen)
			}
		case "character":
			if c.charLen != nil {
				typeStr = fmt.Sprintf("char(%d)", *c.charLen)
			}
		case "numeric":
			if c.numPrec != nil && c.numScale != nil {
				typeStr = fmt.Sprintf("numeric(%d,%d)", *c.numPrec, *c.numScale)
			}
		case "USER-DEFINED":
			typeStr = c.udtName
		}

		line := fmt.Sprintf("    %s %s", quoteDDLIdentifier(c.name), typeStr)
		if c.colDefVal != nil && *c.colDefVal != "" {
			line += fmt.Sprintf(" DEFAULT %s", *c.colDefVal)
		}
		if c.nullable == "NO" {
			line += " NOT NULL"
		}
		lines = append(lines, line)
	}

	if len(pkCols) > 0 {
		quotedCols := make([]string, len(pkCols))
		for i, col := range pkCols {
			quotedCols[i] = quoteDDLIdentifier(col)
		}
		if pkName != "" {
			lines = append(lines, fmt.Sprintf("    CONSTRAINT %s PRIMARY KEY (%s)", quoteDDLIdentifier(pkName), strings.Join(quotedCols, ", ")))
		} else {
			lines = append(lines, fmt.Sprintf("    PRIMARY KEY (%s)", strings.Join(quotedCols, ", ")))
		}
	}

	quote := func(value string) string { return `"` + strings.ReplaceAll(value, `"`, `""`) + `"` }
	quotedColumns := func(columns []string) string {
		result := make([]string, len(columns))
		for i, column := range columns {
			result[i] = quote(column)
		}
		return strings.Join(result, ", ")
	}
	for _, constraint := range constraints[table] {
		switch constraint.Kind {
		case "unique":
			lines = append(lines, fmt.Sprintf("    CONSTRAINT %s UNIQUE (%s)", quote(constraint.Name), quotedColumns(constraint.Columns)))
		case "foreign_key":
			lines = append(lines, fmt.Sprintf("    CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s.%s (%s)", quote(constraint.Name), quotedColumns(constraint.Columns), quote(constraint.ReferenceSchema), quote(constraint.ReferenceTable), quotedColumns(constraint.ReferenceColumns)))
		}
	}

	ddl := fmt.Sprintf("CREATE TABLE %s (\n%s\n);", quoteDDLIdentifier(table), strings.Join(lines, ",\n"))

	// 5. Fetch Secondary Indexes
	const idxQuery = `
		SELECT indexname, indexdef
		FROM pg_indexes
		WHERE schemaname = 'public'
		  AND tablename  = $1
		ORDER BY indexname`

	idxRows, err := a.pool.Query(ctx, idxQuery, table)
	if err == nil {
		defer idxRows.Close()
		var idxDefs []string
		for idxRows.Next() {
			var iName, def string
			if err := idxRows.Scan(&iName, &def); err == nil {
				// Don't duplicate the primary key index since it's declared in the table body
				constraintBacked := false
				for _, constraint := range constraints[table] {
					if constraint.Name == iName && (constraint.Kind == "unique" || constraint.Kind == "primary_key") {
						constraintBacked = true
					}
				}
				if constraintBacked || iName == pkName || strings.HasSuffix(iName, "_pkey") {
					continue
				}
				stmt := strings.TrimSpace(def)
				if !strings.HasSuffix(stmt, ";") {
					stmt += ";"
				}
				idxDefs = append(idxDefs, stmt)
			}
		}
		if len(idxDefs) > 0 {
			ddl += "\n\n-- Indexes\n" + strings.Join(idxDefs, "\n")
		}
	}

	return ddl, nil
}

// GetTableIndexes retrieves index names, columns, and uniqueness for the table.
func (a *PostgresAdapter) GetTableIndexes(ctx context.Context, table string) ([]adapter.IndexInfo, error) {
	return readTableIndexes(ctx, a.pool, table)
}
func readTableIndexes(ctx context.Context, pool constraintQuerier, table string) ([]adapter.IndexInfo, error) {
	const q = `
		SELECT
			i.relname AS index_name,
			ix.indisunique AS is_unique,
			ix.indisprimary AS is_primary,
			ARRAY_AGG(pg_get_indexdef(ix.indexrelid,k.ord::int,true) ORDER BY k.ord) AS column_names, pg_get_indexdef(ix.indexrelid) AS definition
		FROM pg_index ix
		JOIN pg_class t ON t.oid = ix.indrelid
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum,ord) ON true
		WHERE n.nspname = 'public'
		  AND t.relname = $1
		GROUP BY i.relname, ix.indisunique, ix.indisprimary, ix.indexrelid
		ORDER BY ix.indisprimary DESC, i.relname`

	rows, err := pool.Query(ctx, q, table)
	if err != nil {
		return nil, fmt.Errorf("postgres: query indexes for %q: %w", table, err)
	}
	defer rows.Close()

	var indexes []adapter.IndexInfo
	for rows.Next() {
		var (
			name       string
			isUnique   bool
			isPrimary  bool
			cols       []string
			definition string
		)
		if err := rows.Scan(&name, &isUnique, &isPrimary, &cols, &definition); err != nil {
			return nil, fmt.Errorf("postgres: scan index for %q: %w", table, err)
		}
		indexes = append(indexes, adapter.IndexInfo{
			Name:       name,
			Columns:    cols,
			Unique:     isUnique,
			Primary:    isPrimary,
			Definition: definition,
		})
	}
	return indexes, rows.Err()
}

func quoteDDLIdentifier(value string) string { return `"` + strings.ReplaceAll(value, `"`, `""`) + `"` }
