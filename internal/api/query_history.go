package api

import (
	"fmt"
	"net/http"
	"strconv"

	"pebblebase/internal/audit"
)

// handleQueryHistory serves GET /api/connections/{id}/query-history.
// Returns paginated query_execute audit entries for the given connection,
// with optional full-text search over the SQL detail field.
// Query params:
//
//	search  — partial-match filter applied to the SQL text (detail column)
//	limit   — max rows to return (default 50, max 200)
//	offset  — pagination offset (default 0)
func (s *Server) handleQueryHistory(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if s.auditLog == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"entries":     []audit.Entry{},
			"total_count": 0,
		})
		return
	}

	// Resolve the connection name used as the audit log `resource` field.
	rec, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("connection %q not found", id))
		return
	}

	search := r.URL.Query().Get("search")

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			if v > 200 {
				v = 200
			}
			limit = v
		}
	}
	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	entries, total, err := s.auditLog.ListQueryHistory(r.Context(), rec.Name, search, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("query history: %v", err))
		return
	}

	if entries == nil {
		entries = []audit.Entry{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"entries":     entries,
		"total_count": total,
	})
}
