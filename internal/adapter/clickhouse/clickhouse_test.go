package clickhouse

import (
	"context"
	"net"
	"os"
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

// TestClickHouse_LiveIntegration tests live connection, schema introspection,
// batch row insertion, and high-throughput analytical aggregate queries against ClickHouse.
func TestClickHouse_LiveIntegration(t *testing.T) {
	dsn := os.Getenv("PEBBLEBASE_TEST_CLICKHOUSE_DSN")
	if dsn == "" {
		t.Skip("PEBBLEBASE_TEST_CLICKHOUSE_DSN not set — skipping ClickHouse live integration test")
	}

	ctx := context.Background()
	a, err := New(ctx, dsn)
	if err != nil {
		t.Fatalf("ClickHouse New failed: %v", err)
	}
	defer a.Close()

	if err := a.Ping(ctx); err != nil {
		t.Fatalf("ClickHouse Ping failed: %v", err)
	}

	setupSQL := `
	CREATE TABLE IF NOT EXISTS test_clickhouse_analytics (
		event_id UInt64,
		user_id UInt64,
		action String,
		duration_ms Float64,
		event_date Date DEFAULT today(),
		created_at DateTime DEFAULT now()
	) ENGINE = MergeTree()
	ORDER BY (event_date, event_id);
	`
	if _, err := a.ExecuteRaw(ctx, setupSQL); err != nil {
		t.Fatalf("setup ClickHouse table failed: %v", err)
	}

	t.Cleanup(func() {
		_, _ = a.ExecuteRaw(context.Background(), "DROP TABLE IF EXISTS test_clickhouse_analytics;")
	})

	// 1. High-throughput bulk insert
	records := [][]any{
		{uint64(1), uint64(101), "click", 45.2},
		{uint64(2), uint64(101), "view", 120.0},
		{uint64(3), uint64(102), "click", 30.5},
		{uint64(4), uint64(103), "purchase", 540.8},
		{uint64(5), uint64(102), "view", 95.0},
	}
	_, err = a.BulkInsert(ctx, "test_clickhouse_analytics", []string{"event_id", "user_id", "action", "duration_ms"}, records)
	if err != nil {
		t.Fatalf("ClickHouse BulkInsert failed: %v", err)
	}

	// 2. High-throughput analytical aggregate query
	aggQuery := `
	SELECT action, count() AS total_events, sum(duration_ms) AS total_duration, avg(duration_ms) AS avg_duration
	FROM test_clickhouse_analytics
	GROUP BY action
	ORDER BY total_events DESC;
	`
	aggRes, err := a.ExecuteRaw(ctx, aggQuery)
	if err != nil {
		t.Fatalf("analytical aggregate query failed: %v", err)
	}

	if len(aggRes.Rows) == 0 {
		t.Fatal("expected aggregate results, got 0 rows")
	}

	// 3. Schema Introspect
	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("ClickHouse Introspect failed: %v", err)
	}
	found := false
	for _, tbl := range tables {
		if tbl.Name == "test_clickhouse_analytics" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected table test_clickhouse_analytics in Introspect results")
	}
}
