package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"pebblebase/internal/adapter"
)

// TableDDLResponse contains the table DDL script and parsed index definitions.
type TableDDLResponse struct {
	Table   string              `json:"table"`
	Engine  string              `json:"engine"`
	DDL     string              `json:"ddl"`
	Indexes []adapter.IndexInfo `json:"indexes"`
}

// getTableDDL returns the table creation DDL statement and indexes for a given table.
// Route: GET /api/connections/{id}/tables/{table}/ddl
func (s *Server) getTableDDL(w http.ResponseWriter, r *http.Request) {
	connID := r.PathValue("id")
	tableName := r.PathValue("table")

	if connID == "" || tableName == "" {
		writeError(w, http.StatusBadRequest, "connection ID and table name are required")
		return
	}

	conn, err := s.store.Get(connID)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("connection %q not found", connID))
		return
	}

	a, err := s.getAdapter(r.Context(), connID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to get adapter: %v", err))
		return
	}

	provider, ok := a.(adapter.DDLProvider)
	if !ok {
		writeError(w, http.StatusNotImplemented, fmt.Sprintf("DDL generation not supported for engine %q", conn.Type))
		return
	}

	ddl, err := provider.GetTableDDL(r.Context(), tableName)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("failed to get DDL for table %q: %v", tableName, err))
		return
	}

	indexes, err := provider.GetTableIndexes(r.Context(), tableName)
	if err != nil {
		indexes = []adapter.IndexInfo{}
	}

	resp := TableDDLResponse{
		Table:   tableName,
		Engine:  string(conn.Type),
		DDL:     ddl,
		Indexes: indexes,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
