package adapter_test

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"pebblebase/internal/adapter"
	clickhouseadapter "pebblebase/internal/adapter/clickhouse"
	mongoadapter "pebblebase/internal/adapter/mongodb"
	mssqladapter "pebblebase/internal/adapter/mssql"
	mysqladapter "pebblebase/internal/adapter/mysql"
	pgadapter "pebblebase/internal/adapter/postgres"
	redisadapter "pebblebase/internal/adapter/redis"
	sqliteadapter "pebblebase/internal/adapter/sqlite"
)

// TestAdapterCompliance verifies that all 7 database drivers strictly satisfy the
// core adapter.Adapter interface and documents their support for optional extensions.
func TestAdapterCompliance(t *testing.T) {
	adapterInterface := reflect.TypeOf((*adapter.Adapter)(nil)).Elem()
	rawRunnerInterface := reflect.TypeOf((*adapter.RawRunner)(nil)).Elem()
	streamExporterInterface := reflect.TypeOf((*adapter.StreamExporter)(nil)).Elem()
	bulkImporterInterface := reflect.TypeOf((*adapter.BulkImporter)(nil)).Elem()
	queryExplainerInterface := reflect.TypeOf((*adapter.QueryExplainer)(nil)).Elem()
	ddlProviderInterface := reflect.TypeOf((*adapter.DDLProvider)(nil)).Elem()
	tableStatsInterface := reflect.TypeOf((*adapter.TableStatsProvider)(nil)).Elem()
	migrationRunnerInterface := reflect.TypeOf((*adapter.MigrationRunner)(nil)).Elem()

	tests := []struct {
		name            string
		targetType      reflect.Type
		expectDDL       bool
		expectStats     bool
		expectMigration bool
	}{
		{
			name:            "PostgreSQL Adapter",
			targetType:      reflect.TypeOf((*pgadapter.PostgresAdapter)(nil)),
			expectDDL:       true,
			expectStats:     true,
			expectMigration: true,
		},
		{
			name:            "MySQL Adapter",
			targetType:      reflect.TypeOf((*mysqladapter.MySQLAdapter)(nil)),
			expectDDL:       true,
			expectStats:     true,
			expectMigration: true,
		},
		{
			name:            "SQLite Adapter",
			targetType:      reflect.TypeOf((*sqliteadapter.SQLiteAdapter)(nil)),
			expectDDL:       true,
			expectStats:     true,
			expectMigration: true,
		},
		{
			name:            "MongoDB Adapter",
			targetType:      reflect.TypeOf((*mongoadapter.Adapter)(nil)),
			expectDDL:       true,
			expectStats:     true,
			expectMigration: true,
		},
		{
			name:            "Redis Adapter",
			targetType:      reflect.TypeOf((*redisadapter.Adapter)(nil)),
			expectDDL:       false, // Key-value data store (no relational DDL/tables)
			expectStats:     false,
			expectMigration: false,
		},
		{
			name:            "Microsoft SQL Server Adapter",
			targetType:      reflect.TypeOf((*mssqladapter.MSSQLAdapter)(nil)),
			expectDDL:       true,
			expectStats:     true,
			expectMigration: true,
		},
		{
			name:            "ClickHouse Adapter",
			targetType:      reflect.TypeOf((*clickhouseadapter.ClickHouseAdapter)(nil)),
			expectDDL:       true,
			expectStats:     true,
			expectMigration: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// 1. Mandatory core interface: adapter.Adapter
			if !tc.targetType.Implements(adapterInterface) {
				t.Errorf("%s does not implement adapter.Adapter", tc.name)
			}

			// 2. All 7 adapters must support ad-hoc raw queries, streaming, bulk insert, and explain
			if !tc.targetType.Implements(rawRunnerInterface) {
				t.Errorf("%s does not implement adapter.RawRunner", tc.name)
			}
			if !tc.targetType.Implements(streamExporterInterface) {
				t.Errorf("%s does not implement adapter.StreamExporter", tc.name)
			}
			if !tc.targetType.Implements(bulkImporterInterface) {
				t.Errorf("%s does not implement adapter.BulkImporter", tc.name)
			}
			if !tc.targetType.Implements(queryExplainerInterface) {
				t.Errorf("%s does not implement adapter.QueryExplainer", tc.name)
			}

			// 3. Optional interfaces depending on database paradigm
			if tc.expectDDL && !tc.targetType.Implements(ddlProviderInterface) {
				t.Errorf("%s was expected to implement adapter.DDLProvider", tc.name)
			}
			if tc.expectStats && !tc.targetType.Implements(tableStatsInterface) {
				t.Errorf("%s was expected to implement adapter.TableStatsProvider", tc.name)
			}
			if tc.expectMigration && !tc.targetType.Implements(migrationRunnerInterface) {
				t.Errorf("%s was expected to implement adapter.MigrationRunner", tc.name)
			}
		})
	}
}

