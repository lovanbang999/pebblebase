package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"pebblebase/internal/schema"
)

// introspect inspects sqlite_master and PRAGMAs to construct the unified schema model.
func introspect(ctx context.Context, db *sql.DB) ([]schema.Table, error) {
	tables, err := fetchTables(ctx, db)
	if err != nil {
		return nil, err
	}

	result := make([]schema.Table, 0, len(tables))

	for _, table := range tables {
		relations, err := fetchRelations(ctx, db, table)
		if err != nil {
			return nil, err
		}

		fkCols := make(map[string]struct{}, len(relations))
		for _, r := range relations {
			fkCols[r.FromColumn] = struct{}{}
		}

		cols, err := fetchColumns(ctx, db, table, fkCols)
		if err != nil {
			return nil, err
		}

		result = append(result, schema.Table{
			Name:      table,
			Columns:   cols,
			Relations: relations,
		})
	}

	return result, nil
}

// fetchTables returns all user-defined table names from sqlite_master.
func fetchTables(ctx context.Context, db *sql.DB) ([]string, error) {
	const q = `
		SELECT name
		FROM sqlite_master
		WHERE type = 'table'
		  AND name NOT LIKE 'sqlite_%'
		ORDER BY name`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("sqlite: fetch tables: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("sqlite: scan table name: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// fetchColumns returns columns for a single table annotated with PK and FK metadata.
func fetchColumns(ctx context.Context, db *sql.DB, table string, fkCols map[string]struct{}) ([]schema.Column, error) {
	q := fmt.Sprintf(`PRAGMA table_info("%s")`, escapeIdentifier(table))

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("sqlite: fetch columns for %q: %w", table, err)
	}
	defer rows.Close()

	var cols []schema.Column
	for rows.Next() {
		var (
			cid       int
			name      string
			rawType   string
			notnull   int
			dfltValue sql.NullString
			pk        int
		)

		if err := rows.Scan(&cid, &name, &rawType, &notnull, &dfltValue, &pk); err != nil {
			return nil, fmt.Errorf("sqlite: scan column for %q: %w", table, err)
		}

		var defaultValue *string
		if dfltValue.Valid {
			v := dfltValue.String
			defaultValue = &v
		}

		_, isFk := fkCols[name]

		cols = append(cols, schema.Column{
			Name:         name,
			Type:         normalizeType(rawType),
			Nullable:     notnull == 0 && pk == 0,
			IsPrimaryKey: pk > 0,
			IsForeignKey: isFk,
			DefaultValue: defaultValue,
		})
	}

	return cols, rows.Err()
}

// fetchRelations returns all foreign-key relations for a table using PRAGMA foreign_key_list.
func fetchRelations(ctx context.Context, db *sql.DB, table string) ([]schema.Relation, error) {
	q := fmt.Sprintf(`PRAGMA foreign_key_list("%s")`, escapeIdentifier(table))

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("sqlite: fetch foreign keys for %q: %w", table, err)
	}
	defer rows.Close()

	var relations []schema.Relation
	for rows.Next() {
		var (
			id       int
			seq      int
			target   string
			fromCol  string
			toCol    string
			onUpdate string
			onDelete string
			match    string
		)

		if err := rows.Scan(&id, &seq, &target, &fromCol, &toCol, &onUpdate, &onDelete, &match); err != nil {
			return nil, fmt.Errorf("sqlite: scan foreign key for %q: %w", table, err)
		}

		relations = append(relations, schema.Relation{
			Name:       fmt.Sprintf("fk_%s_%s", table, fromCol),
			Type:       schema.OneToMany,
			FromTable:  table,
			FromColumn: fromCol,
			ToTable:    target,
			ToColumn:   toCol,
		})
	}

	return relations, rows.Err()
}

// normalizeType maps SQLite declared types and affinities to normalized schema.Column types:
// "string", "int", "float", "bool", "datetime", "json", "binary", "uuid", "unknown".
func normalizeType(raw string) string {
	u := strings.ToUpper(strings.TrimSpace(raw))

	// Remove parameters like (255)
	if idx := strings.Index(u, "("); idx != -1 {
		u = strings.TrimSpace(u[:idx])
	}

	if strings.Contains(u, "INT") {
		return "int"
	}
	if strings.Contains(u, "CHAR") || strings.Contains(u, "TEXT") || strings.Contains(u, "CLOB") {
		return "string"
	}
	if strings.Contains(u, "REAL") || strings.Contains(u, "FLOA") || strings.Contains(u, "DOUB") ||
		strings.Contains(u, "NUMERIC") || strings.Contains(u, "DECIMAL") {
		return "float"
	}
	if strings.Contains(u, "BOOL") {
		return "bool"
	}
	if strings.Contains(u, "DATE") || strings.Contains(u, "TIME") {
		return "datetime"
	}
	if strings.Contains(u, "JSON") {
		return "json"
	}
	if strings.Contains(u, "BLOB") {
		return "binary"
	}
	if strings.Contains(u, "UUID") {
		return "uuid"
	}
	if u == "" {
		return "string"
	}
	return "unknown"
}
