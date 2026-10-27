package ai

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"pebblebase/internal/storage"

	"github.com/google/uuid"
)

// Store manages persistence and AES-256-GCM encryption for AI configurations.
type Store struct {
	mu  sync.RWMutex
	db  *sql.DB
	enc *storage.Encryptor
}

// NewStore initializes the ai_configs table in SQLite and returns a new Store.
func NewStore(db *sql.DB, enc *storage.Encryptor) (*Store, error) {
	if db == nil {
		return nil, errors.New("ai store: database connection is nil")
	}
	if enc == nil {
		return nil, errors.New("ai store: encryptor is nil")
	}

	s := &Store{
		db:  db,
		enc: enc,
	}

	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("ai store migrate: %w", err)
	}

	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_configs (
			id                TEXT PRIMARY KEY,
			provider          TEXT NOT NULL,
			model             TEXT NOT NULL,
			base_url          TEXT NOT NULL,
			api_key_encrypted TEXT NOT NULL,
			temperature       REAL NOT NULL DEFAULT 0.2,
			max_tokens        INTEGER NOT NULL DEFAULT 2048,
			is_active         INTEGER NOT NULL DEFAULT 1,
			updated_at        DATETIME NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_ai_configs_active ON ai_configs(is_active);
	`)
	return err
}

// GetActiveConfig returns the currently active AI configuration along with decrypted API key.
// Returns nil, "", nil if no configuration has been saved yet.
func (s *Store) GetActiveConfig(ctx context.Context) (*AIConfig, string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var (
		cfg       AIConfig
		isActive  int
		updatedAt time.Time
	)

	row := s.db.QueryRowContext(ctx, `
		SELECT id, provider, model, base_url, api_key_encrypted, temperature, max_tokens, is_active, updated_at
		FROM ai_configs
		WHERE is_active = 1
		ORDER BY updated_at DESC
		LIMIT 1
	`)

	err := row.Scan(
		&cfg.ID,
		&cfg.Provider,
		&cfg.Model,
		&cfg.BaseURL,
		&cfg.APIKeyEncrypted,
		&cfg.Temperature,
		&cfg.MaxTokens,
		&isActive,
		&updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", fmt.Errorf("ai store: query active config: %w", err)
	}

	cfg.IsActive = isActive == 1
	cfg.UpdatedAt = updatedAt

	var rawKey string
	if cfg.APIKeyEncrypted != "" {
		decrypted, decErr := s.enc.Decrypt(cfg.APIKeyEncrypted)
		if decErr != nil {
			return nil, "", fmt.Errorf("ai store: decrypt api key: %w", decErr)
		}
		rawKey = decrypted
	}

	return &cfg, rawKey, nil
}

// SaveConfig saves or updates the active AI configuration.
// If payload.APIKey is provided, it is encrypted with AES-256-GCM.
// If payload.APIKey is empty, any existing encrypted key for the active config is retained.
func (s *Store) SaveConfig(ctx context.Context, payload *ConfigPayload) (*AIConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(payload.Provider) == "" {
		return nil, errors.New("ai store: provider cannot be empty")
	}
	if strings.TrimSpace(payload.Model) == "" {
		return nil, errors.New("ai store: model cannot be empty")
	}

	existingCfg, rawExistingKey, err := s.getActiveConfigUnlocked(ctx)
	if err != nil {
		return nil, err
	}

	var encryptedKey string
	if strings.TrimSpace(payload.APIKey) != "" {
		enc, encErr := s.enc.Encrypt(strings.TrimSpace(payload.APIKey))
		if encErr != nil {
			return nil, fmt.Errorf("ai store: encrypt api key: %w", encErr)
		}
		encryptedKey = enc
	} else if existingCfg != nil && rawExistingKey != "" {
		encryptedKey = existingCfg.APIKeyEncrypted
	}

	temp := payload.Temperature
	if temp < 0.0 || temp > 2.0 {
		temp = 0.2
	}

	maxTokens := payload.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 2048
	}

	now := time.Now().UTC()
	var newID string

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("ai store: begin tx: %w", err)
	}
	defer tx.Rollback()

	// Deactivate any prior active configs
	if _, err := tx.ExecContext(ctx, "UPDATE ai_configs SET is_active = 0 WHERE is_active = 1"); err != nil {
		return nil, fmt.Errorf("ai store: deactivate previous configs: %w", err)
	}

	newID = uuid.NewString()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO ai_configs (
			id, provider, model, base_url, api_key_encrypted, temperature, max_tokens, is_active, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
	`, newID, strings.ToLower(strings.TrimSpace(payload.Provider)), strings.TrimSpace(payload.Model), strings.TrimSpace(payload.BaseURL), encryptedKey, temp, maxTokens, now)
	if err != nil {
		return nil, fmt.Errorf("ai store: insert config: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("ai store: commit: %w", err)
	}

	return &AIConfig{
		ID:              newID,
		Provider:        strings.ToLower(strings.TrimSpace(payload.Provider)),
		Model:           strings.TrimSpace(payload.Model),
		BaseURL:         strings.TrimSpace(payload.BaseURL),
		APIKeyEncrypted: encryptedKey,
		Temperature:     temp,
		MaxTokens:       maxTokens,
		IsActive:        true,
		UpdatedAt:       now,
	}, nil
}

func (s *Store) getActiveConfigUnlocked(ctx context.Context) (*AIConfig, string, error) {
	var (
		cfg       AIConfig
		isActive  int
		updatedAt time.Time
	)

	row := s.db.QueryRowContext(ctx, `
		SELECT id, provider, model, base_url, api_key_encrypted, temperature, max_tokens, is_active, updated_at
		FROM ai_configs
		WHERE is_active = 1
		ORDER BY updated_at DESC
		LIMIT 1
	`)

	err := row.Scan(
		&cfg.ID,
		&cfg.Provider,
		&cfg.Model,
		&cfg.BaseURL,
		&cfg.APIKeyEncrypted,
		&cfg.Temperature,
		&cfg.MaxTokens,
		&isActive,
		&updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}

	cfg.IsActive = isActive == 1
	cfg.UpdatedAt = updatedAt

	var rawKey string
	if cfg.APIKeyEncrypted != "" {
		decrypted, decErr := s.enc.Decrypt(cfg.APIKeyEncrypted)
		if decErr != nil {
			return nil, "", decErr
		}
		rawKey = decrypted
	}

	return &cfg, rawKey, nil
}

// MaskKey formats a secret key into a secure masked string (e.g. "sk-...ab12").
func MaskKey(key string) string {
	k := strings.TrimSpace(key)
	if k == "" {
		return ""
	}
	if len(k) <= 8 {
		return "••••••••"
	}
	prefixLen := 4
	if len(k) < 12 {
		prefixLen = 2
	}
	suffixLen := 4
	return fmt.Sprintf("%s...%s", k[:prefixLen], k[len(k)-suffixLen:])
}
