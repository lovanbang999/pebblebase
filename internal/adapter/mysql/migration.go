package mysql

import (
	"context"
	"fmt"
	"time"

	"pebblebase/internal/adapter"
)

var _ adapter.MigrationRunner = (*MySQLAdapter)(nil)

// ExecuteMigration runs or previews DDL statements for MySQL.
// In MySQL, DDL statements cause an implicit commit and cannot be rolled back inside a transaction.
// Dry-runs parse and summarize the planned operations without modifying database state.
func (a *MySQLAdapter) ExecuteMigration(ctx context.Context, ddl string, dryRun bool) (adapter.MigrationResult, error) {
	statements := adapter.SplitStatements(ddl)
	if len(statements) == 0 {
		return adapter.MigrationResult{
			Success: false,
			Error:   "No DDL statements provided",
		}, fmt.Errorf("no DDL statements provided")
	}

	plan, rollbackSQL := adapter.AnalyzeStatements(statements)
	now := time.Now().UTC().Format(time.RFC3339)

	if dryRun {
		return adapter.MigrationResult{
			Success:      true,
			AffectedRows: 0,
			Plan:         plan,
			ExecutedAt:   now,
			RollbackSQL:  rollbackSQL,
		}, nil
	}

	var totalAffected int64
	for _, stmt := range statements {
		res, err := a.db.ExecContext(ctx, stmt)
		if err != nil {
			return adapter.MigrationResult{
				Success:     false,
				Error:       fmt.Sprintf("Execution error on statement %q: %v", stmt, err),
				Plan:        plan,
				RollbackSQL: rollbackSQL,
			}, err
		}
		if rows, err := res.RowsAffected(); err == nil {
			totalAffected += rows
		}
	}

	return adapter.MigrationResult{
		Success:      true,
		AffectedRows: totalAffected,
		Plan:         plan,
		ExecutedAt:   now,
		RollbackSQL:  rollbackSQL,
	}, nil
}
