package clickhouse

import (
	"net"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"pebblebase/internal/adapter"
)

func TestEscapeIdentifier(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"events", "`events`"},
		{"`events`", "`events`"},
		{"default.events", "`default`.`events`"},
		{"`default`.`events`", "`default`.`events`"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := escapeIdentifier(tt.input)
			if got != tt.expected {
				t.Errorf("escapeIdentifier(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestNormalizeType(t *testing.T) {
	tests := []struct {
		raw      string
		expected string
	}{
		{"Int32", "int"},
		{"UInt64", "int"},
		{"Float64", "float"},
		{"Decimal(18, 4)", "float"},
		{"Decimal64(4)", "float"},
		{"Bool", "bool"},
		{"Date", "datetime"},
		{"Date32", "datetime"},
		{"DateTime", "datetime"},
		{"DateTime64(3, 'UTC')", "datetime"},
		{"String", "string"},
		{"FixedString(16)", "string"},
		{"LowCardinality(String)", "string"},
		{"Nullable(String)", "string"},
		{"Nullable(Int64)", "int"},
		{"UUID", "uuid"},
		{"IPv4", "string"},
		{"IPv6", "string"},
		{"Array(String)", "json"},
		{"Array(UInt32)", "json"},
		{"Map(String, UInt64)", "json"},
		{"Tuple(String, Int32)", "json"},
		{"Nested(id UInt32, name String)", "json"},
		{"JSON", "json"},
	}

	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got := normalizeType(tt.raw)
			if got != tt.expected {
				t.Errorf("normalizeType(%q) = %q, want %q", tt.raw, got, tt.expected)
			}
		})
	}
}

func TestBuildWhere(t *testing.T) {
	filters := []adapter.Filter{
		{Column: "age", Operator: "gte", Value: 21},
		{Column: "action", Operator: "contains", Value: "click"},
		{Column: "status", Operator: "in", Value: []any{"success", "pending"}},
	}

	where, args := buildWhere(filters)
	expectedWhere := "WHERE `age` >= ? AND `action` LIKE ? AND `status` IN (?, ?)"
	if where != expectedWhere {
		t.Errorf("buildWhere() = %q, want %q", where, expectedWhere)
	}

	expectedArgs := []any{21, "%click%", "success", "pending"}
	if !reflect.DeepEqual(args, expectedArgs) {
		t.Errorf("buildWhere() args = %v, want %v", args, expectedArgs)
	}
}

func TestBuildSelect_Pagination(t *testing.T) {
	opts := adapter.QueryOptions{
		SortBy:   "timestamp",
		SortDesc: true,
		Limit:    100,
		Offset:   200,
	}

	sql, _ := buildSelect("analytics", "WHERE `status` = ?", []any{"ok"}, opts)
	expected := "SELECT * FROM `analytics` WHERE `status` = ? ORDER BY `timestamp` DESC LIMIT 100 OFFSET 200"
	if sql != expected {
		t.Errorf("buildSelect() = %q, want %q", sql, expected)
	}
}

func TestFormatClickHouseValue(t *testing.T) {
	// 1. Time
	now := time.Date(2026, 10, 27, 10, 30, 0, 0, time.UTC)
	formattedTime := formatClickHouseValue(now, nil)
	if formattedTime != now.Format(time.RFC3339Nano) {
		t.Errorf("expected RFC3339Nano time, got %v", formattedTime)
	}

	// 2. IP address
	ip := net.ParseIP("192.168.1.100")
	formattedIP := formatClickHouseValue(ip, nil)
	if formattedIP != "192.168.1.100" {
		t.Errorf("expected 192.168.1.100, got %v", formattedIP)
	}

	// 3. Decimal
	dec, _ := decimal.NewFromString("123.456")
	formattedDec := formatClickHouseValue(dec, nil)
	if formattedDec != 123.456 {
		t.Errorf("expected 123.456, got %v", formattedDec)
	}

	// 4. Complex slice (Array)
	slice := []string{"apple", "banana", "cherry"}
	formattedSlice := formatClickHouseValue(slice, nil)
	if formattedSlice != `["apple","banana","cherry"]` {
		t.Errorf("expected JSON array string, got %v", formattedSlice)
	}

	// 5. Complex map
	m := map[string]int{"requests": 42}
	formattedMap := formatClickHouseValue(m, nil)
	if formattedMap != `{"requests":42}` {
		t.Errorf("expected JSON object string, got %v", formattedMap)
	}

	// 6. nil
	if formatClickHouseValue(nil, nil) != nil {
		t.Errorf("expected nil for nil value")
	}
}

func TestIsMutationSQL(t *testing.T) {
	mutations := []string{
		"INSERT INTO events VALUES (1, 'click')",
		"ALTER TABLE events UPDATE count = count + 1 WHERE id = 1",
		"ALTER TABLE events DELETE WHERE id = 1",
		"CREATE TABLE events (id UInt64) ENGINE = MergeTree() ORDER BY id",
		"DROP TABLE events",
		"TRUNCATE TABLE events",
		"OPTIMIZE TABLE events FINAL",
	}

	for _, q := range mutations {
		if !isMutationSQL(strings.ToUpper(q)) {
			t.Errorf("expected isMutationSQL(%q) = true", q)
		}
	}

	queries := []string{
		"SELECT * FROM events",
		"SHOW TABLES",
		"DESCRIBE events",
		"EXPLAIN SELECT * FROM events",
		"WITH 1 AS x SELECT x",
	}

	for _, q := range queries {
		if isMutationSQL(strings.ToUpper(q)) {
			t.Errorf("expected isMutationSQL(%q) = false", q)
		}
	}
}
