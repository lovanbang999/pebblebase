// Package storage handles encrypted persistence of connection records.
package storage

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// Encryptor performs AES-256-GCM authenticated encryption.
// The key must be exactly 32 bytes.
type Encryptor struct {
	key []byte
}

// NewEncryptor creates an Encryptor from a 32-byte key.
func NewEncryptor(key []byte) (*Encryptor, error) {
	if len(key) != 32 {
		return nil, errors.New("storage: encryption key must be exactly 32 bytes")
	}
	// Copy to prevent external mutation.
	k := make([]byte, 32)
	copy(k, key)
	return &Encryptor{key: k}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM and returns a base64-encoded
// string containing the nonce prepended to the ciphertext.
func (e *Encryptor) Encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("storage: create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("storage: create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("storage: generate nonce: %w", err)
	}

	// Seal appends encrypted+authenticated ciphertext to nonce.
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decodes a base64 string produced by Encrypt and returns the original plaintext.
func (e *Encryptor) Decrypt(encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("storage: base64 decode: %w", err)
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("storage: create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("storage: create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("storage: ciphertext too short")
	}
	nonce, ct := data[:nonceSize], data[nonceSize:]

	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("storage: decrypt: %w", err)
	}
	return string(plain), nil
}
