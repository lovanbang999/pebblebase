package adapter_test

import (
	"reflect"
	"testing"

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
