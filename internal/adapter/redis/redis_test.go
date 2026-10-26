package redis

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestParseRedisDSN_Standalone(t *testing.T) {
	dsn := "redis://alice:secret123@localhost:6379/3?pool_size=30"
	opts, db, err := parseRedisDSN(dsn)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if db != 3 {
		t.Errorf("expected db=3, got %d", db)
	}
	if opts.Username != "alice" {
		t.Errorf("expected user alice, got %s", opts.Username)
	}
	if opts.Password != "secret123" {
		t.Errorf("expected password secret123, got %s", opts.Password)
	}
	if len(opts.Addrs) != 1 || opts.Addrs[0] != "localhost:6379" {
		t.Errorf("expected addrs [localhost:6379], got %v", opts.Addrs)
	}
	if opts.PoolSize != 30 {
		t.Errorf("expected pool size 30, got %d", opts.PoolSize)
	}
	if opts.DialTimeout != 5*time.Second {
		t.Errorf("expected 5s dial timeout, got %v", opts.DialTimeout)
	}
}

func TestParseRedisDSN_TLS(t *testing.T) {
	dsn := "rediss://cache.prod.company.internal:6380/1?insecure=true"
	opts, db, err := parseRedisDSN(dsn)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if db != 1 {
		t.Errorf("expected db=1, got %d", db)
	}
	if opts.TLSConfig == nil {
		t.Fatal("expected TLSConfig to be initialized")
	}
	if !opts.TLSConfig.InsecureSkipVerify {
		t.Errorf("expected InsecureSkipVerify=true, got false")
	}
}

func TestParseRedisDSN_Sentinel(t *testing.T) {
	dsn := "redis-sentinel://sentinel1:26379,sentinel2:26379/mymaster/2"
	opts, db, err := parseRedisDSN(dsn)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if db != 2 {
		t.Errorf("expected db=2, got %d", db)
	}
	if opts.MasterName != "mymaster" {
		t.Errorf("expected master name 'mymaster', got %q", opts.MasterName)
	}
	if len(opts.Addrs) != 2 {
		t.Errorf("expected 2 sentinel addrs, got %d", len(opts.Addrs))
	}
}

func TestParseRedisDSN_Cluster(t *testing.T) {
	dsn := "redis-cluster://node1:7000,node2:7001,node3:7002/0"
	opts, _, err := parseRedisDSN(dsn)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(opts.Addrs) != 3 {
		t.Errorf("expected 3 cluster addrs, got %d", len(opts.Addrs))
	}
}

func TestParseRedisDSN_Errors(t *testing.T) {
	tests := []string{
		"",
		"   ",
	}
	for _, raw := range tests {
		_, _, err := parseRedisDSN(raw)
		if err == nil {
			t.Errorf("expected error for input %q, got nil", raw)
		}
	}
}

func TestParseCommandArgs(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
		hasError bool
	}{
		{
			input:    `GET user:100`,
			expected: []string{"GET", "user:100"},
		},
		{
			input:    `SET "user:100" "Hello World" EX 3600`,
			expected: []string{"SET", "user:100", "Hello World", "EX", "3600"},
		},
		{
			input:    `HSET 'profile:9' 'name' 'Jane Doe' 'title' 'Senior Architect'`,
			expected: []string{"HSET", "profile:9", "name", "Jane Doe", "title", "Senior Architect"},
		},
		{
			input:    `SET key "nested \"quote\" test"`,
			expected: []string{"SET", "key", `nested "quote" test`},
		},
		{
			input:    `SET key "unclosed quote`,
			hasError: true,
		},
	}

	for _, tt := range tests {
		args, err := parseCommandArgs(tt.input)
		if tt.hasError {
			if err == nil {
				t.Errorf("expected error for %q, got args: %v", tt.input, args)
			}
			continue
		}
		if err != nil {
			t.Errorf("unexpected error for %q: %v", tt.input, err)
			continue
		}
		if len(args) != len(tt.expected) {
			t.Errorf("expected %d args for %q, got %d: %v", len(tt.expected), tt.input, len(args), args)
			continue
		}
		for i := range args {
			if args[i] != tt.expected[i] {
				t.Errorf("arg %d mismatch for %q: expected %q, got %q", i, tt.input, tt.expected[i], args[i])
			}
		}
	}
}

func TestFormatRedisResult(t *testing.T) {
	// Test nil
	cols, rows, count := formatRedisResult("GET", nil)
	if cols[0] != "result" || rows[0]["result"] != "(nil)" || count != 0 {
		t.Errorf("unexpected nil formatting: %v, %v, %d", cols, rows, count)
	}

	// Test HGETALL pairs
	hgetAllSlice := []any{"name", "Alice", "role", "Lead"}
	cols, rows, count = formatRedisResult("HGETALL", hgetAllSlice)
	if len(cols) != 2 || cols[0] != "field" || cols[1] != "value" {
		t.Errorf("expected field, value columns for HGETALL, got %v", cols)
	}
	if count != 2 || len(rows) != 2 {
		t.Errorf("expected 2 field/value rows, got %d", count)
	}
	if rows[0]["field"] != "name" || rows[0]["value"] != "Alice" {
		t.Errorf("mismatch row 0: %v", rows[0])
	}

	// Test INFO string
	infoStr := "# Server\nredis_version:7.2.4\nos:Linux\n# Memory\nused_memory:1048576"
	cols, rows, count = formatRedisResult("INFO", infoStr)
	if len(cols) != 3 || cols[0] != "section" || cols[1] != "property" || cols[2] != "value" {
		t.Errorf("expected section, property, value columns for INFO, got %v", cols)
	}
	if count != 3 || len(rows) != 3 {
		t.Errorf("expected 3 rows for INFO, got %d", count)
	}
	if rows[0]["section"] != "Server" || rows[0]["property"] != "redis_version" || rows[0]["value"] != "7.2.4" {
		t.Errorf("mismatch row 0: %v", rows[0])
	}
}

func TestNew_ConnectionFailureTimeout(t *testing.T) {
	// Trying to connect to an unreachable port should fail fast within dial timeout without hanging
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	start := time.Now()
	_, err := New(ctx, "redis://127.0.0.1:59999/0")
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected connection error to unreachable host, got nil")
	}
	if !strings.Contains(err.Error(), "ping") && !strings.Contains(err.Error(), "dial") && !strings.Contains(err.Error(), "refused") && !strings.Contains(err.Error(), "context") {
		t.Errorf("expected ping or dial connection error, got: %v", err)
	}
	if elapsed > 6*time.Second {
		t.Errorf("connection attempt took too long: %v (expected <= 5s)", elapsed)
	}
}
