package api

import (
	"net/http"
	"pebblebase/internal/storage"
)

func (s *Server) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	document, err := s.store.Workspaces()
	if err != nil {
		writeError(w, 500, "workspace config unavailable")
		return
	}
	writeJSON(w, 200, document)
}
func (s *Server) saveWorkspaces(w http.ResponseWriter, r *http.Request) {
	var document storage.WorkspaceDocument
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if decodeBody(r, &document) != nil {
		writeError(w, 400, "invalid workspace config")
		return
	}
	if err := s.store.SaveWorkspaces(document); err != nil {
		writeError(w, 400, "invalid workspace config: "+err.Error())
		return
	}
	writeJSON(w, 200, document)
}
