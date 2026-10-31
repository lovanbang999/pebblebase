package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"pebblebase/internal/audit"
	"pebblebase/internal/connection"
	"pebblebase/internal/storage"
)

// connectionResponse is the public representation of a connection (passwords/encrypted DSN stripped).
type connectionResponse struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	Mode         string    `json:"mode"`
	Host         string    `json:"host"`
	Port         string    `json:"port"`
	User         string    `json:"user"`
	DBName       string    `json:"db_name"`
	Filepath     string    `json:"filepath,omitempty"`
	ReadOnly     bool      `json:"read_only"`
	Environment  string    `json:"environment"`
	SavePassword bool      `json:"save_password"`
	CreatedAt    time.Time `json:"created_at"`
}

func toConnectionResponse(r storage.Record) connectionResponse {
	env := r.Environment
	if env == "" {
		env = "local"
	}
	return connectionResponse{
		ID:           r.ID,
		Name:         r.Name,
		Type:         r.Type,
		Mode:         r.Mode,
		Host:         r.Host,
		Port:         r.Port,
		User:         r.User,
		DBName:       r.DBName,
		Filepath:     r.Filepath,
		ReadOnly:     r.ReadOnly,
		Environment:  env,
		SavePassword: r.SavePassword,
		CreatedAt:    r.CreatedAt,
	}
}

// createConnectionRequest is the JSON body for POST /api/connections.
type createConnectionRequest struct {
	WorkspaceID         string `json:"workspace_id,omitempty"`
	Name                string `json:"name"`
	Type                string `json:"type"` // postgres | mysql | mongodb | sqlite
	Mode                string `json:"mode"` // form | url
	Host                string `json:"host"`
	Port                string `json:"port"`
	User                string `json:"user"`
	Password            string `json:"password"`
	DBName              string `json:"db_name"`
	Filepath            string `json:"filepath,omitempty"`
	ReadOnly            bool   `json:"read_only"`
	Environment         string `json:"environment,omitempty"`
	RawURL              string `json:"raw_url"`
	SavePassword        bool   `json:"save_password"`
	SSLMode             string `json:"ssl_mode,omitempty"`
	WindowsAuth         bool   `json:"windows_auth,omitempty"`
	ConnectionID        string `json:"connection_id,omitempty"`
	PreserveExistingDSN bool   `json:"preserve_existing_dsn,omitempty"`
}

// createConnection handles POST /api/connections.
// It builds the DSN, verifies connectivity, encrypts the password if requested,
// and persists the connection record.
func (s *Server) createConnection(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	var req createConnectionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Type == "sqlite" {
		fp := req.Filepath
		if fp == "" {
			fp = req.DBName
		}
		if req.Mode == "url" && req.RawURL != "" {
			fp = req.RawURL
		}
		var dataDir string
		if s.store != nil {
			dataDir = s.store.DataDir()
		}
		if err := validateSQLitePath(fp, dataDir); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		req.SavePassword = true
	}

	input := connection.ConnectionInput{
		Type:         req.Type,
		Mode:         req.Mode,
		Host:         req.Host,
		Port:         req.Port,
		User:         req.User,
		Password:     req.Password,
		DBName:       req.DBName,
		Filepath:     req.Filepath,
		RawURL:       req.RawURL,
		SavePassword: req.SavePassword,
		ReadOnly:     req.ReadOnly,
		SSLMode:      req.SSLMode,
		WindowsAuth:  req.WindowsAuth,
	}

	dsn, err := input.ToDSN()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.WorkspaceID != "" && req.WorkspaceID != "all" {
		document, err := s.store.Workspaces()
		if err != nil {
			writeError(w, 500, "workspace config unavailable")
			return
		}
		valid := false
		for _, workspace := range document.Workspaces {
			if workspace.ID == req.WorkspaceID {
				valid = true
			}
		}
		if !valid {
			writeError(w, 400, "workspace no longer exists")
			return
		}
	}
	// Verify the connection is actually reachable before saving.
	a, err := openAdapter(r.Context(), req.Type, dsn)
	if err != nil {
		writeError(w, http.StatusBadGateway, "cannot connect to database: "+err.Error())
		return
	}

	rec, err := s.store.Save(
		req.Name, req.Type, req.Host, req.Port, req.User, req.DBName, dsn, req.SavePassword,
		storage.SaveParams{
			Environment: req.Environment,
			Mode:        req.Mode,
			Filepath:    req.Filepath,
			ReadOnly:    req.ReadOnly,
		},
	)
	if err != nil {
		a.Close()
		writeError(w, http.StatusInternalServerError, "save connection: "+err.Error())
		return
	}

	if err := s.store.AddConnectionToWorkspace(rec.ID, req.WorkspaceID); err != nil {
		_ = s.store.Delete(rec.ID)
		_ = a.Close()
		writeError(w, 400, "could not assign connection to workspace")
		return
	}
	// Cache the open adapter so subsequent requests reuse the live connection.
	s.cache.set(rec.ID, a)

	s.logAudit(r, audit.ActionConnectionCreate, rec.Name, rec.Type)

	writeJSON(w, http.StatusCreated, toConnectionResponse(rec))
}

