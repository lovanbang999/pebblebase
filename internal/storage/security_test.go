package storage_test

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pebblebase/internal/storage"
)

// TestSecurity_AES256GCM_PasswordNeverInPlaintext verifies that connection DSNs/passwords
// are strictly encrypted with AES-256-GCM before writing to disk, and the sensitive credentials
// never appear anywhere in the raw storage file.
func TestSecurity_AES256GCM_PasswordNeverInPlaintext(t *testing.T) {
	dir := t.TempDir()
	enc := newTestEncryptor(t)

	store, err := storage.NewStore(dir, enc)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	sensitiveDSN := "postgres://admin:SuperSecretP@ssw0rd!123_TopSecret@db.internal.corp:5432/analytics?sslmode=disable"
	created, err := store.Save(
		"Prod-Database",
		"postgres",
		"db.internal.corp",
		"5432",
		"admin",
		"analytics",
		sensitiveDSN,
		true, // savePassword = true
	)
	if err != nil {
		t.Fatalf("store.Save: %v", err)
	}

	// 1. Inspect raw stored JSON file on disk
	filePath := filepath.Join(dir, "connections.json")
	rawBytes, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read connections.json: %v", err)
	}
	rawContent := string(rawBytes)

	// Plaintext sensitive password MUST NOT exist in raw JSON
	if strings.Contains(rawContent, "SuperSecretP@ssw0rd!123_TopSecret") {
		t.Fatalf("SECURITY VIOLATION: Raw connections.json contains plaintext password: %s", rawContent)
	}

	// 2. EncryptedDSN must be non-empty and valid base64
	if created.EncryptedDSN == "" || created.EncryptedDSN == sensitiveDSN {
		t.Fatalf("DSN was not encrypted: got %q", created.EncryptedDSN)
	}

	data, err := base64.StdEncoding.DecodeString(created.EncryptedDSN)
	if err != nil {
		t.Fatalf("stored EncryptedDSN is not valid base64: %v", err)
	}

	// AES-GCM requires 12-byte nonce + at least 16-byte authentication tag
	minGcmSize := 12 + 16
	if len(data) < minGcmSize {
		t.Fatalf("ciphertext too short for AES-256-GCM: got %d bytes, need >= %d", len(data), minGcmSize)
	}

	// 3. Decrypt through store and verify fidelity
	decryptedDSN, err := store.DSN(created.ID)
	if err != nil {
		t.Fatalf("store.DSN: %v", err)
	}
	if decryptedDSN != sensitiveDSN {
		t.Errorf("decrypted DSN mismatch: got %q, want %q", decryptedDSN, sensitiveDSN)
	}
}

// TestSecurity_AES256GCM_TamperingFails verifies that bit-flipping any byte of the ciphertext
// causes AES-GCM authentication verification to immediately fail.
func TestSecurity_AES256GCM_TamperingFails(t *testing.T) {
	enc := newTestEncryptor(t)

	ciphertext, err := enc.Encrypt("my-secret-credential")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	raw, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		t.Fatalf("DecodeString: %v", err)
	}

	// Flip a bit in the ciphertext / auth tag
	tampered := make([]byte, len(raw))
	copy(tampered, raw)
	tampered[len(tampered)-1] ^= 0x01

	tamperedB64 := base64.StdEncoding.EncodeToString(tampered)
	_, err = enc.Decrypt(tamperedB64)
	if err == nil {
		t.Fatal("SECURITY VIOLATION: AES-GCM accepted tampered ciphertext without authentication error!")
	}
}

// TestSecurity_AES256_KeyLengthEnforced verifies that only 256-bit (32-byte) keys are accepted.
func TestSecurity_AES256_KeyLengthEnforced(t *testing.T) {
	shortKey := make([]byte, 16) // 128-bit
	if _, err := storage.NewEncryptor(shortKey); err == nil {
		t.Error("expected error for 16-byte key, but NewEncryptor succeeded")
	}

	longKey := make([]byte, 64) // 512-bit
	if _, err := storage.NewEncryptor(longKey); err == nil {
		t.Error("expected error for 64-byte key, but NewEncryptor succeeded")
	}

	validKey := make([]byte, 32) // 256-bit
	if _, err := storage.NewEncryptor(validKey); err != nil {
		t.Errorf("valid 32-byte key failed: %v", err)
	}
}
