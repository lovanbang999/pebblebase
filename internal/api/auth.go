package api

import (
	"fmt"
	"net/http"
	"strconv"

	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
)

// loginRequest is the body for POST /api/auth/login.
type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// loginResponse is the successful login payload.
type loginResponse struct {
	Token             string     `json:"token"`
	User              *auth.User `json:"user"`
	IsDefaultPassword bool       `json:"is_default_password"`
}

// createUserRequest is the body for POST /api/auth/users.
type createUserRequest struct {
	Username string    `json:"username"`
	Password string    `json:"password"`
	Role     auth.Role `json:"role"`
}

// changePasswordRequest is the body for PATCH /api/auth/users/:id/password.
type changePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// POST /api/auth/login
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	token, user, err := s.authSvc.Login(r.Context(), req.Username, req.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	if s.auditLog != nil {
		s.auditLog.Log(r.Context(), user.ID, user.Username, audit.ActionLogin, "", "login", audit.IPFromRequest(r))
	}

	isDefault := s.authSvc.IsDefaultPassword(r.Context(), user.ID)
	writeJSON(w, http.StatusOK, loginResponse{
		Token:             token,
		User:              user,
		IsDefaultPassword: isDefault,
	})
}

// POST /api/auth/logout
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// JWT is stateless; client simply discards the token.
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

// GET /api/auth/me
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	user, err := s.authSvc.GetByID(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	isDefault := s.authSvc.IsDefaultPassword(r.Context(), user.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"user":               user,
		"is_default_password": isDefault,
	})
}

// GET /api/auth/users — Admin only
func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireAdmin(w, r) {
		return
	}
	users, err := s.authSvc.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("list users: %v", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

// POST /api/auth/users — Admin only
func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireAdmin(w, r) {
		return
	}
	var req createUserRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Role == "" {
		req.Role = auth.RoleViewer
	}
	user, err := s.authSvc.CreateUser(r.Context(), req.Username, req.Password, req.Role)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

// DELETE /api/auth/users/{id} — Admin only
func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireAdmin(w, r) {
		return
	}
	id := r.PathValue("id")
	claims := auth.ClaimsFromContext(r.Context())
	if claims != nil && claims.UserID == id {
		writeError(w, http.StatusBadRequest, "cannot delete your own account")
		return
	}
	if err := s.authSvc.DeleteUser(r.Context(), id); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PATCH /api/auth/users/{id}/password — Admin or self
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("id")
	claims := auth.ClaimsFromContext(r.Context())

	// Only admin can change another user's password
	if claims != nil && claims.UserID != targetID && claims.Role != auth.RoleAdmin {
		writeError(w, http.StatusForbidden, "admin role required to change another user's password")
		return
	}

	var req changePasswordRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	callerID := ""
	callerRole := auth.RoleViewer
	if claims != nil {
		callerID = claims.UserID
		callerRole = claims.Role
	}

	if err := s.authSvc.ChangePassword(r.Context(), callerID, callerRole, targetID, req.OldPassword, req.NewPassword); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "password changed"})
}

// GET /api/audit/logs — Admin only
func (s *Server) handleListAuditLogs(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireAdmin(w, r) {
		return
	}

	if s.auditLog == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"entries":     []any{},
			"total_count": 0,
		})
		return
	}

	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	entries, total, err := s.auditLog.List(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("audit log: %v", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"entries":     entries,
		"total_count": total,
	})
}
