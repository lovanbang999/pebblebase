package diff_test

import (
	"context"
	"strings"
	"testing"

	"pebblebase/internal/adapter"
	"pebblebase/internal/diff"
	"pebblebase/internal/schema"
	"pebblebase/internal/storage"
)

type mockAdapter struct {
	tables  []schema.Table
	indexes map[string][]adapter.IndexInfo
}

func (m *mockAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return m.tables, nil
}
func (m *mockAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return adapter.QueryResult{}, nil
}
func (m *mockAdapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	return nil
}
func (m *mockAdapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return adapter.RawQueryResult{}, nil
}
func (m *mockAdapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
	return adapter.AggregateResult{}, nil
}
func (m *mockAdapter) Ping(ctx context.Context) error { return nil }
func (m *mockAdapter) Close() error                   { return nil }
func (m *mockAdapter) GetTableDDL(ctx context.Context, table string) (string, error) {
	return "", nil
}
func (m *mockAdapter) GetTableIndexes(ctx context.Context, table string) ([]adapter.IndexInfo, error) {
	if m.indexes != nil {
		return m.indexes[strings.ToLower(table)], nil
	}
	return nil, nil
}

func TestCompare_TableAndColumnDiscrepancies(t *testing.T) {
	fromTables := []schema.Table{
		{
			Name: "users",
			Columns: []schema.Column{
				{Name: "id", Type: "uuid", IsPrimaryKey: true},
				{Name: "email", Type: "string", Nullable: false},
				{Name: "role", Type: "string", Nullable: true},
			},
		},
		{
			Name: "orders",
			Columns: []schema.Column{
				{Name: "id", Type: "uuid", IsPrimaryKey: true},
				{Name: "user_id", Type: "uuid", Nullable: false},
				{Name: "total", Type: "float", Nullable: false},
			},
		},
	}

	toTables := []schema.Table{
		{
			Name: "users",
			Columns: []schema.Column{
				{Name: "id", Type: "uuid", IsPrimaryKey: true},
				{Name: "email", Type: "string", Nullable: false},
				{Name: "role", Type: "int", Nullable: false}, // type & nullable mismatch!
				{Name: "legacy_field", Type: "string", Nullable: true}, // extra in target!
			},
		},
		{
			Name: "old_logs", // extra in target!
			Columns: []schema.Column{
				{Name: "id", Type: "int", IsPrimaryKey: true},
			},
		},
	}

	fromAdapter := &mockAdapter{
		tables: fromTables,
		indexes: map[string][]adapter.IndexInfo{
			"users": {
				{Name: "idx_users_email", Columns: []string{"email"}, Unique: true},
			},
		},
	}

	toAdapter := &mockAdapter{
		tables: toTables,
		indexes: map[string][]adapter.IndexInfo{
			"users": {
				{Name: "idx_users_email", Columns: []string{"email"}, Unique: false}, // uniqueness mismatch!
			},
		},
	}

	fromConn := storage.Record{ID: "c1", Name: "dev_db", Type: "postgres"}
	toConn := storage.Record{ID: "c2", Name: "staging_db", Type: "postgres"}

	res, err := diff.Compare(context.Background(), fromAdapter, toAdapter, fromConn, toConn)
	if err != nil {
		t.Fatalf("diff.Compare failed: %v", err)
	}

	// Verify Summary
	if res.Summary.TablesAdded != 1 { // "orders" missing in staging
		t.Errorf("expected 1 table added, got %d", res.Summary.TablesAdded)
	}
	if res.Summary.TablesRemoved != 1 { // "old_logs" extra in staging
		t.Errorf("expected 1 table removed, got %d", res.Summary.TablesRemoved)
	}
	if res.Summary.TablesModified != 1 { // "users" modified
		t.Errorf("expected 1 table modified, got %d", res.Summary.TablesModified)
	}

	// Verify migration SQL contains statements
	sql := res.MigrationSQL
	if !strings.Contains(sql, `CREATE TABLE "orders"`) {
		t.Errorf("expected CREATE TABLE \"orders\", got:\n%s", sql)
	}
	if !strings.Contains(sql, `DROP TABLE IF EXISTS "old_logs"`) {
		t.Errorf("expected DROP TABLE \"old_logs\", got:\n%s", sql)
	}
	if !strings.Contains(sql, `ALTER TABLE "users" DROP COLUMN "legacy_field"`) {
		t.Errorf("expected DROP COLUMN \"legacy_field\", got:\n%s", sql)
	}
	if !strings.Contains(sql, `ALTER TABLE "users" ALTER COLUMN "role" TYPE VARCHAR(255)`) {
		t.Errorf("expected ALTER COLUMN \"role\" TYPE, got:\n%s", sql)
	}
	if !strings.Contains(sql, `CREATE UNIQUE INDEX "idx_users_email"`) {
		t.Errorf("expected CREATE UNIQUE INDEX \"idx_users_email\", got:\n%s", sql)
	}
}

func TestGenerateMigrationSQL_MySQLDialect(t *testing.T) {
	fromConn := diff.ConnectionInfo{ID: "c1", Name: "dev", Engine: "mysql"}
	toConn := diff.ConnectionInfo{ID: "c2", Name: "prod", Engine: "mysql"}

	d := &diff.SchemaDiffResult{
		FromConnection: fromConn,
		ToConnection:   toConn,
		Tables: []diff.TableDiff{
			{
				Name:   "accounts",
				Status: diff.StatusModified,
				Columns: []diff.ColumnDiff{
					{
						Name:   "balance",
						Status: diff.StatusModified,
						FromColumn: &schema.Column{
							Name:     "balance",
							Type:     "float",
							Nullable: false,
						},
						ToColumn: &schema.Column{
							Name:     "balance",
							Type:     "int",
							Nullable: true,
						},
						Changes: []string{"type: int -> float"},
					},
					{
						Name:   "country",
						Status: diff.StatusAdded,
						FromColumn: &schema.Column{
							Name:     "country",
							Type:     "string",
							Nullable: true,
						},
					},
				},
			},
		},
		Summary: diff.DiffSummary{
			TablesModified:  1,
			ColumnsAdded:    1,
			ColumnsModified: 1,
		},
	}

	sql := diff.GenerateMigrationSQL(d, "mysql")
	if !strings.Contains(sql, "ALTER TABLE `accounts` MODIFY COLUMN `balance` DECIMAL(10,2) NOT NULL;") {
		t.Errorf("expected MySQL MODIFY COLUMN, got:\n%s", sql)
	}
	if !strings.Contains(sql, "ALTER TABLE `accounts` ADD COLUMN `country` VARCHAR(255);") {
		t.Errorf("expected MySQL ADD COLUMN, got:\n%s", sql)
	}
}
