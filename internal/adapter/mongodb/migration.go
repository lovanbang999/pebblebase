package mongodb

import (
	"context"

	"pebblebase/internal/adapter"
)

var _ adapter.MigrationRunner = (*Adapter)(nil)

// ExecuteMigration returns a notice for MongoDB indicating DDL migrations are not applicable.
func (a *Adapter) ExecuteMigration(ctx context.Context, ddl string, dryRun bool) (adapter.MigrationResult, error) {
	return adapter.MigrationResult{
		Success: false,
		Error:   "DDL migrations are not applicable for MongoDB (schemaless document store)",
		Plan:    []string{"MongoDB is schemaless: DDL migrations are not applicable"},
	}, nil
}
