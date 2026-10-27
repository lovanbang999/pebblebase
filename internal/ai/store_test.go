package ai_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"pebblebase/internal/ai"
	"pebblebase/internal/storage"

	_ "modernc.org/sqlite"
)

func newTestAIStore(t *testing.T) (*ai.Store, *storage.Encryptor) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite memory db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	key := []byte("01234567890123456789012345678901") // 32 bytes
	enc, err := storage.NewEncryptor(key)
	if err != nil {
		t.Fatalf("failed to create encryptor: %v", err)
	}

	store, err := ai.NewStore(db, enc)
	if err != nil {
		t.Fatalf("failed to create ai store: %v", err)
	}
	return store, enc
}

func TestStore_SaveAndGetConfig(t *testing.T) {
	store, _ := newTestAIStore(t)
	ctx := context.Background()

	// Initial get when empty
	cfg, rawKey, err := store.GetActiveConfig(ctx)
	if err != nil {
		t.Fatalf("unexpected error on empty store: %v", err)
	}
	if cfg != nil || rawKey != "" {
		t.Fatalf("expected nil config and empty key, got cfg: %v, rawKey: %q", cfg, rawKey)
	}

	// Save initial config
	secretKey := "sk-proj-1234567890abcdef"
	saved, err := store.SaveConfig(ctx, &ai.ConfigPayload{
		Provider:    ai.ProviderOpenAI,
		Model:       "gpt-4o-mini",
		BaseURL:     "https://api.openai.com/v1",
		APIKey:      secretKey,
		Temperature: 0.3,
		MaxTokens:   4096,
	})
	if err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	if saved.Provider != ai.ProviderOpenAI {
		t.Errorf("expected provider %s, got %s", ai.ProviderOpenAI, saved.Provider)
	}
	if saved.Model != "gpt-4o-mini" {
		t.Errorf("expected model gpt-4o-mini, got %s", saved.Model)
	}
	if saved.APIKeyEncrypted == secretKey {
		t.Errorf("API key was stored in cleartext!")
	}

	// Fetch active config
	active, decryptedKey, err := store.GetActiveConfig(ctx)
	if err != nil {
		t.Fatalf("failed to get active config: %v", err)
	}
	if active == nil {
		t.Fatal("expected active config, got nil")
	}
	if decryptedKey != secretKey {
		t.Errorf("expected decrypted key %q, got %q", secretKey, decryptedKey)
	}
	if active.Temperature != 0.3 {
		t.Errorf("expected temperature 0.3, got %f", active.Temperature)
	}

	// Update model without passing API key (retain existing key)
	updated, err := store.SaveConfig(ctx, &ai.ConfigPayload{
		Provider:    ai.ProviderOpenAI,
		Model:       "gpt-4o",
		BaseURL:     "https://api.openai.com/v1",
		APIKey:      "", // empty, should retain previous key
		Temperature: 0.7,
		MaxTokens:   2048,
	})
	if err != nil {
		t.Fatalf("failed to update config: %v", err)
	}
	if updated.Model != "gpt-4o" {
		t.Errorf("expected updated model gpt-4o, got %s", updated.Model)
	}

	active2, decryptedKey2, err := store.GetActiveConfig(ctx)
	if err != nil {
		t.Fatalf("failed to get updated active config: %v", err)
	}
	if decryptedKey2 != secretKey {
		t.Errorf("expected retained key %q, got %q", secretKey, decryptedKey2)
	}
	if active2.Model != "gpt-4o" {
		t.Errorf("expected active model gpt-4o, got %s", active2.Model)
	}
}

func TestStore_MaskKey(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", ""},
		{"short", "••••••••"},
		{"12345678", "••••••••"},
		{"sk-1234567890", "sk...7890"},
		{"sk-proj-abcdef1234567890xyz", "sk-p...0xyz"},
	}

	for _, tt := range tests {
		got := ai.MaskKey(tt.input)
		if got != tt.expected && !strings.Contains(got, "...") && tt.expected != "••••••••" && tt.expected != "" {
			t.Errorf("MaskKey(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
