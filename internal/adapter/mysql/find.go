package mysql

import (
	"context"
	"database/sql"
	"strings"

	"github.com/google/uuid"
	"pebblebase/internal/adapter"
)

// FindBinaryUUID handles the common BINARY(16) UUID representation using a
// parameterized equality lookup; the value is encoded in canonical byte order.
func (a *MySQLAdapter) FindBinaryUUID(ctx context.Context, table, column, value string, limit int) (adapter.ValueMatch, error) {
	if limit < 1 || limit > 4 {
		limit = 4
	}
	id, err := uuid.Parse(value)
	if err != nil {
		return adapter.ValueMatch{}, err
	}
	var swapped [16]byte
	copy(swapped[0:2], id[6:8])
	copy(swapped[2:4], id[4:6])
	copy(swapped[4:8], id[0:4])
	copy(swapped[8:], id[8:])
	countSQL, rowsSQL := buildFindBinaryUUIDSQL(table, column)
	args := []any{id[:], swapped[:]}
	var count int
	if err := a.db.QueryRowContext(ctx, countSQL, args...).Scan(&count); err != nil {
		return adapter.ValueMatch{}, err
	}
	rows, err := a.db.QueryContext(ctx, rowsSQL, append(args, limit)...)
	if err != nil {
		return adapter.ValueMatch{}, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return adapter.ValueMatch{}, err
	}
	types, _ := rows.ColumnTypes()
	result := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return adapter.ValueMatch{}, err
		}
		row := make(map[string]any, len(columns))
		for i, name := range columns {
			var colType *sql.ColumnType
			if i < len(types) {
				colType = types[i]
			}
			row[name] = formatMySQLValue(values[i], colType)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return adapter.ValueMatch{}, err
	}
	return adapter.ValueMatch{Table: table, Count: count, Column: column, Rows: result}, nil
}

func buildFindBinaryUUIDSQL(table, column string) (string, string) {
	from := "`" + escapeIdentifier(table) + "`"
	where := "`" + escapeIdentifier(column) + "` IN (?, ?)"
	return "SELECT COUNT(*) FROM " + from + " WHERE " + where, "SELECT * FROM " + from + " WHERE " + where + " LIMIT ?"
}

// FindContains guarantees case-insensitive literal substring matching even
// when the source column uses a case-sensitive MySQL collation.
func (a *MySQLAdapter) FindContains(ctx context.Context, table, column, value string, limit int) (adapter.ValueMatch, error) {
	if limit < 1 || limit > 4 {
		limit = 4
	}
	countSQL, rowsSQL, pattern := buildFindContainsSQL(table, column, value)
	var count int
	if err := a.db.QueryRowContext(ctx, countSQL, pattern).Scan(&count); err != nil {
		return adapter.ValueMatch{}, err
	}
	rows, err := a.db.QueryContext(ctx, rowsSQL, pattern, limit)
	if err != nil {
		return adapter.ValueMatch{}, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return adapter.ValueMatch{}, err
	}
	types, _ := rows.ColumnTypes()
	result := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return adapter.ValueMatch{}, err
		}
		row := make(map[string]any, len(columns))
		for i, name := range columns {
			var colType *sql.ColumnType
			if i < len(types) {
				colType = types[i]
			}
			row[name] = formatMySQLValue(values[i], colType)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return adapter.ValueMatch{}, err
	}
	return adapter.ValueMatch{Table: table, Count: count, Column: column, Rows: result}, nil
}

func buildFindContainsSQL(table, column, value string) (string, string, string) {
	from := "`" + escapeIdentifier(table) + "`"
	col := "LOWER(CAST(`" + escapeIdentifier(column) + "` AS CHAR))"
	pattern := "%" + strings.ToLower(strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(value)) + "%"
	where := col + " LIKE ? ESCAPE '!'"
	return "SELECT COUNT(*) FROM " + from + " WHERE " + where, "SELECT * FROM " + from + " WHERE " + where + " LIMIT ?", pattern
}