// updateConnection validates and replaces a profile without changing its ID.
// A blank password preserves the encrypted credential when the profile had
// SavePassword enabled. The new adapter is opened before the record is changed.
func (s *Server) updateConnection(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}
	id := r.PathValue("id")
	previous, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	var req createConnectionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Type != previous.Type {
		writeError(w, http.StatusBadRequest, "database type cannot be changed for an existing connection")
		return
	}
	if req.Type == "sqlite" {
		fp := req.Filepath
		if fp == "" {
			fp = req.DBName
		}
		if req.Mode == "url" && req.RawURL != "" {
			fp = req.RawURL
		}
		if err := validateSQLitePath(fp, s.store.DataDir()); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		req.SavePassword = true
	}
	if req.Password == "" && previous.SavePassword {
		oldDSN, err := s.store.DSN(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "read saved connection credential: "+err.Error())
			return
		}
		if req.Mode == "url" && strings.TrimSpace(req.RawURL) == "" && (req.PreserveExistingDSN || previous.Mode == "url") {
			// URL-mode secrets and options cannot be reconstructed from the public profile.
			if req.Type != previous.Type {
				writeError(w, http.StatusBadRequest, "enter a replacement connection URL when changing the database type")
				return
			}
			oldAdapter, openErr := openAdapter(r.Context(), previous.Type, oldDSN)
			if openErr != nil {
				writeError(w, http.StatusBadGateway, "cannot connect with the saved connection URL: "+openErr.Error())
				return
			}
			updated, saveErr := s.store.Update(id, storage.Record{
				Name: req.Name, Type: previous.Type, Mode: "url", Host: previous.Host, Port: previous.Port,
				User: previous.User, DBName: previous.DBName, Filepath: previous.Filepath,
				ReadOnly: req.ReadOnly, SavePassword: req.SavePassword, Environment: req.Environment,
			}, oldDSN)
			if saveErr != nil {
				oldAdapter.Close()
				writeError(w, http.StatusInternalServerError, "update connection: "+saveErr.Error())
				return
			}
			s.cache.set(id, oldAdapter)
			s.logAudit(r, audit.ActionConnectionUpdate, updated.Name, updated.Type)
			writeJSON(w, http.StatusOK, toConnectionResponse(updated))
			return
		}
		password, passErr := connection.PasswordFromDSN(previous.Type, oldDSN)
		if passErr != nil {
			writeError(w, http.StatusBadRequest, "cannot preserve the saved password for this connection type; enter it again")
			return
		}
		req.Password = password
	}
	input := connection.ConnectionInput{
		Type: req.Type, Mode: req.Mode, Host: req.Host, Port: req.Port,
		User: req.User, Password: req.Password, DBName: req.DBName,
		Filepath: req.Filepath, RawURL: req.RawURL, SavePassword: req.SavePassword,
		ReadOnly: req.ReadOnly, SSLMode: req.SSLMode, WindowsAuth: req.WindowsAuth,
	}
	dsn, err := input.ToDSN()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	a, err := openAdapter(r.Context(), req.Type, dsn)
	if err != nil {
		writeError(w, http.StatusBadGateway, "cannot connect to database: "+err.Error())
		return
	}
	updated, err := s.store.Update(id, storage.Record{
		Name: req.Name, Type: req.Type, Mode: req.Mode, Host: req.Host, Port: req.Port, User: req.User,
		DBName: req.DBName, Filepath: req.Filepath, ReadOnly: req.ReadOnly,
		SavePassword: req.SavePassword, Environment: req.Environment,
	}, dsn)
	if err != nil {
		a.Close()
		writeError(w, http.StatusInternalServerError, "update connection: "+err.Error())
		return
	}
	s.cache.set(id, a)
	s.logAudit(r, audit.ActionConnectionUpdate, updated.Name, updated.Type)
	writeJSON(w, http.StatusOK, toConnectionResponse(updated))
}

// listConnections handles GET /api/connections.
// Passwords and encrypted DSNs are never included in the response.
func (s *Server) listConnections(w http.ResponseWriter, r *http.Request) {
	records, err := s.store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	resps := make([]connectionResponse, 0, len(records))
	for _, rec := range records {
		resps = append(resps, toConnectionResponse(rec))
	}
	writeJSON(w, http.StatusOK, resps)
}

