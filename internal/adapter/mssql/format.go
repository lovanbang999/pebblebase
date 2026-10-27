package mssql

import (
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	mssql "github.com/microsoft/go-mssqldb"
)

// formatMSSQLValue normalizes database/sql scan values into JSON-compatible values.
func formatMSSQLValue(v any, ct *sql.ColumnType) any {
	if v == nil {
		return nil
	}

	// Specialized MSSQL types
	switch val := v.(type) {
	case mssql.UniqueIdentifier:
		return val.String()
	case *mssql.UniqueIdentifier:
		if val == nil {
			return nil
		}
		return val.String()
	case mssql.DateTimeOffset:
		return time.Time(val).Format(time.RFC3339Nano)
	case *mssql.DateTimeOffset:
		if val == nil {
			return nil
		}
		return time.Time(*val).Format(time.RFC3339Nano)
	case time.Time:
		return val.Format(time.RFC3339Nano)
	case *time.Time:
		if val == nil {
			return nil
		}
		return val.Format(time.RFC3339Nano)
	case []byte:
		return formatBytes(val, ct)
	case bool:
		return val
	case int64, int32, int16, int8, int:
		if ct != nil && strings.EqualFold(ct.DatabaseTypeName(), "BIT") {
			return val != 0
		}
		return val
	case float64, float32:
		return val
	case string:
		return val
	default:
		// Check stringer
		if s, ok := v.(fmt.Stringer); ok {
			return s.String()
		}
		return fmt.Sprintf("%v", v)
	}
}

func formatBytes(b []byte, ct *sql.ColumnType) any {
	if b == nil {
		return nil
	}

	typeName := ""
	if ct != nil {
		typeName = strings.ToUpper(ct.DatabaseTypeName())
	}

	// If column is UNIQUEIDENTIFIER and was read as 16 raw bytes:
	if (typeName == "UNIQUEIDENTIFIER" || typeName == "UUID") && len(b) == 16 {
		var uid mssql.UniqueIdentifier
		copy(uid[:], b)
		return uid.String()
	}

	// Text/VarChar types stored as raw bytes
	if strings.Contains(typeName, "CHAR") || strings.Contains(typeName, "TEXT") {
		return string(b)
	}

	// Default to hex representation for binary/varbinary/image/timestamp
	return "0x" + hex.EncodeToString(b)
}
