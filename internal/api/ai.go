package api

import (
	"fmt"
	"net/http"

	"pebblebase/internal/ai"
)

// handleGetAIConfig handles GET /api/ai/config.
func (s *Server) handleGetAIConfig(w http.ResponseWriter, r *http.Request) {
	if s.aiSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AI service is not available")
		return
	}

	cfg, err := s.aiSvc.GetConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("get ai config: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, cfg)
}

// handleSaveAIConfig handles POST /api/ai/config.
func (s *Server) handleSaveAIConfig(w http.ResponseWriter, r *http.Request) {
	if s.aiSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AI service is not available")
		return
	}

	var payload ai.ConfigPayload
	if err := decodeBody(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if payload.Provider == "" {
		writeError(w, http.StatusBadRequest, "provider is required")
		return
	}
	if payload.Model == "" {
		writeError(w, http.StatusBadRequest, "model is required")
		return
	}

	saved, err := s.aiSvc.SaveConfig(r.Context(), &payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("save ai config: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, saved)
}

// handleTestAIConnection handles POST /api/ai/test.
func (s *Server) handleTestAIConnection(w http.ResponseWriter, r *http.Request) {
	if s.aiSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AI service is not available")
		return
	}

	var payload ai.ConfigPayload
	if err := decodeBody(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if payload.Provider == "" {
		writeError(w, http.StatusBadRequest, "provider is required")
		return
	}

	res, err := s.aiSvc.TestConnection(r.Context(), &payload)
	if err != nil {
		writeJSON(w, http.StatusOK, ai.TestResult{
			OK:      false,
			Message: err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleGetAIProviders handles GET /api/ai/providers.
func (s *Server) handleGetAIProviders(w http.ResponseWriter, r *http.Request) {
	if s.aiSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AI service is not available")
		return
	}

	providers := s.aiSvc.GetSupportedProviders()
	writeJSON(w, http.StatusOK, providers)
}

// handleAIGenerate handles POST /api/ai/generate.
func (s *Server) handleAIGenerate(w http.ResponseWriter, r *http.Request) {
	if s.aiSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AI service is not available")
		return
	}

	var req ai.CompletionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if len(req.Messages) == 0 {
		writeError(w, http.StatusBadRequest, "at least one message is required")
		return
	}

	resp, err := s.aiSvc.Generate(r.Context(), &req)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("ai generation failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, resp)
}
