// Package auth provides user authentication and session management for Pebblebase.
package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite" // SQLite driver
)

// Store persists user records in a SQLite metadata database.
// All public methods are safe for concurrent use.
type Store struct {
	db *sql.DB
}

// NewStore opens (or creates) the SQLite metadata DB at the given path and
// initialises the users table. It also bootstraps the default admin account
// when no users exist yet.
func NewStore(db *sql.DB) (*Store, error) {
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("auth store migrate: %w", err)
	}
	if err := s.bootstrap(); err != nil {
		return nil, fmt.Errorf("auth store bootstrap: %w", err)
	}
	return s, nil
}

// migrate creates the users table if it does not exist.
func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id            TEXT PRIMARY KEY,
			username      TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role          TEXT NOT NULL DEFAULT 'viewer',
			created_at    DATETIME NOT NULL,
			updated_at    DATETIME NOT NULL,
			active        INTEGER NOT NULL DEFAULT 1
		)
	`)
	if err != nil {
		return err
	}
	// Existing databases predate account activation. SQLite's DEFAULT 1 migration
	// keeps every existing Admin and Viewer active without changing their roles.
	rows, err := s.db.Query("PRAGMA table_info(users)")
	if err != nil {
		return err
	}
	defer rows.Close()
	hasActive := false
	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull, primaryKey int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			return err
		}
		if name == "active" {
			hasActive = true
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if !hasActive {
		_, err = s.db.Exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
	}
	return err
}

// bootstrap inserts a default admin user when the users table is empty.
// The default password is "pebblebase"; users are warned to change it on first login.
func (s *Store) bootstrap() error {
	var count int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := HashPassword("pebblebase")
	if err != nil {
		return fmt.Errorf("hash default password: %w", err)
	}
	now := time.Now().UTC()
	_, err = s.db.Exec(
		`INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), "admin", hash, string(RoleAdmin), now, now,
	)
	return err
}

// CreateUser inserts a new user with a bcrypt-hashed password.
func (s *Store) CreateUser(ctx context.Context, username, password string, role Role) (*User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	now := time.Now().UTC()
	u := &User{
		ID:           uuid.New().String(),
		Username:     username,
		PasswordHash: hash,
		Role:         role,
		Active:       true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO users (id, username, password_hash, role, created_at, updated_at, active)
		 VALUES (?, ?, ?, ?, ?, ?, 1)`,
		u.ID, u.Username, u.PasswordHash, string(u.Role), u.CreatedAt, u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return u, nil
}

// GetByUsername returns the user with the given username, or an error if not found.
func (s *Store) GetByUsername(ctx context.Context, username string) (*User, error) {
	u := &User{}
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, role, created_at, updated_at, active
		 FROM users WHERE username = ?`, username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt, &u.Active)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user %q not found", username)
	}
	if err != nil {
		return nil, fmt.Errorf("query user: %w", err)
	}
	return u, nil
}

// GetByID returns the user with the given ID.
func (s *Store) GetByID(ctx context.Context, id string) (*User, error) {
	u := &User{}
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, role, created_at, updated_at, active
		 FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt, &u.Active)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("query user by id: %w", err)
	}
	return u, nil
}

// ListUsers returns all users ordered by created_at ascending.
func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, username, password_hash, role, created_at, updated_at, active
		 FROM users ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt, &u.Active); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// UpdateAccess atomically updates a user's role and activation status. It
// prevents self lockout and preserves at least one active administrator.
func (s *Store) UpdateAccess(ctx context.Context, id, actorID string, role Role, active bool) (*User, error) {
	if role != RoleAdmin && role != RoleDeveloper && role != RoleViewer {
		return nil, fmt.Errorf("invalid role")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var currentRole Role
	var currentActive bool
	if err := tx.QueryRowContext(ctx, "SELECT role, active FROM users WHERE id = ?", id).Scan(&currentRole, &currentActive); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, err
	}
	if id == actorID && !active {
		return nil, fmt.Errorf("cannot deactivate your own account")
	}
	removingActiveAdmin := currentRole == RoleAdmin && currentActive && (!active || role != RoleAdmin)
	if removingActiveAdmin {
		var admins int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE role = ? AND active = 1", string(RoleAdmin)).Scan(&admins); err != nil {
			return nil, err
		}
		if admins <= 1 {
			return nil, fmt.Errorf("cannot deactivate or demote the last active administrator")
		}
	}
	if _, err := tx.ExecContext(ctx, "UPDATE users SET role = ?, active = ?, updated_at = ? WHERE id = ?", string(role), active, time.Now().UTC(), id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetByID(ctx, id)
}

// DeleteUser removes the user with the given ID.
func (s *Store) DeleteUser(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var role Role
	var active bool
	if err := tx.QueryRowContext(ctx, "SELECT role, active FROM users WHERE id = ?", id).Scan(&role, &active); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("user not found")
		}
		return err
	}
	if role == RoleAdmin && active {
		var admins int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE role = ? AND active = 1", string(RoleAdmin)).Scan(&admins); err != nil {
			return err
		}
		if admins <= 1 {
			return fmt.Errorf("cannot delete the last active administrator")
		}
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM users WHERE id = ?", id); err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	return tx.Commit()
}

// UpdatePassword replaces the password hash for the given user ID.
func (s *Store) UpdatePassword(ctx context.Context, id, newHash string) error {
	_, err := s.db.ExecContext(ctx,
		"UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
		newHash, time.Now().UTC(), id,
	)
	return err
}

// CountUsers returns the total number of users.
func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n)
	return n, err
}

// IsDefaultPassword reports whether the admin account still uses the bootstrap password.
func (s *Store) IsDefaultPassword(ctx context.Context, userID string) bool {
	u, err := s.GetByID(ctx, userID)
	if err != nil {
		return false
	}
	return CheckPassword("pebblebase", u.PasswordHash) == nil
}
