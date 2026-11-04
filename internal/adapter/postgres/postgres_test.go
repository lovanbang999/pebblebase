package postgres_test

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	pgadapter "pebblebase/internal/adapter/postgres"
)

// testDSN returns the test database DSN from the environment.
// Tests are skipped if PEBBLEBASE_TEST_DSN is not set.
//
// Example: PEBBLEBASE_TEST_DSN="postgres://pebble:pebble@localhost:5432/pebble_test"
func testDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("PEBBLEBASE_TEST_DSN")
	if dsn == "" {
		t.Skip("PEBBLEBASE_TEST_DSN not set — skipping integration test")
	}
	return dsn
}

func TestPing(t *testing.T) {
	ctx := context.Background()
	a, err := pgadapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { a.Close() })

	if err := a.Ping(ctx); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

func TestIntrospect(t *testing.T) {
	ctx := context.Background()
	a, err := pgadapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { a.Close() })

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect: %v", err)
	}

	// The test DB seed (testdata/seed.sql) creates: users, posts, comments.
	wantTables := map[string]bool{
		"users":    false,
		"posts":    false,
		"comments": false,
	}
	for _, tbl := range tables {
		if _, ok := wantTables[tbl.Name]; ok {
			wantTables[tbl.Name] = true
		}
	}
	for name, found := range wantTables {
		if !found {
			t.Errorf("Introspect: expected table %q not found", name)
		}
	}
}

func TestIntrospect_ColumnTypes(t *testing.T) {
	ctx := context.Background()
	a, err := pgadapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { a.Close() })

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect: %v", err)
	}

	// Find the "users" table and verify column normalization.
	cases := []struct {
		colName  string
		wantType string
		wantPK   bool
	}{
		{"id", "int", true},
		{"name", "string", false},
		{"email", "string", false},
		{"created_at", "datetime", false},
	}

	var usersTable *struct {
		cols map[string]struct {
			typ string
			pk  bool
		}
	}
	for _, tbl := range tables {
		if tbl.Name == "users" {
			m := make(map[string]struct {
				typ string
				pk  bool
			})
			for _, c := range tbl.Columns {
				m[c.Name] = struct {
					typ string
					pk  bool
				}{c.Type, c.IsPrimaryKey}
			}
			usersTable = &struct {
				cols map[string]struct {
					typ string
					pk  bool
				}
			}{m}
			break
		}
	}
	if usersTable == nil {
		t.Fatal("Introspect: table 'users' not found")
	}

	for _, tc := range cases {
		t.Run(tc.colName, func(t *testing.T) {
			got, ok := usersTable.cols[tc.colName]
			if !ok {
				t.Fatalf("column %q not found in users", tc.colName)
			}
			if got.typ != tc.wantType {
				t.Errorf("column %q type: got %q, want %q", tc.colName, got.typ, tc.wantType)
			}
			if got.pk != tc.wantPK {
				t.Errorf("column %q IsPrimaryKey: got %v, want %v", tc.colName, got.pk, tc.wantPK)
			}
		})
	}
}

func TestIntrospect_Relations(t *testing.T) {
	ctx := context.Background()
	a, err := pgadapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { a.Close() })

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect: %v", err)
	}

	// posts.user_id → users.id must be detected as a relation on the posts table.
	for _, tbl := range tables {
		if tbl.Name != "posts" {
			continue
		}
		for _, rel := range tbl.Relations {
			if rel.FromColumn == "user_id" && rel.ToTable == "users" {
				return // found
			}
		}
		t.Errorf("Introspect: expected relation posts.user_id → users.id not found; got %+v", tbl.Relations)
		return
	}
	t.Error("Introspect: table 'posts' not found")
}

func TestQuery_Pagination(t *testing.T) {
	ctx := context.Background()
	a, err := pgadapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { a.Close() })

	cases := []struct {
		name       string
		limit      int
		offset     int
		wantRows   int  // max rows in result
		wantGtZero bool // TotalCount > 0
	}{
		{"first page", 2, 0, 2, true},
		{"second page", 2, 2, 2, true},
		{"all", 0, 0, 100, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := a.Query(ctx, "users", adapter_QueryOptions(tc.limit, tc.offset))
			if err != nil {
				t.Fatalf("Query: %v", err)
			}
			if tc.wantGtZero && res.TotalCount == 0 {
				t.Error("Query: TotalCount should be > 0")
			}
			if tc.limit > 0 && len(res.Rows) > tc.wantRows {
				t.Errorf("Query: got %d rows, want at most %d", len(res.Rows), tc.wantRows)
			}
		})
	}
}

