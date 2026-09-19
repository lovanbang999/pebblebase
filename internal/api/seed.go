package api

import (
	"fmt"
	"net/http"

	"pebblebase/internal/seeder"
)

// SeedRequest represents the request body for POST /api/connections/{id}/seed.
type SeedRequest struct {
	Table string `json:"table"`
	Count int    `json:"count"`
}

// SeedResponse represents the response body for POST /api/connections/{id}/seed.
type SeedResponse struct {
	Table        string   `json:"table"`
	Count        int      `json:"count"`
	TablesSeeded []string `json:"tables_seeded"`
	SQL          string   `json:"sql"`
}

// generateSeedSQL handles POST /api/connections/{id}/seed.
// Generates realistic INSERT SQL fixture statements respecting FK dependency order.
func (s *Server) generateSeedSQL(w http.ResponseWriter, r *http.Request) {
	connID := r.PathValue("id")
	if connID == "" {
		writeError(w, http.StatusBadRequest, "connection ID is required")
		return
	}

	var req SeedRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Table == "" {
		writeError(w, http.StatusBadRequest, "table is required")
		return
	}

	if req.Count <= 0 {
		req.Count = 10
	}
	if req.Count > 500 {
		req.Count = 500
	}

	conn, err := s.store.Get(connID)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("connection %q not found", connID))
		return
	}

	if conn.Type == "mongodb" {
		writeError(w, http.StatusBadRequest, "relational SQL seed generation is not supported for MongoDB connections")
		return
	}

	a, err := s.getAdapter(r.Context(), connID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to get adapter: %v", err))
		return
	}

	tables, err := a.Introspect(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("introspect: %v", err))
		return
	}

	orderedTables, err := seeder.ResolveDependencies(tables, req.Table)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("resolve dependencies: %v", err))
		return
	}

	sqlStr, tablesSeeded, err := seeder.GenerateSeedSQL(orderedTables, req.Table, req.Count, string(conn.Type))
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("generate seed SQL: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, SeedResponse{
		Table:        req.Table,
		Count:        req.Count,
		TablesSeeded: tablesSeeded,
		SQL:          sqlStr,
	})
}
