package adapter_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"pebblebase/internal/adapter"
	sqliteadapter "pebblebase/internal/adapter/sqlite"

	_ "modernc.org/sqlite"
)

func TestSplitStatements(t *testing.T) {
	sqlScript := `
		-- Create users table
		CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			bio TEXT DEFAULT 'hello; world'
		);

		/* Multi-line comment;
		   still inside comment */
		ALTER TABLE users ADD COLUMN age INTEGER;

		-- Final statement without semicolon
		CREATE INDEX idx_users_name ON users(name)
	`

	stmts := adapter.SplitStatements(sqlScript)
	if len(stmts) != 3 {
		t.Fatalf("expected 3 statements, got %d: %#v", len(stmts), stmts)
	}

	plan, rollback := adapter.AnalyzeStatements(stmts)
	if len(plan) != 3 {
		t.Fatalf("expected 3 plan items, got %d: %#v", len(plan), plan)
	}

	if plan[0] != `Create table "users"` {
		t.Errorf("unexpected plan[0]: %s", plan[0])
	}
	if plan[1] != `Add column "age" (INTEGER) to table "users"` {
		t.Errorf("unexpected plan[1]: %s", plan[1])
	}
	if plan[2] != `Create index "idx_users_name" on table "users"` {
		t.Errorf("unexpected plan[2]: %s", plan[2])
	}

	// Rollback should be in reverse order (idx -> age -> users)
	expectedRollbackPrefix := `DROP INDEX IF EXISTS "idx_users_name";`
	if len(rollback) == 0 || rollback[:len(expectedRollbackPrefix)] != expectedRollbackPrefix {
		t.Errorf("unexpected rollback: %s", rollback)
	}
}

func TestSQLiteMigrationRunner(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test_migration.db")

	// Pre-create database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`CREATE TABLE initial_table (id INTEGER PRIMARY KEY);`)
	db.Close()
	if err != nil {
		t.Fatalf("create initial table: %v", err)
	}

	adap, err := sqliteadapter.New(ctx, dbPath)
	if err != nil {
		t.Fatalf("new sqlite adapter: %v", err)
	}
	defer adap.Close()

	runner, ok := any(adap).(adapter.MigrationRunner)
	if !ok {
		t.Fatalf("SQLiteAdapter does not implement MigrationRunner")
	}

	// 1. Dry Run test
	dryRunDDL := `
		CREATE TABLE products (id INTEGER PRIMARY KEY, title TEXT);
		ALTER TABLE products ADD COLUMN price REAL;
	`
	dryRes, err := runner.ExecuteMigration(ctx, dryRunDDL, true)
	if err != nil {
		t.Fatalf("dry-run failed: %v", err)
	}
	if !dryRes.Success {
		t.Fatalf("expected dry-run success, got: %s", dryRes.Error)
	}
	if len(dryRes.Plan) != 2 {
		t.Fatalf("expected 2 plan items, got: %v", dryRes.Plan)
	}

	// Verify products table DOES NOT exist after dry-run
	tables, err := adap.Introspect(ctx)
	if err != nil {
		t.Fatalf("introspect: %v", err)
	}
	for _, tbl := range tables {
		if tbl.Name == "products" {
			t.Fatalf("table 'products' should not exist after dry-run")
		}
	}

	// 2. Live Run test
	liveRes, err := runner.ExecuteMigration(ctx, dryRunDDL, false)
	if err != nil {
		t.Fatalf("live run failed: %v", err)
	}
	if !liveRes.Success {
		t.Fatalf("expected live run success, got: %s", liveRes.Error)
	}

	// Verify products table DOES exist now
	tables, err = adap.Introspect(ctx)
	if err != nil {
		t.Fatalf("introspect: %v", err)
	}
	foundProducts := false
	for _, tbl := range tables {
		if tbl.Name == "products" {
			foundProducts = true
			if len(tbl.Columns) != 3 {
				t.Errorf("expected 3 columns in 'products', got %d", len(tbl.Columns))
			}
		}
	}
	if !foundProducts {
		t.Fatalf("table 'products' was not created by live migration")
	}

	// 3. Rollback test
	if dryRes.RollbackSQL == "" {
		t.Fatalf("expected non-empty rollback SQL")
	}
	rollRes, err := runner.ExecuteMigration(ctx, dryRes.RollbackSQL, false)
	if err != nil {
		t.Fatalf("rollback failed: %v", err)
	}
	if !rollRes.Success {
		t.Fatalf("expected rollback success, got: %s", rollRes.Error)
	}

	// Verify products table was removed by rollback
	tables, err = adap.Introspect(ctx)
	if err != nil {
		t.Fatalf("introspect: %v", err)
	}
	for _, tbl := range tables {
		if tbl.Name == "products" {
			t.Fatalf("table 'products' should have been dropped by rollback")
		}
	}
}
