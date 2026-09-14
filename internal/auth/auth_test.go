package auth_test

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"

	"pebblebase/internal/auth"
	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestBcrypt(t *testing.T) {
	pass := "super-secret-password"
	hash, err := auth.HashPassword(pass)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == pass {
		t.Errorf("expected hash to differ from password")
	}

	if err := auth.CheckPassword(pass, hash); err != nil {
		t.Errorf("CheckPassword failed with correct password: %v", err)
	}

	if err := auth.CheckPassword("wrong-password", hash); err == nil {
		t.Errorf("expected CheckPassword to fail with wrong password")
	}
}

func TestJWTManager(t *testing.T) {
	secret := []byte("test-jwt-secret-key-at-least-32-chars-long")
	mgr := auth.NewJWTManager(secret)

	user := &auth.User{
		ID:       "user-123",
		Username: "alice",
		Role:     auth.RoleAdmin,
	}

	token, err := mgr.GenerateToken(user)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	if token == "" {
		t.Fatalf("expected non-empty token")
	}

	claims, err := mgr.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}
	if claims.UserID != user.ID {
		t.Errorf("expected UserID %q, got %q", user.ID, claims.UserID)
	}
	if claims.Username != user.Username {
		t.Errorf("expected Username %q, got %q", user.Username, claims.Username)
	}
	if claims.Role != user.Role {
		t.Errorf("expected Role %q, got %q", user.Role, claims.Role)
	}

	// Validate with invalid token
	if _, err := mgr.ValidateToken("invalid.jwt.token"); err == nil {
		t.Errorf("expected error for invalid token string")
	}

	// Validate with different secret
	otherMgr := auth.NewJWTManager([]byte("different-secret-key-32-chars-length"))
	if _, err := otherMgr.ValidateToken(token); err == nil {
		t.Errorf("expected error when validating token with different secret")
	}
}

func TestAuthStore(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	store, err := auth.NewStore(db)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Bootstrap should have created the default admin
	admin, err := store.GetByUsername(ctx, "admin")
	if err != nil {
		t.Fatalf("admin user should exist after bootstrap: %v", err)
	}
	if admin.Role != auth.RoleAdmin {
		t.Errorf("expected role %s, got %s", auth.RoleAdmin, admin.Role)
	}
	if !store.IsDefaultPassword(ctx, admin.ID) {
		t.Errorf("expected IsDefaultPassword to be true for bootstrapped admin")
	}

	// Create a new user
	viewer, err := store.CreateUser(ctx, "bob", "bob-password", auth.RoleViewer)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if viewer.Username != "bob" || viewer.Role != auth.RoleViewer {
		t.Errorf("unexpected user values: %+v", viewer)
	}

	// Duplicate username should fail
	if _, err := store.CreateUser(ctx, "bob", "another-pass", auth.RoleViewer); err == nil {
		t.Errorf("expected error creating duplicate username")
	}

	// ListUsers
	users, err := store.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers failed: %v", err)
	}
	if len(users) != 2 {
		t.Fatalf("expected 2 users, got %d", len(users))
	}

	// GetByID
	fetched, err := store.GetByID(ctx, viewer.ID)
	if err != nil || fetched.Username != "bob" {
		t.Fatalf("GetByID failed: %v", err)
	}

	// UpdatePassword
	newHash, err := auth.HashPassword("new-bob-password")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if err := store.UpdatePassword(ctx, viewer.ID, newHash); err != nil {
		t.Fatalf("UpdatePassword failed: %v", err)
	}
	updated, _ := store.GetByID(ctx, viewer.ID)
	if err := auth.CheckPassword("new-bob-password", updated.PasswordHash); err != nil {
		t.Errorf("new password verification failed: %v", err)
	}

	// DeleteUser
	if err := store.DeleteUser(ctx, viewer.ID); err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}
	count, _ := store.CountUsers(ctx)
	if count != 1 {
		t.Errorf("expected 1 user after deletion, got %d", count)
	}
}

