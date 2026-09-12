package api

import (
	"net/http"
)

// listTables handles GET /api/connections/{id}/tables.
// Calls Introspect() on the adapter and returns all tables with their columns and relations.
func (s *Server) listTables(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	tables, err := a.Introspect(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "introspect: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, tables)
}
