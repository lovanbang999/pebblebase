// Package savedquery manages per-connection saved SQL/Mongo queries.
// Queries are persisted in the shared meta.db SQLite database.
package savedquery

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// SavedQuery is a named, reusable query associated with a connection.
type SavedQuery struct {
	ID           string    `json:"id"`
	ConnectionID string    `json:"connection_id"`
	UserID       string    `json:"user_id"`
	Title        string    `json:"title"`
	Query        string    `json:"query"`
	Tags         []string  `json:"tags"`
	IsFavorite   bool      `json:"is_favorite"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// UpdateInput carries the mutable fields for PATCH operations.
type UpdateInput struct {
	Title      *string   `json:"title"`
	Query      *string   `json:"query"`
	Tags       *[]string `json:"tags"`
	IsFavorite *bool     `json:"is_favorite"`
}

// ListParams controls optional filtering for List.
type ListParams struct {
	Tag    string // filter by a single tag (empty = all)
	Search string // substring match against title or query content
}

// Store persists saved queries in the shared SQLite meta.db.
type Store struct {
	db *sql.DB
}

// NewStore opens the saved_queries table, creating it if needed.
func NewStore(db *sql.DB) (*Store, error) {
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("savedquery migrate: %w", err)
	}
	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS saved_queries (
			id            TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			user_id       TEXT NOT NULL DEFAULT '',
			title         TEXT NOT NULL,
			query         TEXT NOT NULL,
			tags          TEXT NOT NULL DEFAULT '[]',
			is_favorite   INTEGER NOT NULL DEFAULT 0,
			created_at    DATETIME NOT NULL,
			updated_at    DATETIME NOT NULL
		)
	`)
	return err
}

// Create inserts a new saved query and returns the persisted record.
func (s *Store) Create(ctx context.Context, connID, userID, title, query string, tags []string, isFavorite bool) (SavedQuery, error) {
	if tags == nil {
		tags = []string{}
	}
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return SavedQuery{}, fmt.Errorf("savedquery: marshal tags: %w", err)
	}

	now := time.Now().UTC()
	sq := SavedQuery{
		ID:           uuid.New().String(),
		ConnectionID: connID,
		UserID:       userID,
		Title:        title,
		Query:        query,
		Tags:         tags,
		IsFavorite:   isFavorite,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO saved_queries (id, connection_id, user_id, title, query, tags, is_favorite, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		sq.ID, sq.ConnectionID, sq.UserID, sq.Title, sq.Query, string(tagsJSON),
		boolToInt(sq.IsFavorite), sq.CreatedAt, sq.UpdatedAt,
	)
	if err != nil {
		return SavedQuery{}, fmt.Errorf("savedquery create: %w", err)
	}
	return sq, nil
}

// List returns all saved queries for a connection, with optional tag and search filtering.
func (s *Store) List(ctx context.Context, connID string, p ListParams) ([]SavedQuery, error) {
	query := `SELECT id, connection_id, user_id, title, query, tags, is_favorite, created_at, updated_at
	          FROM saved_queries WHERE connection_id = ? ORDER BY is_favorite DESC, updated_at DESC`
	rows, err := s.db.QueryContext(ctx, query, connID)
	if err != nil {
		return nil, fmt.Errorf("savedquery list: %w", err)
	}
	defer rows.Close()

	var results []SavedQuery
	for rows.Next() {
		sq, err := scanRow(rows)
		if err != nil {
			return nil, err
		}

		// Apply tag filter in-process (tags stored as JSON array)
		if p.Tag != "" && !hasTag(sq.Tags, p.Tag) {
			continue
		}

		// Apply search filter
		if p.Search != "" {
			lower := strings.ToLower(p.Search)
			if !strings.Contains(strings.ToLower(sq.Title), lower) &&
				!strings.Contains(strings.ToLower(sq.Query), lower) {
				continue
			}
		}

		results = append(results, sq)
	}
	if results == nil {
		results = []SavedQuery{}
	}
	return results, rows.Err()
}

// GetByID returns a single saved query by ID.
func (s *Store) GetByID(ctx context.Context, id string) (SavedQuery, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, connection_id, user_id, title, query, tags, is_favorite, created_at, updated_at
		 FROM saved_queries WHERE id = ?`, id)
	sq, err := scanRow(row)
	if err == sql.ErrNoRows {
		return SavedQuery{}, fmt.Errorf("savedquery %q not found", id)
	}
	return sq, err
}

// Update applies partial updates to an existing saved query.
func (s *Store) Update(ctx context.Context, id string, input UpdateInput) (SavedQuery, error) {
	sq, err := s.GetByID(ctx, id)
	if err != nil {
		return SavedQuery{}, err
	}

	if input.Title != nil {
		sq.Title = *input.Title
	}
	if input.Query != nil {
		sq.Query = *input.Query
	}
	if input.Tags != nil {
		sq.Tags = *input.Tags
	}
	if input.IsFavorite != nil {
		sq.IsFavorite = *input.IsFavorite
	}
	sq.UpdatedAt = time.Now().UTC()

	tagsJSON, err := json.Marshal(sq.Tags)
	if err != nil {
		return SavedQuery{}, fmt.Errorf("savedquery: marshal tags: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		`UPDATE saved_queries SET title=?, query=?, tags=?, is_favorite=?, updated_at=? WHERE id=?`,
		sq.Title, sq.Query, string(tagsJSON), boolToInt(sq.IsFavorite), sq.UpdatedAt, sq.ID,
	)
	if err != nil {
		return SavedQuery{}, fmt.Errorf("savedquery update: %w", err)
	}
	return sq, nil
}

// Delete removes a saved query by ID. Returns an error if not found.
func (s *Store) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM saved_queries WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("savedquery delete: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("savedquery %q not found", id)
	}
	return nil
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type scanner interface {
	Scan(dest ...any) error
}

func scanRow(s scanner) (SavedQuery, error) {
	var sq SavedQuery
	var tagsJSON string
	var isFav int
	if err := s.Scan(
		&sq.ID, &sq.ConnectionID, &sq.UserID, &sq.Title, &sq.Query,
		&tagsJSON, &isFav, &sq.CreatedAt, &sq.UpdatedAt,
	); err != nil {
		return SavedQuery{}, fmt.Errorf("savedquery scan: %w", err)
	}
	sq.IsFavorite = isFav != 0
	if err := json.Unmarshal([]byte(tagsJSON), &sq.Tags); err != nil {
		sq.Tags = []string{}
	}
	return sq, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func hasTag(tags []string, tag string) bool {
	for _, t := range tags {
		if strings.EqualFold(t, tag) {
			return true
		}
	}
	return false
}
