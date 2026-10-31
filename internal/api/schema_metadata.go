package api

import (
	"context"
	"net/http"
	"pebblebase/internal/catalog"
	"time"
)

func (s *Server) getSchemaMetadata(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	id := r.PathValue("id")
	rec, err := s.store.Get(id)
	if err != nil {
		writeError(w, 404, "connection not found")
		return
	}
	source, err := s.getAdapter(ctx, id)
	if err != nil {
		writeError(w, 502, "schema connection unavailable")
		return
	}
	metadata, err := catalog.Read(ctx, source, r.URL.Query().Get("table"))
	if err != nil {
		writeError(w, 502, "schema catalog lookup failed")
		return
	}
	if selected := r.URL.Query().Get("table"); selected != "" {
		found := false
		for _, table := range metadata.Tables {
			if table.Name == selected {
				found = true
			}
		}
		if !found {
			writeError(w, 404, "table not found")
			return
		}
	}
	writeJSON(w, http.StatusOK, struct {
		catalog.Metadata
		Engine string `json:"engine"`
	}{metadata, rec.Type})
}
