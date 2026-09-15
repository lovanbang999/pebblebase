package api

import (
	"fmt"
	"net/http"

	"pebblebase/internal/auth"
	"pebblebase/internal/savedquery"
)

// listSavedQueries handles GET /api/connections/{id}/saved-queries
// Supports optional ?tag= and ?search= query parameters.
func (s *Server) listSavedQueries(w http.ResponseWriter, r *http.Request) {
	connID := r.PathValue("id")
	if connID == "" {
		writeError(w, http.StatusBadRequest, "missing connection id")
		return
	}

	params := savedquery.ListParams{
		Tag:    r.URL.Query().Get("tag"),
		Search: r.URL.Query().Get("search"),
	}

	queries, err := s.querySvc.List(r.Context(), connID, params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("list saved queries: %v", err))
		return
	}
	writeJSON(w, http.StatusOK, queries)
}

// createSavedQueryRequest is the JSON body for POST /api/connections/{id}/saved-queries.
type createSavedQueryRequest struct {
	Title      string   `json:"title"`
	Query      string   `json:"query"`
	Tags       []string `json:"tags"`
	IsFavorite bool     `json:"is_favorite"`
}

// createSavedQuery handles POST /api/connections/{id}/saved-queries.
func (s *Server) createSavedQuery(w http.ResponseWriter, r *http.Request) {
	connID := r.PathValue("id")
	if connID == "" {
		writeError(w, http.StatusBadRequest, "missing connection id")
		return
	}

	var req createSavedQueryRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Query == "" {
		writeError(w, http.StatusBadRequest, "query is required")
		return
	}

	userID := ""
	if claims := auth.ClaimsFromContext(r.Context()); claims != nil {
		userID = claims.UserID
	}

	sq, err := s.querySvc.Create(r.Context(), connID, userID, req.Title, req.Query, req.Tags, req.IsFavorite)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("create saved query: %v", err))
		return
	}
	writeJSON(w, http.StatusCreated, sq)
}

// updateSavedQuery handles PATCH /api/connections/{id}/saved-queries/{qid}.
func (s *Server) updateSavedQuery(w http.ResponseWriter, r *http.Request) {
	qid := r.PathValue("qid")
	if qid == "" {
		writeError(w, http.StatusBadRequest, "missing query id")
		return
	}

	var input savedquery.UpdateInput
	if err := decodeBody(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := s.querySvc.Update(r.Context(), qid, input)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// deleteSavedQuery handles DELETE /api/connections/{id}/saved-queries/{qid}.
func (s *Server) deleteSavedQuery(w http.ResponseWriter, r *http.Request) {
	qid := r.PathValue("qid")
	if qid == "" {
		writeError(w, http.StatusBadRequest, "missing query id")
		return
	}

	if err := s.querySvc.Delete(r.Context(), qid); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// exportSavedQuery handles GET /api/connections/{id}/saved-queries/{qid}/export.
// Returns the query content as a downloadable .sql file.
func (s *Server) exportSavedQuery(w http.ResponseWriter, r *http.Request) {
	qid := r.PathValue("qid")
	if qid == "" {
		writeError(w, http.StatusBadRequest, "missing query id")
		return
	}

	sq, err := s.querySvc.GetByID(r.Context(), qid)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	filename := sanitizeFilename(sq.Title) + ".sql"
	w.Header().Set("Content-Type", "application/sql")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(sq.Query))
}

// sanitizeFilename replaces characters that are unsafe in filenames.
func sanitizeFilename(s string) string {
	result := make([]byte, 0, len(s))
	for _, c := range s {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9',
			c == '-', c == '_', c == '.', c == ' ':
			result = append(result, byte(c))
		default:
			result = append(result, '_')
		}
	}
	if len(result) == 0 {
		return "query"
	}
	return string(result)
}
