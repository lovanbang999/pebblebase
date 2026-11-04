package mysql_test

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"

	"pebblebase/internal/adapter"
	mysqladapter "pebblebase/internal/adapter/mysql"
)

// testDSN returns the MySQL test database DSN.
func testDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("PEBBLEBASE_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("PEBBLEBASE_TEST_MYSQL_DSN not set — skipping MySQL integration test")
		return ""
	}
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, dsn)
	if err != nil {
		t.Skipf("MySQL test DB not reachable (%v) — skipping integration test", err)
	}
	a.Close()
	return dsn
}

func TestPing(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	if err := a.Ping(ctx); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

func TestIntrospect(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect: %v", err)
	}

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
			t.Errorf("expected table %q not found in introspect output", name)
		}
	}
}

func TestIntrospect_ColumnTypes(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect: %v", err)
	}

	var usersTable *struct {
		cols map[string]string
		pks  map[string]bool
	}

	for _, tbl := range tables {
		if tbl.Name == "users" {
			cols := make(map[string]string)
			pks := make(map[string]bool)
			for _, c := range tbl.Columns {
				cols[c.Name] = c.Type
				if c.IsPrimaryKey {
					pks[c.Name] = true
				}
			}
			usersTable = &struct {
				cols map[string]string
				pks  map[string]bool
			}{cols: cols, pks: pks}
			break
		}
	}

	if usersTable == nil {
		t.Fatal("table 'users' not found")
	}

	if usersTable.cols["id"] != "int" {
		t.Errorf("expected users.id type 'int', got %q", usersTable.cols["id"])
	}
	if !usersTable.pks["id"] {
		t.Error("expected users.id to be primary key")
	}
	if usersTable.cols["name"] != "string" {
		t.Errorf("expected users.name type 'string', got %q", usersTable.cols["name"])
	}
	if usersTable.cols["email"] != "string" {
		t.Errorf("expected users.email type 'string', got %q", usersTable.cols["email"])
	}
	if usersTable.cols["created_at"] != "datetime" {
		t.Errorf("expected users.created_at type 'datetime', got %q", usersTable.cols["created_at"])
	}
}

func TestIntrospect_Relations(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect: %v", err)
	}

	foundPostUserRel := false
	for _, tbl := range tables {
		if tbl.Name == "posts" {
			for _, rel := range tbl.Relations {
				if rel.FromColumn == "user_id" && rel.ToTable == "users" && rel.ToColumn == "id" {
					foundPostUserRel = true
					break
				}
			}
		}
	}

	if !foundPostUserRel {
		t.Error("expected foreign-key relation posts.user_id -> users.id not found")
	}
}

func TestQuery_Pagination(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	// Page 1
	res1, err := a.Query(ctx, "users", adapter.QueryOptions{
		Limit:    2,
		Offset:   0,
		SortBy:   "id",
		SortDesc: false,
	})
	if err != nil {
		t.Fatalf("Query page 1: %v", err)
	}
	if len(res1.Rows) != 2 {
		t.Fatalf("expected 2 rows on page 1, got %d", len(res1.Rows))
	}
	if res1.TotalCount < 5 {
		t.Fatalf("expected total count >= 5, got %d", res1.TotalCount)
	}

	// Page 2
	res2, err := a.Query(ctx, "users", adapter.QueryOptions{
		Limit:    2,
		Offset:   2,
		SortBy:   "id",
		SortDesc: false,
	})
	if err != nil {
		t.Fatalf("Query page 2: %v", err)
	}
	if len(res2.Rows) != 2 {
		t.Fatalf("expected 2 rows on page 2, got %d", len(res2.Rows))
	}

	// Ensure different rows
	if res1.Rows[0]["id"] == res2.Rows[0]["id"] {
		t.Errorf("page 1 and page 2 returned the same first row: %v", res1.Rows[0]["id"])
	}
}

func TestQuery_Filter(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	res, err := a.Query(ctx, "users", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "email", Operator: "eq", Value: "alice.thomas31@pebblebase.dev"},
		},
	})
	if err != nil {
		t.Fatalf("Query with filter: %v", err)
	}
	if len(res.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(res.Rows))
	}
	if res.Rows[0]["name"] != "Alice Thomas" {
		t.Errorf("expected name 'Alice Thomas', got %v", res.Rows[0]["name"])
	}
}