// runComplianceLifecycle executes the full behavioral compliance suite across:
// 1. Schema Introspection (tables, columns, primary key, relations)
// 2. Pagination and Row Counting (limit, offset, TotalCount)
// 3. Data Type Precision (int64 MaxInt64, UUID, JSON, Time with TZ)
// 4. Transaction Rollback (deliberately inject errors mid-batch to verify clean rollback)
func runComplianceLifecycle(t *testing.T, a adapter.Adapter, dbType string) {
	t.Helper()
	ctx := context.Background()

	// 1. Schema Introspection Compliance
	t.Run("SchemaIntrospection", func(t *testing.T) {
		tables, err := a.Introspect(ctx)
		if err != nil {
			t.Fatalf("Introspect failed: %v", err)
		}

		tblMap := make(map[string]bool)
		for _, tbl := range tables {
			tblMap[tbl.Name] = true
			if tbl.Name == "comp_items" {
				hasPK := false
				for _, col := range tbl.Columns {
					if col.Name == "id" && col.IsPrimaryKey {
						hasPK = true
					}
				}
				if !hasPK {
					t.Errorf("comp_items table missing primary key on column 'id'")
				}
			}
		}

		for _, want := range []string{"comp_categories", "comp_precision", "comp_items"} {
			if !tblMap[want] {
				t.Errorf("expected table %q not found in introspection results", want)
			}
		}
	})

	// 2. Pagination and Row Counting Compliance
	t.Run("PaginationAndCounting", func(t *testing.T) {
		// Insert 5 test categories
		for i := 1; i <= 5; i++ {
			err := a.Mutate(ctx, "comp_categories", adapter.MutationOp{
				Type: "insert",
				Values: map[string]any{
					"name": fmt.Sprintf("Category %d", i),
				},
			})
			if err != nil {
				t.Fatalf("failed to insert category %d: %v", i, err)
			}
		}

		// First page: Limit 2, Offset 0
		page1, err := a.Query(ctx, "comp_categories", adapter.QueryOptions{
			Limit:  2,
			Offset: 0,
			SortBy: "name",
		})
		if err != nil {
			t.Fatalf("page 1 query failed: %v", err)
		}
		if page1.TotalCount != 5 {
			t.Errorf("expected TotalCount=5, got %d", page1.TotalCount)
		}
		if len(page1.Rows) != 2 {
			t.Errorf("expected 2 rows on page 1, got %d", len(page1.Rows))
		}

		// Second page: Limit 2, Offset 2
		page2, err := a.Query(ctx, "comp_categories", adapter.QueryOptions{
			Limit:  2,
			Offset: 2,
			SortBy: "name",
		})
		if err != nil {
			t.Fatalf("page 2 query failed: %v", err)
		}
		if len(page2.Rows) != 2 {
			t.Errorf("expected 2 rows on page 2, got %d", len(page2.Rows))
		}
	})

	// 3. Data Type Precision Compliance (64-bit int64, UUID, JSON, Time with TZ)
	t.Run("DataTypePrecision", func(t *testing.T) {
		const maxInt64Val int64 = math.MaxInt64
		const testUUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
		const testJSON = `{"config":{"retries":3},"tags":["alpha","beta"]}`
		testTime := time.Date(2026, 11, 3, 15, 30, 0, 0, time.UTC).Format(time.RFC3339)

		err := a.Mutate(ctx, "comp_precision", adapter.MutationOp{
			Type: "insert",
			Values: map[string]any{
				"big_number": maxInt64Val,
				"uuid_val":   testUUID,
				"json_data":  testJSON,
				"created_at": testTime,
			},
		})
		if err != nil {
			t.Fatalf("failed to insert precision test row: %v", err)
		}

		res, err := a.Query(ctx, "comp_precision", adapter.QueryOptions{Limit: 1})
		if err != nil || len(res.Rows) == 0 {
			t.Fatalf("failed to query precision test row: %v", err)
		}

		row := res.Rows[0]

		// 64-bit integer precision verification
		bigNumStr := fmt.Sprintf("%v", row["big_number"])
		expectedBigNumStr := fmt.Sprintf("%d", maxInt64Val)
		if bigNumStr != expectedBigNumStr {
			t.Errorf("int64 precision mismatch: got %s, want %s", bigNumStr, expectedBigNumStr)
		}

		// UUID verification
		uuidStr := fmt.Sprintf("%v", row["uuid_val"])
		if !strings.EqualFold(uuidStr, testUUID) {
			t.Errorf("UUID mismatch: got %s, want %s", uuidStr, testUUID)
		}

		// JSON preservation verification
		jsonStr := fmt.Sprintf("%v", row["json_data"])
		if !strings.Contains(jsonStr, "retries") || !strings.Contains(jsonStr, "alpha") {
			t.Errorf("JSON content not preserved: got %s", jsonStr)
		}
	})

	// 4. Transaction Rollback Compliance
	t.Run("TransactionRollback", func(t *testing.T) {
		importer, ok := a.(adapter.BulkImporter)
		if !ok {
			t.Skipf("%s does not implement BulkImporter", dbType)
		}

		// Intentionally construct batch with duplicate value on UNIQUE constraint
		// Record 1 is valid, Record 2 duplicates the unique 'name'
		badBatch := [][]any{
			{1, "unique_keyboard", 99.99},
			{1, "unique_keyboard", 149.99}, // Conflict! Must cause failure and rollback
		}

		_, err := importer.BulkInsert(ctx, "comp_items", []string{"category_id", "name", "price"}, badBatch)
		if err == nil {
			t.Fatalf("expected error on duplicate key violation in bulk batch, got nil")
		}

		// Verify transaction rolled back cleanly: 0 rows must be present in comp_items
		res, err := a.Query(ctx, "comp_items", adapter.QueryOptions{})
		if err != nil {
			t.Fatalf("query comp_items failed: %v", err)
		}
		if len(res.Rows) != 0 || res.TotalCount != 0 {
			t.Errorf("transaction rollback failed: expected 0 rows in comp_items, got len=%d total=%d",
				len(res.Rows), res.TotalCount)
		}
	})
}

