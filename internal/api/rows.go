package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"pebblebase/internal/adapter"
	"pebblebase/internal/audit"
)

// queryRows handles GET /api/connections/{id}/tables/{table}/rows.
//
// Query parameters:
//
//	limit=N          — max rows (default 50)
//	offset=N         — skip N rows (default 0)
//	sort_by=col      — column to order by
//	sort_desc=true   — descending order (default false)
//	filter=col:op:val — one or more filters, e.g. filter=name:eq:Alice&filter=age:gt:25
func (s *Server) queryRows(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	opts, err := parseQueryOptions(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := a.Query(r.Context(), table, opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// checkReadOnly verifies if the connection is configured in read-only mode.
// If so, it writes a 403 Forbidden error and returns true.
func (s *Server) checkReadOnly(w http.ResponseWriter, id string) bool {
	rec, err := s.store.Get(id)
	if err == nil && rec.ReadOnly {
		writeError(w, http.StatusForbidden, "connection is in read-only mode; mutations are forbidden")
		return true
	}
	return false
}

// insertRow handles POST /api/connections/{id}/tables/{table}/rows.
// Body: {"values": {"col": val, ...}}
func (s *Server) insertRow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")

	if s.viewerBlocked(w, r) {
		return
	}
	if s.checkReadOnly(w, id) {
		return
	}

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	var body struct {
		Values map[string]any `json:"values"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Values) == 0 {
		writeError(w, http.StatusBadRequest, "values must not be empty")
		return
	}

	op := adapter.MutationOp{Type: "insert", Values: body.Values}
	if err := a.Mutate(r.Context(), table, op); err != nil {
		writeError(w, http.StatusInternalServerError, "insert: "+err.Error())
		return
	}
	s.logAudit(r, audit.ActionRowMutate, table, "insert")
	w.WriteHeader(http.StatusCreated)
}

// updateRow handles PATCH /api/connections/{id}/tables/{table}/rows.
// Body: {"where": {"col": val}, "values": {"col": val, ...}}
func (s *Server) updateRow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")

	if s.viewerBlocked(w, r) {
		return
	}
	if s.checkReadOnly(w, id) {
		return
	}

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	var body struct {
		Where  map[string]any `json:"where"`
		Values map[string]any `json:"values"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Where) == 0 {
		writeError(w, http.StatusBadRequest, "where must not be empty")
		return
	}
	if len(body.Values) == 0 {
		writeError(w, http.StatusBadRequest, "values must not be empty")
		return
	}

	op := adapter.MutationOp{Type: "update", Where: body.Where, Values: body.Values}
	if err := a.Mutate(r.Context(), table, op); err != nil {
		writeError(w, http.StatusInternalServerError, "update: "+err.Error())
		return
	}
	s.logAudit(r, audit.ActionRowMutate, table, "update")
	w.WriteHeader(http.StatusNoContent)
}

// deleteRow handles DELETE /api/connections/{id}/tables/{table}/rows.
// Body: {"where": {"col": val, ...}}
func (s *Server) deleteRow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")

	if s.viewerBlocked(w, r) {
		return
	}
	if s.checkReadOnly(w, id) {
		return
	}

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	var body struct {
		Where map[string]any `json:"where"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Where) == 0 {
		writeError(w, http.StatusBadRequest, "where must not be empty")
		return
	}

	op := adapter.MutationOp{Type: "delete", Where: body.Where}
	if err := a.Mutate(r.Context(), table, op); err != nil {
		writeError(w, http.StatusInternalServerError, "delete: "+err.Error())
		return
	}
	s.logAudit(r, audit.ActionRowMutate, table, "delete")
	w.WriteHeader(http.StatusNoContent)
}

// parseQueryOptions extracts QueryOptions from the request's query parameters.
func parseQueryOptions(r *http.Request) (adapter.QueryOptions, error) {
	q := r.URL.Query()

	limit := 50
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return adapter.QueryOptions{}, fmt.Errorf("invalid limit: %q", v)
		}
		limit = n
	}

	offset := 0
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return adapter.QueryOptions{}, fmt.Errorf("invalid offset: %q", v)
		}
		offset = n
	}

	sortDesc := false
	if v := strings.ToLower(q.Get("sort_desc")); v == "true" || v == "1" {
		sortDesc = true
	}

	var filters []adapter.Filter
	for _, raw := range q["filter"] {
		// Format: col:op:val (val may contain colons)
		parts := strings.SplitN(raw, ":", 3)
		if len(parts) != 3 {
			return adapter.QueryOptions{}, fmt.Errorf("invalid filter format %q — expected col:op:val", raw)
		}
		filters = append(filters, adapter.Filter{
			Column:   parts[0],
			Operator: parts[1],
			Value:    parts[2],
		})
	}

	return adapter.QueryOptions{
		Limit:    limit,
		Offset:   offset,
		SortBy:   q.Get("sort_by"),
		SortDesc: sortDesc,
		Filters:  filters,
	}, nil
}
