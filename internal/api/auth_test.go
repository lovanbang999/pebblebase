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

	_ "modernc.org/sqlite"
	"pebblebase/internal/api"
	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
	"pebblebase/internal/storage"
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
	srv := api.NewServer(store, enc, authSvc, auditLog, nil, nil, nil, true)
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

func TestDeveloperPermissionsActiveRevocationAndLastAdmin(t *testing.T) {
	env := setupAuthTestServer(t)
	create := func(username, role string) (map[string]any, string) {
		body, _ := json.Marshal(map[string]any{"username": username, "password": "developer-pass", "role": role})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/users", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+env.adminToken)
		rec := httptest.NewRecorder()
		env.mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create user: status=%d body=%s", rec.Code, rec.Body.String())
		}
		var user map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &user); err != nil {
			t.Fatal(err)
		}
		return user, user["id"].(string)
	}
	developer, developerID := create("dev-user", "developer")
	if developer["active"] != true {
		t.Fatalf("new account should be active: %+v", developer)
	}
	devToken, _, err := env.authSvc.Login(context.Background(), "dev-user", "developer-pass")
	if err != nil {
		t.Fatal(err)
	}

	// Developer can read workspace data and reaches the data-write handler;
	// management/settings categories are uniformly admin-only.
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/api/workspaces", ""},
		{http.MethodGet, "/api/auth/users", ""},
		{http.MethodPost, "/api/auth/users", `{"username":"blocked","password":"blocked-pass","role":"viewer"}`},
		{http.MethodGet, "/api/audit/logs", ""},
		{http.MethodGet, "/api/ai/config", ""},
		{http.MethodPost, "/api/ai/config", `{}`},
		{http.MethodPost, "/api/connections/test", `{}`},
		{http.MethodPost, "/api/connections", `{"name":"no","type":"sqlite"}`},
		{http.MethodPut, "/api/workspaces", `{}`},
	} {
		req := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(tc.body))
		req.Header.Set("Authorization", "Bearer "+devToken)
		rec := httptest.NewRecorder()
		env.mux.ServeHTTP(rec, req)
		if tc.method == http.MethodGet && tc.path == "/api/workspaces" {
			if rec.Code != http.StatusOK {
				t.Errorf("developer read %s: got %d", tc.path, rec.Code)
			}
		} else if rec.Code != http.StatusForbidden {
			t.Errorf("developer should be blocked from %s %s, got %d: %s", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}
	writeReq := func(token string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/connections/unconfigured/tables/items/rows", bytes.NewBufferString(`{"values":{"name":"x"}}`))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		env.mux.ServeHTTP(rec, req)
		return rec.Code
	}
	if got := writeReq(devToken); got == http.StatusForbidden {
		t.Fatal("Developer was blocked by the Viewer write guard")
	}
	viewer, _ := env.authSvc.CreateUser(context.Background(), "view-user", "viewer-pass", auth.RoleViewer)
	viewerToken, _, _ := env.authSvc.Login(context.Background(), viewer.Username, "viewer-pass")
	if got := writeReq(viewerToken); got != http.StatusForbidden {
		t.Fatalf("Viewer write guard returned %d", got)
	}

	// An Admin cannot remove the last active Admin, through either role or status changes.
	adminClaims, _ := env.authSvc.ValidateToken(env.adminToken)
	for _, patch := range []map[string]any{{"role": "developer", "active": true}, {"role": "admin", "active": false}} {
		body, _ := json.Marshal(patch)
		req := httptest.NewRequest(http.MethodPatch, "/api/auth/users/"+adminClaims.UserID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+env.adminToken)
		rec := httptest.NewRecorder()
		env.mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("last Admin mutation should fail, got %d: %s", rec.Code, rec.Body.String())
		}
	}

	// Role and deactivation audits contain identifiers/actions, never credentials.
	body, _ := json.Marshal(map[string]any{"role": "viewer", "active": true})
	req := httptest.NewRequest(http.MethodPatch, "/api/auth/users/"+developerID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec := httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("change role: %d %s", rec.Code, rec.Body.String())
	}
	entries, _, err := env.auditLog.List(context.Background(), 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	roleAudit := false
	for _, entry := range entries {
		if entry.Action == audit.ActionUserRoleChange {
			roleAudit = true
		}
	}
	if !roleAudit {
		t.Fatal("role change was not audited")
	}

	// Status changes revoke an already-issued JWT on its very next API call.
	body, _ = json.Marshal(map[string]any{"role": "viewer", "active": false})
	req = httptest.NewRequest(http.MethodPatch, "/api/auth/users/"+developerID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("deactivate developer: %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	req.Header.Set("Authorization", "Bearer "+devToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("inactive token should be rejected, got %d", rec.Code)
	}
	if _, _, err := env.authSvc.Login(context.Background(), "dev-user", "developer-pass"); err == nil {
		t.Fatal("inactive account logged in")
	}
}

func TestAdminPasswordResetIsAuditedWithoutSecrets(t *testing.T) {
	env := setupAuthTestServer(t)
	body, _ := json.Marshal(map[string]any{"username": "reset-target", "password": "old-password", "role": "viewer"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec := httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create reset target: %d %s", rec.Code, rec.Body.String())
	}
	var target map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &target)
	newPassword := "new-secret-password"
	resetBody, _ := json.Marshal(map[string]string{"new_password": newPassword})
	req = httptest.NewRequest(http.MethodPatch, "/api/auth/users/"+target["id"].(string)+"/password", bytes.NewReader(resetBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	rec = httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("password reset: %d %s", rec.Code, rec.Body.String())
	}
	if _, _, err := env.authSvc.Login(context.Background(), "reset-target", newPassword); err != nil {
		t.Fatalf("new password should work: %v", err)
	}
	entries, _, err := env.auditLog.List(context.Background(), 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, entry := range entries {
		if entry.Action == audit.ActionPasswordReset {
			found = true
			if bytes.Contains([]byte(entry.Detail), []byte(newPassword)) {
				t.Fatal("audit log contains a password")
			}
		}
	}
	if !found {
		t.Fatal("password reset was not audited")
	}
}