func TestMutate_CRUD(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	testEmail := "mysql_test_user@example.com"

	// 1. Insert
	err = a.Mutate(ctx, "users", adapter.MutationOp{
		Type: "insert",
		Values: map[string]any{
			"name":  "MySQL Test",
			"email": testEmail,
		},
	})
	if err != nil {
		t.Fatalf("Mutate insert: %v", err)
	}

	// 2. Query
	res, err := a.Query(ctx, "users", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "email", Operator: "eq", Value: testEmail},
		},
	})
	if err != nil {
		t.Fatalf("Query after insert: %v", err)
	}
	if len(res.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(res.Rows))
	}
	if res.Rows[0]["name"] != "MySQL Test" {
		t.Errorf("expected name 'MySQL Test', got %v", res.Rows[0]["name"])
	}

	// 3. Update
	err = a.Mutate(ctx, "users", adapter.MutationOp{
		Type: "update",
		Where: map[string]any{
			"email": testEmail,
		},
		Values: map[string]any{
			"name": "MySQL Test Updated",
		},
	})
	if err != nil {
		t.Fatalf("Mutate update: %v", err)
	}

	// Verify update
	resUp, err := a.Query(ctx, "users", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "email", Operator: "eq", Value: testEmail},
		},
	})
	if err != nil {
		t.Fatalf("Query after update: %v", err)
	}
	if len(resUp.Rows) != 1 || resUp.Rows[0]["name"] != "MySQL Test Updated" {
		t.Errorf("expected updated name 'MySQL Test Updated', got %v", resUp.Rows[0]["name"])
	}

	// 4. Delete
	err = a.Mutate(ctx, "users", adapter.MutationOp{
		Type: "delete",
		Where: map[string]any{
			"email": testEmail,
		},
	})
	if err != nil {
		t.Fatalf("Mutate delete: %v", err)
	}

	// Verify delete
	resDel, err := a.Query(ctx, "users", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "email", Operator: "eq", Value: testEmail},
		},
	})
	if err != nil {
		t.Fatalf("Query after delete: %v", err)
	}
	if len(resDel.Rows) != 0 {
		t.Errorf("expected 0 rows after delete, got %d", len(resDel.Rows))
	}
}

// TestMySQL_ZeroDateAndUtf8mb4 verifies MySQL 8.0 utf8mb4 4-byte unicode encoding
// and zero-date handling ("0000-00-00 00:00:00").
func TestMySQL_ZeroDateAndUtf8mb4(t *testing.T) {
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, testDSN(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer a.Close()

	setupSQL := `
	DROP TABLE IF EXISTS test_mysql_encoding;
	CREATE TABLE test_mysql_encoding (
		id INT AUTO_INCREMENT PRIMARY KEY,
		content VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
		zero_dt VARCHAR(30) NULL,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
	`
	for _, stmt := range strings.Split(setupSQL, ";") {
		trimmed := strings.TrimSpace(stmt)
		if trimmed != "" {
			if _, err := a.ExecuteRaw(ctx, trimmed); err != nil {
				t.Fatalf("setup table failed: %v", err)
			}
		}
	}

	t.Cleanup(func() {
		_, _ = a.ExecuteRaw(context.Background(), "DROP TABLE IF EXISTS test_mysql_encoding;")
	})

	// 1. Validate 4-byte utf8mb4 emoji storage and retrieval
	const testEmojiStr = "🚀 Pebblebase Rocks! 🎉 世界 🌍 データベース"
	const testZeroDate = "0000-00-00 00:00:00"

	err = a.Mutate(ctx, "test_mysql_encoding", adapter.MutationOp{
		Type: "insert",
		Values: map[string]any{
			"content": testEmojiStr,
			"zero_dt": testZeroDate,
		},
	})
	if err != nil {
		t.Fatalf("failed to insert utf8mb4 row: %v", err)
	}

	// 2. Query back and verify fidelity
	res, err := a.Query(ctx, "test_mysql_encoding", adapter.QueryOptions{Limit: 1})
	if err != nil || len(res.Rows) == 0 {
		t.Fatalf("failed to query utf8mb4 row: %v", err)
	}

	gotContent := fmt.Sprintf("%v", res.Rows[0]["content"])
	if gotContent != testEmojiStr {
		t.Errorf("utf8mb4 content mismatch: got %q, want %q", gotContent, testEmojiStr)
	}

	gotZeroDate := fmt.Sprintf("%v", res.Rows[0]["zero_dt"])
	if gotZeroDate != testZeroDate {
		t.Errorf("zero date mismatch: got %q, want %q", gotZeroDate, testZeroDate)
	}
}
