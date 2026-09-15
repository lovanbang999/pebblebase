package api

import (
	"net/http"

	"pebblebase/internal/schema"
)

// ERDResponse represents the payload returned by GET /api/connections/{id}/erd.
type ERDResponse struct {
	Tables    []schema.Table    `json:"tables"`
	Relations []schema.Relation `json:"relations"`
}

// getERD handles GET /api/connections/{id}/erd.
// Reuses Introspect() data to return all tables and deduplicated foreign-key relations.
func (s *Server) getERD(w http.ResponseWriter, r *http.Request) {
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

	// Flatten and deduplicate relations across all tables
	seen := make(map[string]bool)
	var relations []schema.Relation

	for _, tbl := range tables {
		for _, rel := range tbl.Relations {
			key := rel.FromTable + "." + rel.FromColumn + "->" + rel.ToTable + "." + rel.ToColumn
			if !seen[key] {
				seen[key] = true
				relations = append(relations, rel)
			}
		}
	}

	if relations == nil {
		relations = []schema.Relation{}
	}
	if tables == nil {
		tables = []schema.Table{}
	}

	writeJSON(w, http.StatusOK, ERDResponse{
		Tables:    tables,
		Relations: relations,
	})
}
