package storage

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
)

// LoadOrGenerateKey returns a 32-byte AES key using the following priority:
//
//  1. PEBBLEBASE_MASTER_KEY environment variable (base64-encoded) — recommended
//     for production and team deployments, keeps the key separate from the data.
//  2. A .master.key file inside dataDir — generated automatically on first run.
//     Convenient for personal local use, but NOT secure if someone can copy the
//     entire data volume (key and data would both be exposed).
func LoadOrGenerateKey(dataDir string) ([]byte, error) {
	if envKey := os.Getenv("PEBBLEBASE_MASTER_KEY"); envKey != "" {
		key, err := base64.StdEncoding.DecodeString(envKey)
		if err != nil {
			return nil, fmt.Errorf("storage: decode PEBBLEBASE_MASTER_KEY: %w", err)
		}
		if len(key) != 32 {
			return nil, fmt.Errorf("storage: PEBBLEBASE_MASTER_KEY must decode to exactly 32 bytes, got %d", len(key))
		}
		return key, nil
	}

	keyPath := filepath.Join(dataDir, ".master.key")

	if data, err := os.ReadFile(keyPath); err == nil {
		key, err := base64.StdEncoding.DecodeString(string(data))
		if err != nil {
			return nil, fmt.Errorf("storage: decode key file %s: %w", keyPath, err)
		}
		return key, nil
	}

	// First run: generate a new random key and persist it.
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("storage: generate key: %w", err)
	}

	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("storage: create data dir %s: %w", dataDir, err)
	}

	encoded := base64.StdEncoding.EncodeToString(key)
	if err := os.WriteFile(keyPath, []byte(encoded), 0600); err != nil {
		return nil, fmt.Errorf("storage: write key file %s: %w", keyPath, err)
	}

	return key, nil
}
