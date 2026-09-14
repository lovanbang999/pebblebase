package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
)

type executeQueryRequest struct {
	Query string `json:"query"`
}

func (s *Server) executeRawQuery(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing connection id")
		return
	}

	var req executeQueryRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body: %v", err))
		return
	}

	trimmedQuery := strings.TrimSpace(req.Query)
	if trimmedQuery == "" {
		writeError(w, http.StatusBadRequest, "query cannot be empty")
		return
	}

	rec, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("connection %q not found", id))
		return
	}

	// Guard against mutating queries when connection is Read-Only or caller is Viewer
	if (rec.ReadOnly || (s.authEnabled && auth.IsViewer(r))) && isMutatingQuery(rec.Type, trimmedQuery) {
		writeError(w, http.StatusForbidden, "read-only mode: mutating queries are forbidden")
		return
	}

	// Apply 30-second execution timeout
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	adapter, err := s.getAdapter(ctx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("get adapter: %v", err))
		return
	}

	result, err := adapter.ExecuteRaw(ctx, trimmedQuery)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.logAudit(r, audit.ActionQueryExecute, rec.Name, trimmedQuery)

	writeJSON(w, http.StatusOK, result)
}

// isMutatingQuery inspects SQL or Mongo commands to identify mutating statements.
func isMutatingQuery(dbType, query string) bool {
	upper := strings.ToUpper(strings.TrimSpace(query))

	if dbType == "mongodb" {
		for _, kw := range []string{
			"INSERTONE", "INSERTMANY", "UPDATEONE", "UPDATEMANY", "DELETEONE", "DELETEMANY",
			"DROP", "CREATECOLLECTION", "\"INSERT\"", "\"UPDATE\"", "\"DELETE\"", "\"DROP\"",
		} {
			if strings.Contains(upper, kw) {
				return true
			}
		}
		return false
	}

	// SQL mutations (Postgres, MySQL, SQLite)
	for _, kw := range []string{
		"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
		"REPLACE", "RENAME", "GRANT", "REVOKE", "ATTACH", "DETACH",
	} {
		if strings.HasPrefix(upper, kw) {
			return true
		}
	}
	return false
}
