package mysql

import (
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
)

// formatMySQLValue normalizes scanned MySQL row values into clean JSON-serializable types.
// It handles MySQL specific types like BIT(1), BINARY(16) UUIDs, BLOBs, and ensures
// non-printable binary bytes are never dumped as corrupted ASCII/string representations.
func formatMySQLValue(val any, colType *sql.ColumnType) any {
	dbType := ""
	if colType != nil {
		dbType = colType.DatabaseTypeName()
	}
	return formatMySQLValueWithTypeName(val, dbType)
}

// formatMySQLValueWithTypeName formats MySQL values given the column database type name.
func formatMySQLValueWithTypeName(val any, typeName string) any {
	if val == nil {
		return nil
	}

	b, isBytes := val.([]byte)
	upperType := strings.ToUpper(strings.TrimSpace(typeName))

	if isBytes {
		switch upperType {
		case "BIT":
			if len(b) == 1 {
				return b[0] == 1
			}
			var n uint64
			for _, byteVal := range b {
				n = (n << 8) | uint64(byteVal)
			}
			return n

		case "BINARY", "VARBINARY", "BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB", "GEOMETRY":
			if len(b) == 16 {
				return formatUUID(b)
			}
			return fmt.Sprintf("0x%x", b)

		default:
			// For VARCHAR, TEXT, JSON, DECIMAL, etc.
			// Guard: If MySQL driver reports unexpected type or unknown, but data has non-printable binary bytes:
			if isBinaryBytes(b) {
				if len(b) == 16 {
					return formatUUID(b)
				}
				if len(b) == 1 && (b[0] == 0 || b[0] == 1) {
					return b[0] == 1
				}
				return fmt.Sprintf("0x%x", b)
			}
			return string(b)
		}
	}

	// Some drivers or configurations return int64 for BIT(1)
	if upperType == "BIT" {
		if n, ok := val.(int64); ok {
			return n == 1
		}
	}

	return val
}

// formatUUID formats 16 bytes into standard 8-4-4-4-12 hex UUID representation.
func formatUUID(b []byte) string {
	return fmt.Sprintf("%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
		b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15])
}

// isBinaryBytes returns true if the byte slice contains non-printable ASCII control characters.
func isBinaryBytes(b []byte) bool {
	for _, c := range b {
		if c < 0x09 || (c > 0x0D && c < 0x20) || c == 0x7F {
			return true
		}
	}
	return false
}

// normalizeMutationValue converts formatted UUID strings or hex strings back into raw byte slices
// when inserting/updating MySQL BINARY/VARBINARY columns.
func normalizeMutationValue(val any) any {
	if s, ok := val.(string); ok {
		trimmed := strings.TrimSpace(s)
		// Hex string: 0x...
		if strings.HasPrefix(strings.ToLower(trimmed), "0x") {
			if decoded, err := hex.DecodeString(trimmed[2:]); err == nil {
				return decoded
			}
		}
		// UUID string: 36 chars with 4 hyphens (8-4-4-4-12)
		if len(trimmed) == 36 && strings.Count(trimmed, "-") == 4 {
			cleanHex := strings.ReplaceAll(trimmed, "-", "")
			if decoded, err := hex.DecodeString(cleanHex); err == nil && len(decoded) == 16 {
				return decoded
			}
		}
	}
	return val
}
