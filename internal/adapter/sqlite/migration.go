package sqlite

import (
	"context"
	"fmt"
	"time"

	"pebblebase/internal/adapter"
)

var _ adapter.MigrationRunner = (*SQLiteAdapter)(nil)

// ExecuteMigration runs or previews DDL statements for SQLite.
// SQLite natively supports transactional DDL, allowing dry-runs to execute and rollback
// safely inside a transaction for authentic syntax and constraint verification.
func (a *SQLiteAdapter) ExecuteMigration(ctx context.Context, ddl string, dryRun bool) (adapter.MigrationResult, error) {
	statements := adapter.SplitStatements(ddl)
	if len(statements) == 0 {
		return adapter.MigrationResult{
			Success: false,
			Error:   "No DDL statements provided",
		}, fmt.Errorf("no DDL statements provided")
	}

	plan, rollbackSQL := adapter.AnalyzeStatements(statements)

	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return adapter.MigrationResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to begin transaction: %v", err),
			Plan:    plan,
		}, err
	}
	defer tx.Rollback() // Safe no-op if committed

	var totalAffected int64
	for _, stmt := range statements {
		res, err := tx.ExecContext(ctx, stmt)
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

	now := time.Now().UTC().Format(time.RFC3339)

	if dryRun {
		// Roll back the transaction so no state is modified in the database
		_ = tx.Rollback()
		return adapter.MigrationResult{
			Success:      true,
			AffectedRows: totalAffected,
			Plan:         plan,
			ExecutedAt:   now,
			RollbackSQL:  rollbackSQL,
		}, nil
	}

	if err := tx.Commit(); err != nil {
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
