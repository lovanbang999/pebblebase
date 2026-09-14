package auth

import "context"

// Authenticator defines the contract for authentication and user management operations.
type Authenticator interface {
	CreateUser(ctx context.Context, username, password string, role Role) (*User, error)
	Login(ctx context.Context, username, password string) (token string, user *User, err error)
	ValidateToken(tokenStr string) (*Claims, error)
	ListUsers(ctx context.Context) ([]User, error)
	DeleteUser(ctx context.Context, userID string) error
	ChangePassword(ctx context.Context, callerID string, callerRole Role, targetUserID, oldPassword, newPassword string) error
}

// Ensure Service implements Authenticator at compile time.
var _ Authenticator = (*Service)(nil)