// deleteConnection handles DELETE /api/connections/{id}.
func (s *Server) deleteConnection(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	id := r.PathValue("id")

	s.cache.delete(id) // close adapter if open

	if err := s.store.Delete(id); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// pingConnection handles POST /api/connections/{id}/ping.
// Useful for the UI "Test Connection" button after a connection is saved.
func (s *Server) pingConnection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	if err := a.Ping(r.Context()); err != nil {
		writeError(w, http.StatusBadGateway, "ping failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// testConnection handles POST /api/connections/test.
// Tests the connection with given parameters without persisting it.
func (s *Server) testConnection(w http.ResponseWriter, r *http.Request) {
	var req createConnectionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Type == "sqlite" {
		fp := req.Filepath
		if fp == "" {
			fp = req.DBName
		}
		if req.Mode == "url" && req.RawURL != "" {
			fp = req.RawURL
		}
		var dataDir string
		if s.store != nil {
			dataDir = s.store.DataDir()
		}
		if err := validateSQLitePath(fp, dataDir); err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
	}
	if req.ConnectionID != "" && req.Password == "" {
		previous, getErr := s.store.Get(req.ConnectionID)
		if getErr == nil && previous.SavePassword {
			oldDSN, dsnErr := s.store.DSN(req.ConnectionID)
			if dsnErr == nil && req.Mode == "url" && strings.TrimSpace(req.RawURL) == "" && (req.PreserveExistingDSN || previous.Mode == "url") {
				a, openErr := openAdapter(r.Context(), previous.Type, oldDSN)
				if openErr != nil {
					writeError(w, http.StatusBadGateway, "cannot connect with the saved connection URL: "+openErr.Error())
					return
				}
				defer a.Close()
				if pingErr := a.Ping(r.Context()); pingErr != nil {
					writeError(w, http.StatusBadGateway, "ping failed: "+pingErr.Error())
					return
				}
				writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
				return
			}
			if dsnErr == nil && (req.Mode != "url" || strings.TrimSpace(req.RawURL) == "") {
				if password, passErr := connection.PasswordFromDSN(previous.Type, oldDSN); passErr == nil {
					req.Password = password
				}
			}
		}
	}

	input := connection.ConnectionInput{
		Type:         req.Type,
		Mode:         req.Mode,
		Host:         req.Host,
		Port:         req.Port,
		User:         req.User,
		Password:     req.Password,
		DBName:       req.DBName,
		Filepath:     req.Filepath,
		RawURL:       req.RawURL,
		SavePassword: req.SavePassword,
		ReadOnly:     req.ReadOnly,
		SSLMode:      req.SSLMode,
		WindowsAuth:  req.WindowsAuth,
	}

	dsn, err := input.ToDSN()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	a, err := openAdapter(r.Context(), req.Type, dsn)
	if err != nil {
		writeError(w, http.StatusBadGateway, "cannot connect to database: "+err.Error())
		return
	}
	defer a.Close()

	if err := a.Ping(r.Context()); err != nil {
		writeError(w, http.StatusBadGateway, "ping failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// validateSQLitePath ensures a SQLite file path does not point to internal
// Pebblebase system databases (meta.db, .master.key, etc.) or sensitive system files.
func validateSQLitePath(rawPath, dataDir string) error {
	trimmed := strings.TrimSpace(rawPath)
	if trimmed == "" {
		return fmt.Errorf("file path is required for sqlite connections")
	}

	cleanPath := strings.TrimPrefix(trimmed, "file:")
	if idx := strings.Index(cleanPath, "?"); idx != -1 {
		cleanPath = cleanPath[:idx]
	}
	cleanPath = strings.TrimSpace(cleanPath)

	// In-memory sqlite is safe
	if cleanPath == ":memory:" || strings.HasPrefix(cleanPath, ":memory:") {
		return nil
	}

	baseName := strings.ToLower(filepath.Base(cleanPath))
	blockedFiles := map[string]bool{
		"meta.db":          true,
		".master.key":      true,
		".jwt.secret":      true,
		"connections.json": true,
		"shadow":           true,
		"passwd":           true,
		"sudoers":          true,
	}
	if blockedFiles[baseName] {
		return fmt.Errorf("access to internal or sensitive file %q is forbidden", baseName)
	}

	// Resolve absolute path and ensure it's not inside dataDir
	absTarget, err := filepath.Abs(cleanPath)
	if err == nil && dataDir != "" {
		absDataDir, errDir := filepath.Abs(dataDir)
		if errDir == nil {
			rel, errRel := filepath.Rel(absDataDir, absTarget)
			if errRel == nil && !strings.HasPrefix(rel, "..") && rel != "." {
				return fmt.Errorf("access to internal Pebblebase data directory is forbidden")
			}
		}
	}

	return nil
}
