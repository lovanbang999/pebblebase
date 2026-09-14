package api_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"pebblebase/internal/api"
	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
	"pebblebase/internal/storage"
	_ "modernc.org/sqlite"
)

type testAuthEnv struct {
	mux        *http.ServeMux
	store      *storage.Store
	authSvc    *auth.Service
	auditLog   *audit.Logger
	adminToken string
}

func setupAuthTestServer(t *testing.T) *testAuthEnv {
	t.Helper()
	dir, err := os.MkdirTemp("", "pebblebase-auth-test-*")
	if err != nil {
		t.Fatalf("MkdirTemp: %v", err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	enc, err := storage.NewEncryptor([]byte("01234567890123456789012345678901"))
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}

	store, err := storage.NewStore(dir, enc)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	// SQLite for auth & audit
	authDB, err := sql.Open("sqlite", filepath.Join(dir, "auth_metadata.db"))
	if err != nil {
		t.Fatalf("open auth db: %v", err)
	}
	t.Cleanup(func() { authDB.Close() })

	authStore, err := auth.NewStore(authDB)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	jwtMgr := auth.NewJWTManager([]byte("test-signing-secret-at-least-32-chars-long"))
	authSvc := auth.NewService(authStore, jwtMgr)

	auditLog, err := audit.NewLogger(authDB)
	if err != nil {
		t.Fatalf("NewLogger: %v", err)
	}

	mux := http.NewServeMux()
	srv := api.NewServer(store, enc, authSvc, auditLog, true)
	srv.RegisterRoutes(mux)

	// Obtain admin token
	token, _, err := authSvc.Login(context.Background(), "admin", "pebblebase")
	if err != nil {
		t.Fatalf("admin login: %v", err)
	}

	return &testAuthEnv{
		mux:        mux,
		store:      store,
		authSvc:    authSvc,
		auditLog:   auditLog,
		adminToken: token,
	}
}

func TestAuthLogin(t *testing.T) {
	env := setupAuthTestServer(t)

	// Valid login
	body, _ := json.Marshal(map[string]string{
		"username": "admin",
		"password": "pebblebase",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp["token"] == "" {
		t.Errorf("expected non-empty token")
	}
	if resp["is_default_password"] != true {
		t.Errorf("expected is_default_password to be true")
	}

	// Invalid login
	body, _ = json.Marshal(map[string]string{
		"username": "admin",
		"password": "wrongpassword",
	})
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong password, got %d", rec.Code)
	}
}

func TestAuthMe(t *testing.T) {
	env := setupAuthTestServer(t)

	// Without token -> 401
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rec := httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without token, got %d", rec.Code)
	}

	// With admin token -> 200
	req = httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with admin token, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	json.Unmarshal(rec.Body.Bytes(), &resp)
	userMap, ok := resp["user"].(map[string]any)
	if !ok || userMap["username"] != "admin" {
		t.Errorf("unexpected me user: %+v", resp["user"])
	}
}

func TestUserManagementAndRBAC(t *testing.T) {
	env := setupAuthTestServer(t)

	// 1. Admin creates a viewer user
	createBody, _ := json.Marshal(map[string]any{
		"username": "viewer1",
		"password": "viewerpass123",
		"role":     "viewer",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/users", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec := httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("create user failed: %d: %s", rec.Code, rec.Body.String())
	}
	var createdUser map[string]any
	json.Unmarshal(rec.Body.Bytes(), &createdUser)
	viewerID := createdUser["id"].(string)

	// 2. Viewer logs in and gets viewer token
	viewerToken, _, err := env.authSvc.Login(context.Background(), "viewer1", "viewerpass123")
	if err != nil {
		t.Fatalf("viewer login failed: %v", err)
	}

	// 3. Viewer attempts to access GET /api/auth/users (Admin only) -> 403
	req = httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when viewer accesses /api/auth/users, got %d", rec.Code)
	}

	// 4. Admin accesses GET /api/auth/users -> 200 with 2 users
	req = httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("admin list users failed: %d", rec.Code)
	}
	var listResp map[string]any
	json.Unmarshal(rec.Body.Bytes(), &listResp)
	usersList := listResp["users"].([]any)
	if len(usersList) != 2 {
		t.Errorf("expected 2 users, got %d", len(usersList))
	}

	// 5. Viewer attempts to create connection -> 403 Forbidden
	connBody, _ := json.Marshal(map[string]any{
		"name": "Viewer SQLite",
		"type": "sqlite",
		"host": ":memory:",
	})
	req = httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(connBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when viewer tries POST /api/connections, got %d: %s", rec.Code, rec.Body.String())
	}

	// 6. Viewer attempts to access audit logs -> 403 Forbidden
	req = httptest.NewRequest(http.MethodGet, "/api/audit/logs", nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when viewer accesses audit logs, got %d", rec.Code)
	}

	// 7. Admin accesses audit logs -> 200 OK
	req = httptest.NewRequest(http.MethodGet, "/api/audit/logs", nil)
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("admin list audit logs failed: %d: %s", rec.Code, rec.Body.String())
	}

	// 8. Admin cannot delete own account -> 400
	claims, _ := env.authSvc.ValidateToken(env.adminToken)
	req = httptest.NewRequest(http.MethodDelete, "/api/auth/users/"+claims.UserID, nil)
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 when admin deletes self, got %d", rec.Code)
	}

	// 9. Admin deletes viewer user -> 204
	req = httptest.NewRequest(http.MethodDelete, "/api/auth/users/"+viewerID, nil)
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete user failed: %d: %s", rec.Code, rec.Body.String())
	}
}
