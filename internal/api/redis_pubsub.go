package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pebblebase/internal/audit"
)

type redisPublishRequest struct {
	Channel string `json:"channel"`
	Message string `json:"message"`
}

type redisPublishResponse struct {
	Channel   string `json:"channel"`
	Receivers int64  `json:"receivers"`
}

// handleRedisPubSubStream handles GET /api/connections/{id}/redis/pubsub/stream
// Query params: channels (comma-separated), patterns (comma-separated)
// Streams SSE events to the client until disconnected.
func (s *Server) handleRedisPubSubStream(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	adp, err := s.getRedisAdapter(r, id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported by server")
		return
	}

	q := r.URL.Query()
	channels := parseCommaList(q.Get("channels"))
	patterns := parseCommaList(q.Get("patterns"))

	if len(channels) == 0 && len(patterns) == 0 {
		writeError(w, http.StatusBadRequest, "at least one channel or pattern is required to subscribe")
		return
	}

	msgChan, cleanup, err := adp.Subscribe(r.Context(), channels, patterns)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer cleanup()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Emit initial connection event
	initData, _ := json.Marshal(map[string]any{
		"status":   "connected",
		"channels": channels,
		"patterns": patterns,
	})
	fmt.Fprintf(w, "event: connected\ndata: %s\n\n", initData)
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case msg, ok := <-msgChan:
			if !ok {
				return
			}
			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", data)
			flusher.Flush()
		}
	}
}

// handleRedisPubSubPublish handles POST /api/connections/{id}/redis/pubsub/publish
func (s *Server) handleRedisPubSubPublish(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	id := r.PathValue("id")
	adp, err := s.getRedisAdapter(r, id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req redisPublishRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Channel = strings.TrimSpace(req.Channel)
	if req.Channel == "" {
		writeError(w, http.StatusBadRequest, "channel name is required")
		return
	}

	receivers, err := adp.Publish(r.Context(), req.Channel, req.Message)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.logAudit(r, audit.ActionRowMutate, "redis:pubsub", fmt.Sprintf("PUBLISH %s (%d receivers)", req.Channel, receivers))

	writeJSON(w, http.StatusOK, redisPublishResponse{
		Channel:   req.Channel,
		Receivers: receivers,
	})
}

func parseCommaList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	var result []string
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}
