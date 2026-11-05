package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"pebblebase/internal/adapter"
)

type pipelinePreviewRequest struct {
	Stages any `json:"stages"`
	Limit  int `json:"limit"`
}

// handlePipelinePreview handles POST /api/connections/{id}/tables/{table}/pipeline-preview
func (s *Server) handlePipelinePreview(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")
	if id == "" || table == "" {
		writeError(w, http.StatusBadRequest, "missing connection id or table name")
		return
	}

	var req pipelinePreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid request payload: %v", err))
		return
	}

	stagesStr := "[]"
	if req.Stages != nil {
		switch s := req.Stages.(type) {
		case string:
			stagesStr = s
		default:
			bytes, err := json.Marshal(req.Stages)
			if err == nil {
				stagesStr = string(bytes)
			}
		}
	}

	adp, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("get adapter: %v", err))
		return
	}

	previewer, ok := adp.(adapter.PipelinePreviewer)
	if !ok {
		writeError(w, http.StatusBadRequest, "pipeline preview is only supported for MongoDB connections")
		return
	}

	limit := req.Limit
	if limit <= 0 {
		limit = 10
	}

	result, err := previewer.PreviewPipeline(r.Context(), table, stagesStr, limit)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("pipeline execution error: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, result)
}
