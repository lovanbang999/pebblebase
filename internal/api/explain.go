package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
)

type explainQueryRequest struct {
	Query string `json:"query"`
}

func (s *Server) explainQuery(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing connection id")
		return
	}

	var req explainQueryRequest
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

	// Guard against mutating queries in read-only / viewer mode
	// (Especially critical as EXPLAIN ANALYZE in Postgres executes the query)
	if (rec.ReadOnly || (s.authEnabled && auth.IsViewer(r))) && isMutatingQuery(rec.Type, trimmedQuery) {
		writeError(w, http.StatusForbidden, "read-only mode: explaining mutating queries is forbidden")
		return
	}

	// 30-second timeout
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	adp, err := s.getAdapter(ctx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("get adapter: %v", err))
		return
	}

	explainer, ok := adp.(adapter.QueryExplainer)
	if !ok {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("query explain is not supported for %s adapter", rec.Type))
		return
	}

	result, err := explainer.ExplainQuery(ctx, trimmedQuery)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.logAudit(r, audit.ActionQueryExecute, rec.Name, "EXPLAIN: "+trimmedQuery)

	writeJSON(w, http.StatusOK, result)
}