func TestAuthService(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	store, err := auth.NewStore(db)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}
	jwtMgr := auth.NewJWTManager([]byte("service-test-jwt-secret-at-least-32-chars"))
	svc := auth.NewService(store, jwtMgr)

	// Login default admin
	token, user, err := svc.Login(ctx, "admin", "pebblebase")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if token == "" || user.Username != "admin" {
		t.Errorf("unexpected login result: token=%q, user=%+v", token, user)
	}

	// Validate token
	claims, err := svc.ValidateToken(token)
	if err != nil || claims.Username != "admin" {
		t.Errorf("ValidateToken failed: %v", err)
	}

	// Login with invalid password
	if _, _, err := svc.Login(ctx, "admin", "wrongpassword"); err == nil {
		t.Errorf("expected error logging in with wrong password")
	}

	// Create user with invalid password length (< 6)
	if _, err := svc.CreateUser(ctx, "charlie", "123", auth.RoleViewer); err == nil {
		t.Errorf("expected error for short password")
	}

	// Create viewer
	u, err := svc.CreateUser(ctx, "charlie", "password123", auth.RoleViewer)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}

	// Change password as self with wrong old password
	if err := svc.ChangePassword(ctx, u.ID, auth.RoleViewer, u.ID, "wrongold", "newpassword123"); err == nil {
		t.Errorf("expected error for incorrect old password")
	}

	// Change password as self with correct old password
	if err := svc.ChangePassword(ctx, u.ID, auth.RoleViewer, u.ID, "password123", "newpassword123"); err != nil {
		t.Fatalf("ChangePassword failed: %v", err)
	}

	// Admin force-reset password for another user (old password not required)
	if err := svc.ChangePassword(ctx, "admin-caller-id", auth.RoleAdmin, u.ID, "", "adminforcedpassword"); err != nil {
		t.Fatalf("Admin ChangePassword failed: %v", err)
	}

	// Admin changing own password with wrong old password must fail
	adminUser, err := store.GetByUsername(ctx, "admin")
	if err != nil {
		t.Fatalf("get admin user: %v", err)
	}
	if err := svc.ChangePassword(ctx, adminUser.ID, auth.RoleAdmin, adminUser.ID, "wrongpass", "newadminpass123"); err == nil {
		t.Errorf("expected error when admin changes own password with wrong old password")
	}

	// Admin changing own password with correct old password must succeed
	if err := svc.ChangePassword(ctx, adminUser.ID, auth.RoleAdmin, adminUser.ID, "pebblebase", "newadminpass123"); err != nil {
		t.Fatalf("Admin ChangePassword with correct old password failed: %v", err)
	}
}

func TestAuthMiddlewareAndGuards(t *testing.T) {
	db := setupTestDB(t)
	store, _ := auth.NewStore(db)
	jwtMgr := auth.NewJWTManager([]byte("middleware-test-jwt-secret-32-chars-long"))
	svc := auth.NewService(store, jwtMgr)

	ctx := context.Background()
	adminToken, _, _ := svc.Login(ctx, "admin", "pebblebase")
	viewer, _ := svc.CreateUser(ctx, "dave", "viewerpass", auth.RoleViewer)
	viewerToken, err := jwtMgr.GenerateToken(viewer)
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mw := auth.AuthMiddleware(svc, []string{"/api/auth/login", "/public"})
	protectedHandler := mw(handler)

	// 1. Skip path passes without token
	req := httptest.NewRequest(http.MethodGet, "/public/foo", nil)
	rec := httptest.NewRecorder()
	protectedHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for skipPath, got %d", rec.Code)
	}

	// 2. Missing token on protected path returns 401
	req = httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	rec = httptest.NewRecorder()
	protectedHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for missing token, got %d", rec.Code)
	}

	// 3. Invalid token returns 401
	req = httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	rec = httptest.NewRecorder()
	protectedHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for invalid token, got %d", rec.Code)
	}

	// 4. Valid token passes and injects claims
	var capturedClaims *auth.Claims
	inspectHandler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims = auth.ClaimsFromContext(r.Context())
		if auth.IsViewer(r) {
			w.Header().Set("X-Role", "viewer")
		} else {
			w.Header().Set("X-Role", "admin")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req = httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	inspectHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for valid token, got %d", rec.Code)
	}
	if capturedClaims == nil || capturedClaims.Username != "admin" {
		t.Errorf("expected admin claims injected, got %+v", capturedClaims)
	}
	if rec.Header().Get("X-Role") != "admin" {
		t.Errorf("expected admin role header")
	}

	// 5. Viewer token
	req = httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	rec = httptest.NewRecorder()
	inspectHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for valid viewer token, got %d", rec.Code)
	}
	if rec.Header().Get("X-Role") != "viewer" {
		t.Errorf("expected viewer role header")
	}
}
