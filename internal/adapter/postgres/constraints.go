package postgres

import (
	"context"
	"github.com/jackc/pgx/v5"
	"pebblebase/internal/adapter"
)

type constraintQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func (a *PostgresAdapter) GetSchemaConstraints(ctx context.Context) (map[string][]adapter.SchemaConstraint, error) {
	return readSchemaConstraints(ctx, a.pool)
}
func readSchemaConstraints(ctx context.Context, q constraintQuerier) (map[string][]adapter.SchemaConstraint, error) {
	rows, err := q.Query(ctx, `SELECT t.relname,c.conname,c.contype::text,
 ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord),
 COALESCE(rt.relname,''),COALESCE(rn.nspname,''),
 ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.ord),pg_get_constraintdef(c.oid,true)
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 LEFT JOIN pg_class rt ON rt.oid=c.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace
 WHERE n.nspname='public' AND c.contype IN ('p','f','u') ORDER BY t.relname,c.conname`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string][]adapter.SchemaConstraint{}
	for rows.Next() {
		var table, kind string
		var item adapter.SchemaConstraint
		if err := rows.Scan(&table, &item.Name, &kind, &item.Columns, &item.ReferenceTable, &item.ReferenceSchema, &item.ReferenceColumns, &item.Definition); err != nil {
			return nil, err
		}
		item.Kind = map[string]string{"p": "primary_key", "f": "foreign_key", "u": "unique"}[kind]
		result[table] = append(result[table], item)
	}
	return result, rows.Err()
}
