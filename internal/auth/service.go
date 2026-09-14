package auth

import (
	"context"
	"fmt"
)

// Service provides authentication operations for the HTTP layer.
type Service struct {
	store *Store
	jwt   *JWTManager
}

// NewService creates an auth Service wired with the given store and JWT manager.
func NewService(store *Store, jwt *JWTManager) *Service {
	return &Service{store: store, jwt: jwt}
}

// Login validates credentials and returns a signed JWT on success.
func (s *Service) Login(ctx context.Context, username, password string) (token string, user *User, err error) {
	u, err := s.store.GetByUsername(ctx, username)
	if err != nil {
		return "", nil, fmt.Errorf("invalid credentials")
	}
	if err := CheckPassword(password, u.PasswordHash); err != nil {
		return "", nil, fmt.Errorf("invalid credentials")
	}
	t, err := s.jwt.GenerateToken(u)
	if err != nil {
		return "", nil, fmt.Errorf("generate token: %w", err)
	}
	return t, u, nil
}

// ValidateToken validates a JWT string and returns its claims.
func (s *Service) ValidateToken(tokenStr string) (*Claims, error) {
	return s.jwt.ValidateToken(tokenStr)
}

// ChangePassword verifies oldPassword against the current hash, then stores the
// new bcrypt hash. When changing one's own password, oldPassword is required and verified.
// An admin resetting another user's password may pass an empty oldPassword to force-reset.
func (s *Service) ChangePassword(ctx context.Context, callerID string, callerRole Role, targetUserID, oldPassword, newPassword string) error {
	u, err := s.store.GetByID(ctx, targetUserID)
	if err != nil {
		return fmt.Errorf("user not found")
	}

	isSelf := callerID != "" && callerID == targetUserID

	// Verify oldPassword if:
	// 1. Caller is changing their own password (self)
	// 2. Caller is not an admin
	// 3. Any non-empty oldPassword was provided
	if isSelf || callerRole != RoleAdmin || oldPassword != "" {
		if oldPassword == "" {
			return fmt.Errorf("current password is required")
		}
		if err := CheckPassword(oldPassword, u.PasswordHash); err != nil {
			return fmt.Errorf("current password is incorrect")
		}
	}

	if len(newPassword) < 6 {
		return fmt.Errorf("new password must be at least 6 characters")
	}
	hash, err := HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	return s.store.UpdatePassword(ctx, targetUserID, hash)
}

// CreateUser creates a new user. Caller must have Admin role.
func (s *Service) CreateUser(ctx context.Context, username, password string, role Role) (*User, error) {
	if len(username) < 2 {
		return nil, fmt.Errorf("username must be at least 2 characters")
	}
	if len(password) < 6 {
		return nil, fmt.Errorf("password must be at least 6 characters")
	}
	return s.store.CreateUser(ctx, username, password, role)
}

// ListUsers returns all users.
func (s *Service) ListUsers(ctx context.Context) ([]User, error) {
	return s.store.ListUsers(ctx)
}

// DeleteUser removes a user by ID.
func (s *Service) DeleteUser(ctx context.Context, id string) error {
	return s.store.DeleteUser(ctx, id)
}

// IsDefaultPassword reports whether the user still has the bootstrap password.
func (s *Service) IsDefaultPassword(ctx context.Context, userID string) bool {
	return s.store.IsDefaultPassword(ctx, userID)
}

// GetByID returns a user by ID.
func (s *Service) GetByID(ctx context.Context, id string) (*User, error) {
	return s.store.GetByID(ctx, id)
}
