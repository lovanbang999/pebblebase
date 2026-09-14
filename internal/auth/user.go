// Package auth defines the core user domain types for Pebblebase authentication.
package auth

import "time"

// Role represents the permission level of a user.
type Role string

const (
	// RoleAdmin grants full access to all features and user management.
	RoleAdmin Role = "admin"
	// RoleViewer grants read-only access; mutations are blocked at the API layer.
	RoleViewer Role = "viewer"
)

// User is a Pebblebase studio user.
// PasswordHash is never serialised into JSON responses.
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         Role      `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
