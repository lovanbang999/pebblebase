package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"pebblebase/internal/schema"
)

// introspect queries information_schema to build the full schema model.
func introspect(ctx context.Context, pool *pgxpool.Pool) ([]schema.Table, error) {
	tables, err := fetchTables(ctx, pool)
	if err != nil {
		return nil, err
	}

	relations, err := fetchRelations(ctx, pool)
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
		cols, err := fetchColumns(ctx, pool, t, fkCols)
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

// fetchTables returns all user-defined table names in the public schema.
func fetchTables(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	const q = `
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = 'public'
		  AND table_type  = 'BASE TABLE'
		ORDER BY table_name`

	rows, err := pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("postgres: fetch tables: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("postgres: scan table name: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// fetchColumns returns the columns for a single table, annotated with
// primary-key and foreign-key flags.
func fetchColumns(ctx context.Context, pool *pgxpool.Pool, table string, fkCols map[string]struct{}) ([]schema.Column, error) {
	const q = `
		SELECT
			c.column_name,
			c.data_type,
			c.is_nullable,
			c.column_default,
			COALESCE(
				(SELECT true
				 FROM information_schema.table_constraints tc
				 JOIN information_schema.key_column_usage kcu
				   ON tc.constraint_name = kcu.constraint_name
				  AND tc.table_schema    = kcu.table_schema
				 WHERE tc.constraint_type = 'PRIMARY KEY'
				   AND tc.table_name      = c.table_name
				   AND kcu.column_name    = c.column_name
				 LIMIT 1),
				false
			) AS is_primary_key
		FROM information_schema.columns c
		WHERE c.table_schema = 'public'
		  AND c.table_name   = $1
		ORDER BY c.ordinal_position`

	rows, err := pool.Query(ctx, q, table)
	if err != nil {
		return nil, fmt.Errorf("postgres: fetch columns for %q: %w", table, err)
	}
	defer rows.Close()

	var cols []schema.Column
	for rows.Next() {
		var (
			name       string
			rawType    string
			isNullable string
			defVal     *string
			isPK       bool
		)
		if err := rows.Scan(&name, &rawType, &isNullable, &defVal, &isPK); err != nil {
			return nil, fmt.Errorf("postgres: scan column: %w", err)
		}
		_, isFK := fkCols[table+"."+name]
		cols = append(cols, schema.Column{
			Name:         name,
			Type:         normalizeType(rawType),
			Nullable:     isNullable == "YES",
			IsPrimaryKey: isPK,
			IsForeignKey: isFK,
			DefaultValue: defVal,
		})
	}
	return cols, rows.Err()
}

// fetchRelations returns all foreign-key relations defined in the public schema.
func fetchRelations(ctx context.Context, pool *pgxpool.Pool) ([]schema.Relation, error) {
	const q = `
		SELECT
			rc.constraint_name,
			kcu.table_name  AS from_table,
			kcu.column_name AS from_column,
			ccu.table_name  AS to_table,
			ccu.column_name AS to_column
		FROM information_schema.referential_constraints rc
		JOIN information_schema.key_column_usage kcu
		  ON kcu.constraint_name = rc.constraint_name
		 AND kcu.table_schema    = rc.constraint_schema
		JOIN information_schema.constraint_column_usage ccu
		  ON ccu.constraint_name = rc.unique_constraint_name
		 AND ccu.table_schema    = rc.constraint_schema
		ORDER BY rc.constraint_name`

	rows, err := pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("postgres: fetch relations: %w", err)
	}
	defer rows.Close()

	var rels []schema.Relation
	for rows.Next() {
		var r schema.Relation
		if err := rows.Scan(&r.Name, &r.FromTable, &r.FromColumn, &r.ToTable, &r.ToColumn); err != nil {
			return nil, fmt.Errorf("postgres: scan relation: %w", err)
		}
		r.Type = schema.OneToMany // FK always implies one-to-many at the source side
		rels = append(rels, r)
	}
	return rels, rows.Err()
}

// normalizeType maps a Postgres data_type string to the unified schema type.
func normalizeType(pgType string) string {
	switch pgType {
	case "character varying", "character", "text", "name", "citext":
		return "string"
	case "integer", "bigint", "smallint", "int", "int2", "int4", "int8",
		"serial", "bigserial", "smallserial":
		return "int"
	case "numeric", "decimal", "real", "double precision",
		"float4", "float8", "money":
		return "float"
	case "boolean":
		return "bool"
	case "timestamp without time zone", "timestamp with time zone",
		"date", "time without time zone", "time with time zone", "interval":
		return "datetime"
	case "json", "jsonb":
		return "json"
	case "bytea":
		return "binary"
	case "uuid":
		return "uuid"
	default:
		return "unknown"
	}
}
