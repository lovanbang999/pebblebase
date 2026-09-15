package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"pebblebase/internal/adapter"
)

// GET /api/connections/{id}/tables/{table}/aggregate
func (s *Server) handleAggregate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")
	if id == "" || table == "" {
		writeError(w, http.StatusBadRequest, "missing connection id or table name")
		return
	}

	q := r.URL.Query()
	col := q.Get("column")
	if col == "" {
		writeError(w, http.StatusBadRequest, "query param 'column' is required")
		return
	}

	fn := q.Get("function")
	if fn == "" {
		fn = "distribution"
	}

	groupBy := q.Get("group_by")
	if groupBy == "" {
		groupBy = "day"
	}

	limit := 10
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	var filters []adapter.Filter
	for _, raw := range q["filter"] {
		parts := strings.SplitN(raw, ":", 3)
		if len(parts) == 3 {
			filters = append(filters, adapter.Filter{
				Column:   parts[0],
				Operator: parts[1],
				Value:    parts[2],
			})
		}
	}

	adp, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("get adapter: %v", err))
		return
	}

	opts := adapter.AggregateOptions{
		Column:   col,
		Function: fn,
		GroupBy:  groupBy,
		Filters:  filters,
		Limit:    limit,
	}

	result, err := adp.Aggregate(r.Context(), table, opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("aggregate: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// GET /api/connections/{id}/tables/{table}/stats
func (s *Server) handleTableStats(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")
	if id == "" || table == "" {
		writeError(w, http.StatusBadRequest, "missing connection id or table name")
		return
	}

	adp, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("get adapter: %v", err))
		return
	}

	if provider, ok := adp.(adapter.TableStatsProvider); ok {
		stats, err := provider.GetTableStats(r.Context(), table)
		if err == nil {
			writeJSON(w, http.StatusOK, stats)
			return
		}
	}

	// Fallback to basic query count if TableStatsProvider not supported or fails
	res, err := adp.Query(r.Context(), table, adapter.QueryOptions{Limit: 1})
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("query table stats: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, adapter.TableStats{
		TotalRows: int64(res.TotalCount),
		SizeBytes: 0,
	})
}