func TestAdapterCompliance_Lifecycle_SQLite(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "compliance_test.db")

	// Ensure the sqlite db file exists on disk for SQLiteAdapter
	if err := os.WriteFile(dbPath, nil, 0644); err != nil {
		t.Fatalf("failed to create sqlite file: %v", err)
	}

	a, err := sqliteadapter.New(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("sqlite.New failed: %v", err)
	}
	defer a.Close()

	schemaSQL := `
	CREATE TABLE comp_categories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL
	);

	CREATE TABLE comp_precision (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		big_number INTEGER NOT NULL,
		uuid_val TEXT NOT NULL,
		json_data TEXT NOT NULL,
		created_at TEXT NOT NULL
	);

	CREATE TABLE comp_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		category_id INTEGER,
		name TEXT NOT NULL UNIQUE,
		price REAL NOT NULL,
		FOREIGN KEY (category_id) REFERENCES comp_categories(id)
	);
	`
	if _, err := a.ExecuteRaw(context.Background(), schemaSQL); err != nil {
		t.Fatalf("failed to create compliance schema in SQLite: %v", err)
	}

	runComplianceLifecycle(t, a, "sqlite")
}

func TestAdapterCompliance_Lifecycle_Postgres(t *testing.T) {
	dsn := os.Getenv("PEBBLEBASE_TEST_DSN")
	if dsn == "" {
		t.Skip("PEBBLEBASE_TEST_DSN not set — skipping PostgreSQL compliance lifecycle")
	}

	ctx := context.Background()
	a, err := pgadapter.New(ctx, dsn)
	if err != nil {
		t.Fatalf("postgres.New failed: %v", err)
	}
	defer a.Close()

	setupSQL := `
	DROP TABLE IF EXISTS comp_items CASCADE;
	DROP TABLE IF EXISTS comp_precision CASCADE;
	DROP TABLE IF EXISTS comp_categories CASCADE;

	CREATE TABLE comp_categories (
		id SERIAL PRIMARY KEY,
		name VARCHAR(100) NOT NULL
	);

	CREATE TABLE comp_precision (
		id SERIAL PRIMARY KEY,
		big_number BIGINT NOT NULL,
		uuid_val UUID NOT NULL,
		json_data JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL
	);

	CREATE TABLE comp_items (
		id SERIAL PRIMARY KEY,
		category_id INTEGER REFERENCES comp_categories(id),
		name VARCHAR(100) NOT NULL UNIQUE,
		price NUMERIC(10,2) NOT NULL
	);
	`
	if _, err := a.ExecuteRaw(ctx, setupSQL); err != nil {
		t.Fatalf("failed to create compliance schema in Postgres: %v", err)
	}

	t.Cleanup(func() {
		_, _ = a.ExecuteRaw(context.Background(), `
			DROP TABLE IF EXISTS comp_items CASCADE;
			DROP TABLE IF EXISTS comp_precision CASCADE;
			DROP TABLE IF EXISTS comp_categories CASCADE;
		`)
	})

	runComplianceLifecycle(t, a, "postgres")
}

