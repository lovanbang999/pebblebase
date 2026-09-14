package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Record is a saved database connection.
// When SavePassword is true, EncryptedDSN holds the full DSN encrypted with AES-256-GCM.
// When SavePassword is false, EncryptedDSN is empty and the user must supply
// credentials on each reconnect.
type Record struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"` // postgres | mysql | mongodb | sqlite
	Host         string    `json:"host"`
	Port         string    `json:"port"`
	User         string    `json:"user"`
	DBName       string    `json:"db_name"`
	Filepath     string    `json:"filepath,omitempty"`
	ReadOnly     bool      `json:"read_only"`
	SavePassword bool      `json:"save_password"`
	Environment  string    `json:"environment,omitempty"`
	EncryptedDSN string    `json:"encrypted_dsn,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// SaveParams specifies optional parameters when saving a connection.
type SaveParams struct {
	Environment string
	Filepath    string
	ReadOnly    bool
}

// Store persists connection records as a JSON file on disk.
// All public methods are safe for concurrent use.
type Store struct {
	mu        sync.RWMutex
	path      string
	encryptor *Encryptor
}

// NewStore creates a Store backed by a JSON file at dataDir/connections.json.
// Creates the file with an empty array if it doesn't exist.
func NewStore(dataDir string, enc *Encryptor) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("storage: create data dir: %w", err)
	}
	return &Store{
		path:      filepath.Join(dataDir, "connections.json"),
		encryptor: enc,
	}, nil
}

// Save encrypts the DSN (when savePassword is true) and persists the record.
// Returns the new record with its generated ID.
func (s *Store) Save(name, dbType, host, port, user, dbName, dsn string, savePassword bool, extra ...any) (Record, error) {
	env := "local"
	var fp string
	var ro bool

	for _, arg := range extra {
		switch v := arg.(type) {
		case string:
			if env == "local" && v != "" {
				env = v
			} else if fp == "" {
				fp = v
			}
		case bool:
			ro = v
		case SaveParams:
			if v.Environment != "" {
				env = v.Environment
			}
			if v.Filepath != "" {
				fp = v.Filepath
			}
			ro = v.ReadOnly
		}
	}

	rec := Record{
		ID:           uuid.New().String(),
		Name:         name,
		Type:         dbType,
		Host:         host,
		Port:         port,
		User:         user,
		DBName:       dbName,
		Filepath:     fp,
		ReadOnly:     ro,
		Environment:  env,
		SavePassword: savePassword,
		CreatedAt:    time.Now().UTC(),
	}

	if savePassword {
		encrypted, err := s.encryptor.Encrypt(dsn)
		if err != nil {
			return Record{}, fmt.Errorf("storage: encrypt DSN: %w", err)
		}
		rec.EncryptedDSN = encrypted
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	records, err := s.load()
	if err != nil {
		return Record{}, err
	}
	records = append(records, rec)
	return rec, s.persist(records)
}

// List returns all saved connections. Passwords are never included in the output.
func (s *Store) List() ([]Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.load()
}

// Get returns a single record by ID.
func (s *Store) Get(id string) (Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records, err := s.load()
	if err != nil {
		return Record{}, err
	}
	for _, r := range records {
		if r.ID == id {
			return r, nil
		}
	}
	return Record{}, fmt.Errorf("storage: connection %q not found", id)
}

// DSN returns the decrypted DSN for the given connection ID.
// Returns an error if the connection was saved without a password.
func (s *Store) DSN(id string) (string, error) {
	rec, err := s.Get(id)
	if err != nil {
		return "", err
	}
	if !rec.SavePassword || rec.EncryptedDSN == "" {
		return "", errors.New("storage: password was not saved for this connection")
	}
	return s.encryptor.Decrypt(rec.EncryptedDSN)
}

// Delete removes the record with the given ID.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	records, err := s.load()
	if err != nil {
		return err
	}
	filtered := records[:0]
	for _, r := range records {
		if r.ID != id {
			filtered = append(filtered, r)
		}
	}
	if len(filtered) == len(records) {
		return fmt.Errorf("storage: connection %q not found", id)
	}
	return s.persist(filtered)
}

// load reads and parses the JSON store file. Returns an empty slice if the file
// does not exist yet.
func (s *Store) load() ([]Record, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return []Record{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("storage: read store: %w", err)
	}
	var records []Record
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, fmt.Errorf("storage: parse store: %w", err)
	}
	return records, nil
}

// persist writes records to the JSON store file atomically via a temp file.
func (s *Store) persist(records []Record) error {
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return fmt.Errorf("storage: marshal records: %w", err)
	}

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("storage: write temp store: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("storage: atomic rename store: %w", err)
	}
	return nil
}