func TestQuery_Filter(t *testing.T) {
	ctx := context.Background()
	a, err := pgadapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { a.Close() })

	// Seed has a user with name "Alice Thomas".
	res, err := a.Query(ctx, "users", adapter_QueryOptions_filter("name", "eq", "Alice Thomas"))
	if err != nil {
		t.Fatalf("Query with filter: %v", err)
	}
	if len(res.Rows) == 0 {
		t.Error("Query: expected at least 1 row for filter name=Alice Thomas")
	}
	for _, row := range res.Rows {
		if row["name"] != "Alice Thomas" {
			t.Errorf("Query: unexpected row %v", row)
		}
	}
}

// TestPostgres_AdvancedTypesAndTriggers verifies PostgreSQL 16 advanced data types:
// JSONB, ARRAY, UUID, and execution of dollar-quoted trigger functions.
func TestPostgres_AdvancedTypesAndTriggers(t *testing.T) {
	ctx := context.Background()
	a, err := pgadapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { a.Close() })

	setupDDL := `
	CREATE EXTENSION IF NOT EXISTS "pgcrypto";

	DROP TABLE IF EXISTS test_pg_advanced CASCADE;
	DROP FUNCTION IF EXISTS trg_func_set_updated_at() CASCADE;

	CREATE TABLE test_pg_advanced (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		meta JSONB NOT NULL,
		tags TEXT[] NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE OR REPLACE FUNCTION trg_func_set_updated_at()
	RETURNS TRIGGER AS $$
	BEGIN
		NEW.updated_at = NOW();
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;

	CREATE TRIGGER trg_test_pg_advanced_updated
	BEFORE UPDATE ON test_pg_advanced
	FOR EACH ROW
	EXECUTE FUNCTION trg_func_set_updated_at();
	`

	if _, err := a.ExecuteRaw(ctx, setupDDL); err != nil {
		t.Fatalf("setup DDL failed: %v", err)
	}

	t.Cleanup(func() {
		_, _ = a.ExecuteRaw(context.Background(), `
			DROP TABLE IF EXISTS test_pg_advanced CASCADE;
			DROP FUNCTION IF EXISTS trg_func_set_updated_at() CASCADE;
		`)
	})

	// 1. Validate UUID, JSONB, and ARRAY insertion & query
	insertSQL := `
	INSERT INTO test_pg_advanced (meta, tags)
	VALUES ('{"tier": "enterprise", "features": ["sso", "audit"]}'::jsonb, ARRAY['go', 'postgres', 'docker'])
	RETURNING id, meta, tags, updated_at;
	`
	insertRes, err := a.ExecuteRaw(ctx, insertSQL)
	if err != nil {
		t.Fatalf("insert with JSONB and ARRAY failed: %v", err)
	}
	if len(insertRes.Rows) != 1 {
		t.Fatalf("expected 1 inserted row, got %d", len(insertRes.Rows))
	}

	row := insertRes.Rows[0]
	uuidVal := fmt.Sprintf("%v", row["id"])
	if len(uuidVal) < 32 || !strings.Contains(uuidVal, "-") {
		t.Errorf("expected valid UUID, got %s", uuidVal)
	}

	metaVal := fmt.Sprintf("%v", row["meta"])
	if !strings.Contains(metaVal, "enterprise") || !strings.Contains(metaVal, "sso") {
		t.Errorf("expected JSONB meta to contain 'enterprise' and 'sso', got %s", metaVal)
	}

	tagsVal := fmt.Sprintf("%v", row["tags"])
	if !strings.Contains(tagsVal, "postgres") || !strings.Contains(tagsVal, "docker") {
		t.Errorf("expected ARRAY tags to contain 'postgres' and 'docker', got %s", tagsVal)
	}

	initialUpdatedAt := fmt.Sprintf("%v", row["updated_at"])

	// 2. Validate Dollar-quoted trigger execution on UPDATE
	time.Sleep(50 * time.Millisecond) // ensure time step for trigger
	updateSQL := fmt.Sprintf(`
	UPDATE test_pg_advanced
	SET meta = '{"tier": "enterprise_plus", "features": ["sso", "audit", "rbac"]}'::jsonb
	WHERE id = '%s'
	RETURNING updated_at;
	`, uuidVal)

	updateRes, err := a.ExecuteRaw(ctx, updateSQL)
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if len(updateRes.Rows) != 1 {
		t.Fatalf("expected 1 row updated, got %d", len(updateRes.Rows))
	}

	newUpdatedAt := fmt.Sprintf("%v", updateRes.Rows[0]["updated_at"])
	if newUpdatedAt == initialUpdatedAt {
		t.Errorf("dollar-quoted trigger did not update timestamp: initial=%s, new=%s",
			initialUpdatedAt, newUpdatedAt)
	}
}
