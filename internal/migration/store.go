// Package migration provides persistent storage for connection migration history in the shared meta.db SQLite database.
package migration

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// MigrationRecord represents a single recorded DDL migration execution.
type MigrationRecord struct {
	ID           string    `json:"id"`
	ConnectionID string    `json:"connection_id"`
	DDL          string    `json:"ddl"`
	RollbackSQL  string    `json:"rollback_sql"`
	Success      bool      `json:"success"`
	Error        string    `json:"error,omitempty"`
	ExecutedAt   time.Time `json:"executed_at"`
}

// Store persists migration history into SQLite meta.db.
type Store struct {
	db *sql.DB
}

// NewStore creates and initializes the migration_history table in meta.db.
func NewStore(db *sql.DB) (*Store, error) {
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migration store init: %w", err)
	}
	return s, nil
}

func (s *Store) migrate() error {
	const schema = `
		CREATE TABLE IF NOT EXISTS migration_history (
			id            TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			ddl           TEXT NOT NULL,
			rollback_sql  TEXT NOT NULL DEFAULT '',
			success       INTEGER NOT NULL,
			error         TEXT NOT NULL DEFAULT '',
			executed_at   DATETIME NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_migration_conn_time ON migration_history(connection_id, executed_at DESC);
	`
	_, err := s.db.Exec(schema)
	return err
}

// Record inserts a new migration execution log.
func (s *Store) Record(ctx context.Context, rec MigrationRecord) (MigrationRecord, error) {
	if rec.ID == "" {
		rec.ID = uuid.New().String()
	}
	if rec.ExecutedAt.IsZero() {
		rec.ExecutedAt = time.Now().UTC()
	}

	successInt := 0
	if rec.Success {
		successInt = 1
	}

	const q = `
		INSERT INTO migration_history (id, connection_id, ddl, rollback_sql, success, error, executed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`

	_, err := s.db.ExecContext(ctx, q,
		rec.ID,
		rec.ConnectionID,
		rec.DDL,
		rec.RollbackSQL,
		successInt,
		rec.Error,
		rec.ExecutedAt,
	)
	if err != nil {
		return MigrationRecord{}, fmt.Errorf("record migration: %w", err)
	}
	return rec, nil
}

// List returns a paginated list of migrations for a connection along with total count.
func (s *Store) List(ctx context.Context, connID string, limit, offset int) ([]MigrationRecord, int, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	// 1. Get total count
	var total int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM migration_history WHERE connection_id = ?`, connID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count migrations: %w", err)
	}

	// 2. Fetch paginated records
	const q = `
		SELECT id, connection_id, ddl, rollback_sql, success, error, executed_at
		FROM migration_history
		WHERE connection_id = ?
		ORDER BY executed_at DESC
		LIMIT ? OFFSET ?`

	rows, err := s.db.QueryContext(ctx, q, connID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list migrations: %w", err)
	}
	defer rows.Close()

	var records []MigrationRecord
	for rows.Next() {
		var (
			rec        MigrationRecord
			successInt int
		)
		if err := rows.Scan(
			&rec.ID,
			&rec.ConnectionID,
			&rec.DDL,
			&rec.RollbackSQL,
			&successInt,
			&rec.Error,
			&rec.ExecutedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan migration: %w", err)
		}
		rec.Success = successInt != 0
		records = append(records, rec)
	}
	if records == nil {
		records = []MigrationRecord{}
	}

	return records, total, rows.Err()
}

// GetByID retrieves a single migration record by its ID.
func (s *Store) GetByID(ctx context.Context, id string) (MigrationRecord, error) {
	const q = `
		SELECT id, connection_id, ddl, rollback_sql, success, error, executed_at
		FROM migration_history
		WHERE id = ?`

	row := s.db.QueryRowContext(ctx, q, id)
	var (
		rec        MigrationRecord
		successInt int
	)
	if err := row.Scan(
		&rec.ID,
		&rec.ConnectionID,
		&rec.DDL,
		&rec.RollbackSQL,
		&successInt,
		&rec.Error,
		&rec.ExecutedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return MigrationRecord{}, fmt.Errorf("migration %q not found", id)
		}
		return MigrationRecord{}, fmt.Errorf("get migration: %w", err)
	}
	rec.Success = successInt != 0
	return rec, nil
}
