package api

import (
	"net/http"
	"time"

	"pebblebase/internal/connection"
	"pebblebase/internal/storage"
)

// connectionResponse is the public representation of a connection (passwords/encrypted DSN stripped).
type connectionResponse struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	Host         string    `json:"host"`
	Port         string    `json:"port"`
	User         string    `json:"user"`
	DBName       string    `json:"db_name"`
	SavePassword bool      `json:"save_password"`
	CreatedAt    time.Time `json:"created_at"`
}

func toConnectionResponse(r storage.Record) connectionResponse {
	return connectionResponse{
		ID:           r.ID,
		Name:         r.Name,
		Type:         r.Type,
		Host:         r.Host,
		Port:         r.Port,
		User:         r.User,
		DBName:       r.DBName,
		SavePassword: r.SavePassword,
		CreatedAt:    r.CreatedAt,
	}
}

// createConnectionRequest is the JSON body for POST /api/connections.
type createConnectionRequest struct {
	Name         string `json:"name"`
	Type         string `json:"type"` // postgres | mysql | mongodb
	Mode         string `json:"mode"` // form | url
	Host         string `json:"host"`
	Port         string `json:"port"`
	User         string `json:"user"`
	Password     string `json:"password"`
	DBName       string `json:"db_name"`
	RawURL       string `json:"raw_url"`
	SavePassword bool   `json:"save_password"`
}

// createConnection handles POST /api/connections.
// It builds the DSN, verifies connectivity, encrypts the password if requested,
// and persists the connection record.
func (s *Server) createConnection(w http.ResponseWriter, r *http.Request) {
	var req createConnectionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := connection.ConnectionInput{
		Type:         req.Type,
		Mode:         req.Mode,
		Host:         req.Host,
		Port:         req.Port,
		User:         req.User,
		Password:     req.Password,
		DBName:       req.DBName,
		RawURL:       req.RawURL,
		SavePassword: req.SavePassword,
	}

	dsn, err := input.ToDSN()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Verify the connection is actually reachable before saving.
	a, err := openAdapter(r.Context(), req.Type, dsn)
	if err != nil {
		writeError(w, http.StatusBadGateway, "cannot connect to database: "+err.Error())
		return
	}

	rec, err := s.store.Save(req.Name, req.Type, req.Host, req.Port, req.User, req.DBName, dsn, req.SavePassword)
	if err != nil {
		a.Close()
		writeError(w, http.StatusInternalServerError, "save connection: "+err.Error())
		return
	}

	// Cache the open adapter so subsequent requests reuse the live connection.
	s.cache.set(rec.ID, a)

	writeJSON(w, http.StatusCreated, toConnectionResponse(rec))
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

	input := connection.ConnectionInput{
		Type:         req.Type,
		Mode:         req.Mode,
		Host:         req.Host,
		Port:         req.Port,
		User:         req.User,
		Password:     req.Password,
		DBName:       req.DBName,
		RawURL:       req.RawURL,
		SavePassword: req.SavePassword,
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

