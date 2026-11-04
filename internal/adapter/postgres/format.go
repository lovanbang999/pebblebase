package postgres

import (
	"fmt"
)

// formatPostgresValue normalizes scanned PostgreSQL row values into clean,
// JSON-serializable types. In particular, it transforms [16]byte pgx UUIDs
// into canonical lowercase hyphenated UUID strings (e.g. 123e4567-e89b-12d3-a456-426614174000).
func formatPostgresValue(val any) any {
	if val == nil {
		return nil
	}
	switch v := val.(type) {
	case [16]byte:
		return fmt.Sprintf("%x-%x-%x-%x-%x", v[0:4], v[4:6], v[6:8], v[8:10], v[10:16])
	}
	return val
}
