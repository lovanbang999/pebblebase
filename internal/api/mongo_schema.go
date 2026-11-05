package api

import (
	"fmt"
	"net/http"
	"strconv"

	"pebblebase/internal/adapter"
)

// handleMongoSchemaAnalysis handles GET /api/connections/{id}/tables/{table}/mongo-schema
// It samples documents using $sample and returns statistical type distributions and presence rates.
func (s *Server) handleMongoSchemaAnalysis(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")
	if id == "" || table == "" {
		writeError(w, http.StatusBadRequest, "missing connection id or table name")
		return
	}

	sampleSize := 1000
	if rawSample := r.URL.Query().Get("sample_size"); rawSample != "" {
		if val, err := strconv.Atoi(rawSample); err == nil && val > 0 {
			sampleSize = val
		}
	}

	adp, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("get adapter: %v", err))
		return
	}

	analyzer, ok := adp.(adapter.MongoSchemaAnalyzer)
	if !ok {
		writeError(w, http.StatusBadRequest, "schema analysis is only supported for MongoDB connections")
		return
	}

	result, err := analyzer.AnalyzeSchema(r.Context(), table, sampleSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("schema analysis failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, result)
}
