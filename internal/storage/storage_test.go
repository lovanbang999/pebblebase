package storage_test

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"pebblebase/internal/storage"
)

func newTestEncryptor(t *testing.T) *storage.Encryptor {
	t.Helper()
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1) // deterministic key for tests
	}
	enc, err := storage.NewEncryptor(key)
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}
	return enc
}

// ---- Encryptor tests -------------------------------------------------------

func TestEncryptor_RoundTrip(t *testing.T) {
	enc := newTestEncryptor(t)

	cases := []string{
		"",
		"hello",
		"postgres://user:secret@localhost:5432/mydb?sslmode=prefer",
		"a very long string with special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?",
	}

	for _, plaintext := range cases {
		t.Run(plaintext, func(t *testing.T) {
			cipher, err := enc.Encrypt(plaintext)
			if err != nil {
				t.Fatalf("Encrypt: %v", err)
			}
			got, err := enc.Decrypt(cipher)
			if err != nil {
				t.Fatalf("Decrypt: %v", err)
			}
			if got != plaintext {
				t.Errorf("Decrypt() = %q, want %q", got, plaintext)
			}
		})
	}
}

func TestEncryptor_EncryptProducesUniqueCiphertexts(t *testing.T) {
	// GCM uses random nonces so two encryptions of the same plaintext must differ.
	enc := newTestEncryptor(t)
	a, _ := enc.Encrypt("same plaintext")
	b, _ := enc.Encrypt("same plaintext")
	if a == b {
		t.Error("Encrypt: same input produced identical ciphertext — nonce reuse detected")
	}
}

func TestEncryptor_DecryptTamperedCiphertext(t *testing.T) {
	enc := newTestEncryptor(t)
	encoded, _ := enc.Encrypt("secret")

	// Decode, flip a byte, re-encode.
	raw, _ := base64.StdEncoding.DecodeString(encoded)
	raw[len(raw)-1] ^= 0xFF
	tampered := base64.StdEncoding.EncodeToString(raw)

	_, err := enc.Decrypt(tampered)
	if err == nil {
		t.Error("Decrypt: expected error on tampered ciphertext, got nil")
	}
}

func TestNewEncryptor_WrongKeyLength(t *testing.T) {
	for _, l := range []int{0, 16, 31, 33, 64} {
		_, err := storage.NewEncryptor(make([]byte, l))
		if err == nil {
			t.Errorf("NewEncryptor(len=%d): expected error, got nil", l)
		}
	}
}

// ---- Store tests -----------------------------------------------------------

func TestStore_SaveAndList(t *testing.T) {
	s, _ := storage.NewStore(t.TempDir(), newTestEncryptor(t))

	rec, err := s.Save("Local PG", "postgres", "localhost", "5432", "alice", "mydb",
		"postgres://alice:secret@localhost:5432/mydb", true)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if rec.ID == "" {
		t.Error("Save: ID should not be empty")
	}
	if rec.EncryptedDSN == "" {
		t.Error("Save: EncryptedDSN should be set when SavePassword=true")
	}

	list, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("List: got %d records, want 1", len(list))
	}
	if list[0].ID != rec.ID {
		t.Errorf("List: ID mismatch")
	}
}

func TestStore_DSN_Roundtrip(t *testing.T) {
	s, _ := storage.NewStore(t.TempDir(), newTestEncryptor(t))

	originalDSN := "postgres://alice:topsecret@db:5432/prod?sslmode=require"
	rec, _ := s.Save("prod", "postgres", "db", "5432", "alice", "prod", originalDSN, true)

	got, err := s.DSN(rec.ID)
	if err != nil {
		t.Fatalf("DSN: %v", err)
	}
	if got != originalDSN {
		t.Errorf("DSN() = %q, want %q", got, originalDSN)
	}
}

func TestStore_DSN_NoPasswordSaved(t *testing.T) {
	s, _ := storage.NewStore(t.TempDir(), newTestEncryptor(t))
	rec, _ := s.Save("local", "postgres", "localhost", "5432", "u", "d", "postgres://u@localhost/d", false)

	_, err := s.DSN(rec.ID)
	if err == nil {
		t.Error("DSN: expected error when SavePassword=false, got nil")
	}
}

func TestStore_Delete(t *testing.T) {
	s, _ := storage.NewStore(t.TempDir(), newTestEncryptor(t))

	r1, _ := s.Save("a", "postgres", "h", "5432", "u", "d", "dsn1", false)
	_, _ = s.Save("b", "mysql", "h", "3306", "u", "d", "dsn2", false)

	if err := s.Delete(r1.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	list, _ := s.List()
	if len(list) != 1 {
		t.Fatalf("After Delete: got %d records, want 1", len(list))
	}
	if list[0].Name != "b" {
		t.Errorf("After Delete: remaining record name = %q, want %q", list[0].Name, "b")
	}
}

func TestStore_PersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	enc := newTestEncryptor(t)

	s1, _ := storage.NewStore(dir, enc)
	_, _ = s1.Save("persist-me", "postgres", "h", "5432", "u", "d", "dsn", false)

	// Simulate restart — new Store instance, same directory.
	s2, _ := storage.NewStore(dir, enc)
	list, err := s2.List()
	if err != nil {
		t.Fatalf("List after restart: %v", err)
	}
	if len(list) != 1 || list[0].Name != "persist-me" {
		t.Errorf("Record did not survive restart: %+v", list)
	}
}

// ---- Key tests -------------------------------------------------------------

func TestLoadOrGenerateKey_FromEnv(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	t.Setenv("PEBBLEBASE_MASTER_KEY", base64.StdEncoding.EncodeToString(key))

	got, err := storage.LoadOrGenerateKey(t.TempDir())
	if err != nil {
		t.Fatalf("LoadOrGenerateKey: %v", err)
	}
	if string(got) != string(key) {
		t.Error("LoadOrGenerateKey: returned key does not match env key")
	}
}

func TestLoadOrGenerateKey_GeneratesAndPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PEBBLEBASE_MASTER_KEY", "") // ensure env is clear

	k1, err := storage.LoadOrGenerateKey(dir)
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	if len(k1) != 32 {
		t.Fatalf("key length = %d, want 32", len(k1))
	}

	// Second call must return the same persisted key.
	k2, err := storage.LoadOrGenerateKey(dir)
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if string(k1) != string(k2) {
		t.Error("LoadOrGenerateKey: key changed between calls")
	}

	// Key file must not be world-readable.
	info, _ := os.Stat(filepath.Join(dir, ".master.key"))
	if info.Mode().Perm() != 0600 {
		t.Errorf("key file permissions = %04o, want 0600", info.Mode().Perm())
	}
}
