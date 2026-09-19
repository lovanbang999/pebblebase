package api

import (
	"fmt"
	"net/http"

	"pebblebase/internal/diff"
)

// handleSchemaDiff handles GET /api/diff?from=<connId>&to=<connId>.
// Compares schemas of two connections and generates visual diff and migration SQL.
func (s *Server) handleSchemaDiff(w http.ResponseWriter, r *http.Request) {
	fromID := r.URL.Query().Get("from")
	toID := r.URL.Query().Get("to")

	if fromID == "" || toID == "" {
		writeError(w, http.StatusBadRequest, "both 'from' and 'to' connection query parameters are required")
		return
	}

	if fromID == toID {
		writeError(w, http.StatusBadRequest, "source and target connections must be different")
		return
	}

	fromConn, err := s.store.Get(fromID)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("source connection %q not found", fromID))
		return
	}

	toConn, err := s.store.Get(toID)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("target connection %q not found", toID))
		return
	}

	if fromConn.Type == "mongodb" || toConn.Type == "mongodb" {
		writeError(w, http.StatusBadRequest, "schema diff is only supported for relational databases (PostgreSQL, MySQL, SQLite)")
		return
	}

	fromAdapter, err := s.getAdapter(r.Context(), fromID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to connect to source %q: %v", fromConn.Name, err))
		return
	}

	toAdapter, err := s.getAdapter(r.Context(), toID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to connect to target %q: %v", toConn.Name, err))
		return
	}

	res, err := diff.Compare(r.Context(), fromAdapter, toAdapter, fromConn, toConn)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("schema diff failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, res)
}
