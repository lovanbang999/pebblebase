package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func TestRedisAPI_PubSubPublish(t *testing.T) {
	mux, store := setupTestServer(t)
	mr := miniredis.RunT(t)
	defer mr.Close()

	connID := createRedisConnection(t, store, mr)

	// 1. Missing channel in publish body -> 400
	payloadBad, _ := json.Marshal(map[string]string{"message": "hello"})
	reqBad := httptest.NewRequest("POST", fmt.Sprintf("/api/connections/%s/redis/pubsub/publish", connID), bytes.NewReader(payloadBad))
	recBad := httptest.NewRecorder()
	mux.ServeHTTP(recBad, reqBad)

	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty channel, got %d", recBad.Code)
	}

	// 2. Valid publish
	payload, _ := json.Marshal(map[string]string{
		"channel": "chat.general",
		"message": "Welcome everyone!",
	})
	req := httptest.NewRequest("POST", fmt.Sprintf("/api/connections/%s/redis/pubsub/publish", connID), bytes.NewReader(payload))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("publish failed with status %d: %s", rec.Code, rec.Body.String())
	}

	var res struct {
		Channel   string `json:"channel"`
		Receivers int64  `json:"receivers"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal publish response: %v", err)
	}
	if res.Channel != "chat.general" {
		t.Errorf("expected channel 'chat.general', got %q", res.Channel)
	}
}

func TestRedisAPI_PubSubStream(t *testing.T) {
	mux, store := setupTestServer(t)
	mr := miniredis.RunT(t)
	defer mr.Close()

	connID := createRedisConnection(t, store, mr)

	// 1. Missing channels/patterns -> 400
	reqEmpty := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/redis/pubsub/stream", connID), nil)
	recEmpty := httptest.NewRecorder()
	mux.ServeHTTP(recEmpty, reqEmpty)

	if recEmpty.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty stream channels, got %d", recEmpty.Code)
	}

	// 2. Valid stream with timeout context
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	reqStream := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/redis/pubsub/stream?channels=news&patterns=events.*", connID), nil).WithContext(ctx)
	recStream := httptest.NewRecorder()

	mux.ServeHTTP(recStream, reqStream)

	body := recStream.Body.String()
	if !strings.Contains(body, "event: connected") {
		t.Errorf("expected stream body to contain 'event: connected', got %q", body)
	}
	if recStream.Header().Get("Content-Type") != "text/event-stream" {
		t.Errorf("expected Content-Type text/event-stream, got %q", recStream.Header().Get("Content-Type"))
	}
}
