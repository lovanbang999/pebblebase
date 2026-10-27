package clickhouse

import (
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"reflect"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// formatClickHouseValue normalizes ClickHouse values (including Array, Map, Tuple, IP) into JSON-compatible primitives.
func formatClickHouseValue(v any, ct *sql.ColumnType) any {
	if v == nil {
		return nil
	}

	typeName := ""
	if ct != nil {
		typeName = strings.ToUpper(ct.DatabaseTypeName())
	}

	switch val := v.(type) {
	case time.Time:
		return val.Format(time.RFC3339Nano)
	case *time.Time:
		if val == nil {
			return nil
		}
		return val.Format(time.RFC3339Nano)
	case net.IP:
		return val.String()
	case *net.IP:
		if val == nil {
			return nil
		}
		return val.String()
	case decimal.Decimal:
		f, _ := val.Float64()
		return f
	case *decimal.Decimal:
		if val == nil {
			return nil
		}
		f, _ := val.Float64()
		return f
	case []byte:
		return formatByteSlice(val, typeName)
	case bool, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, string:
		return val
	default:
		// Handle complex slices and maps (Array, Map, Tuple)
		rv := reflect.ValueOf(v)
		if rv.Kind() == reflect.Ptr {
			if rv.IsNil() {
				return nil
			}
			rv = rv.Elem()
		}

		switch rv.Kind() {
		case reflect.Slice, reflect.Array, reflect.Map, reflect.Struct:
			b, err := json.Marshal(v)
			if err == nil {
				return string(b)
			}
		}

		if s, ok := v.(fmt.Stringer); ok {
			return s.String()
		}
		return fmt.Sprintf("%v", v)
	}
}

func formatByteSlice(b []byte, typeName string) any {
	if b == nil {
		return nil
	}

	// UUID in ClickHouse
	if (typeName == "UUID" || strings.Contains(typeName, "UUID")) && len(b) == 16 {
		return fmt.Sprintf("%08x-%04x-%04x-%04x-%12x",
			b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
	}

	// Text/String/FixedString types stored as raw bytes
	if strings.Contains(typeName, "STRING") || strings.Contains(typeName, "TEXT") {
		return string(b)
	}

	// If valid UTF-8 string, return as string
	if isPrintableUTF8(b) {
		return string(b)
	}

	return "0x" + hex.EncodeToString(b)
}

func isPrintableUTF8(b []byte) bool {
	if len(b) == 0 {
		return true
	}
	for _, c := range b {
		if c < 32 && c != '\t' && c != '\n' && c != '\r' {
			return false
		}
	}
	return true
}