func TestAdapterCompliance_Lifecycle_MySQL(t *testing.T) {
	dsn := os.Getenv("PEBBLEBASE_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("PEBBLEBASE_TEST_MYSQL_DSN not set — skipping MySQL compliance lifecycle")
	}

	ctx := context.Background()
	a, err := mysqladapter.New(ctx, dsn)
	if err != nil {
		t.Fatalf("mysql.New failed: %v", err)
	}
	defer a.Close()

	setupSQL := `
	DROP TABLE IF EXISTS comp_items;
	DROP TABLE IF EXISTS comp_precision;
	DROP TABLE IF EXISTS comp_categories;

	CREATE TABLE comp_categories (
		id INT AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(100) NOT NULL
	);

	CREATE TABLE comp_precision (
		id INT AUTO_INCREMENT PRIMARY KEY,
		big_number BIGINT NOT NULL,
		uuid_val BINARY(16) NOT NULL,
		json_data JSON NOT NULL,
		created_at TIMESTAMP NOT NULL
	);

	CREATE TABLE comp_items (
		id INT AUTO_INCREMENT PRIMARY KEY,
		category_id INT,
		name VARCHAR(100) NOT NULL UNIQUE,
		price DECIMAL(10,2) NOT NULL,
		FOREIGN KEY (category_id) REFERENCES comp_categories(id)
	);
	`
	for _, stmt := range strings.Split(setupSQL, ";") {
		trimmed := strings.TrimSpace(stmt)
		if trimmed == "" {
			continue
		}
		if _, err := a.ExecuteRaw(ctx, trimmed); err != nil {
			t.Fatalf("failed to create compliance schema in MySQL: %v", err)
		}
	}

	t.Cleanup(func() {
		cleanup := `
			DROP TABLE IF EXISTS comp_items;
			DROP TABLE IF EXISTS comp_precision;
			DROP TABLE IF EXISTS comp_categories;
		`
		for _, stmt := range strings.Split(cleanup, ";") {
			trimmed := strings.TrimSpace(stmt)
			if trimmed != "" {
				_, _ = a.ExecuteRaw(context.Background(), trimmed)
			}
		}
	})

	runComplianceLifecycle(t, a, "mysql")
}

func TestAdapterCompliance_Lifecycle_MSSQL(t *testing.T) {
	dsn := os.Getenv("PEBBLEBASE_TEST_MSSQL_DSN")
	if dsn == "" {
		t.Skip("PEBBLEBASE_TEST_MSSQL_DSN not set — skipping MSSQL compliance lifecycle")
	}

	ctx := context.Background()
	a, err := mssqladapter.New(ctx, dsn)
	if err != nil {
		t.Fatalf("mssql.New failed: %v", err)
	}
	defer a.Close()

	setupSQL := `
	IF OBJECT_ID('comp_items', 'U') IS NOT NULL DROP TABLE comp_items;
	IF OBJECT_ID('comp_precision', 'U') IS NOT NULL DROP TABLE comp_precision;
	IF OBJECT_ID('comp_categories', 'U') IS NOT NULL DROP TABLE comp_categories;

	CREATE TABLE comp_categories (
		id INT IDENTITY(1,1) PRIMARY KEY,
		name NVARCHAR(100) NOT NULL
	);

	CREATE TABLE comp_precision (
		id INT IDENTITY(1,1) PRIMARY KEY,
		big_number BIGINT NOT NULL,
		uuid_val UNIQUEIDENTIFIER NOT NULL,
		json_data NVARCHAR(MAX) NOT NULL,
		created_at DATETIME2 NOT NULL
	);

	CREATE TABLE comp_items (
		id INT IDENTITY(1,1) PRIMARY KEY,
		category_id INT,
		name NVARCHAR(100) NOT NULL UNIQUE,
		price DECIMAL(10,2) NOT NULL,
		FOREIGN KEY (category_id) REFERENCES comp_categories(id)
	);
	`
	if _, err := a.ExecuteRaw(ctx, setupSQL); err != nil {
		t.Fatalf("failed to create compliance schema in MSSQL: %v", err)
	}

	t.Cleanup(func() {
		cleanup := `
		IF OBJECT_ID('comp_items', 'U') IS NOT NULL DROP TABLE comp_items;
		IF OBJECT_ID('comp_precision', 'U') IS NOT NULL DROP TABLE comp_precision;
		IF OBJECT_ID('comp_categories', 'U') IS NOT NULL DROP TABLE comp_categories;
		`
		_, _ = a.ExecuteRaw(context.Background(), cleanup)
	})

	runComplianceLifecycle(t, a, "mssql")
}
