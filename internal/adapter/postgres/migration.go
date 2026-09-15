package postgres

import (
	"context"
	"fmt"
	"time"

	"pebblebase/internal/adapter"
)

var _ adapter.MigrationRunner = (*PostgresAdapter)(nil)

// ExecuteMigration runs or previews DDL statements for PostgreSQL.
// PostgreSQL natively supports transactional DDL, allowing dry-runs to execute and rollback
// safely inside a transaction for authentic server-side syntax and constraint verification.
func (a *PostgresAdapter) ExecuteMigration(ctx context.Context, ddl string, dryRun bool) (adapter.MigrationResult, error) {
	statements := adapter.SplitStatements(ddl)
	if len(statements) == 0 {
		return adapter.MigrationResult{
			Success: false,
			Error:   "No DDL statements provided",
		}, fmt.Errorf("no DDL statements provided")
	}

	plan, rollbackSQL := adapter.AnalyzeStatements(statements)

	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return adapter.MigrationResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to begin transaction: %v", err),
			Plan:    plan,
		}, err
	}
	defer tx.Rollback(ctx) // Safe no-op if committed

	var totalAffected int64
	for _, stmt := range statements {
		tag, err := tx.Exec(ctx, stmt)
		if err != nil {
			return adapter.MigrationResult{
				Success:     false,
				Error:       fmt.Sprintf("Execution error on statement %q: %v", stmt, err),
				Plan:        plan,
				RollbackSQL: rollbackSQL,
			}, err
		}
		totalAffected += tag.RowsAffected()
	}

	now := time.Now().UTC().Format(time.RFC3339)

	if dryRun {
		_ = tx.Rollback(ctx)
		return adapter.MigrationResult{
			Success:      true,
			AffectedRows: totalAffected,
			Plan:         plan,
			ExecutedAt:   now,
			RollbackSQL:  rollbackSQL,
		}, nil
	}

	if err := tx.Commit(ctx); err != nil {
		return adapter.MigrationResult{
			Success:     false,
			Error:       fmt.Sprintf("Failed to commit migration transaction: %v", err),
			Plan:        plan,
			RollbackSQL: rollbackSQL,
		}, err
	}

	return adapter.MigrationResult{
		Success:      true,
		AffectedRows: totalAffected,
		Plan:         plan,
		ExecutedAt:   now,
		RollbackSQL:  rollbackSQL,
	}, nil
}
