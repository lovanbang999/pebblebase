package ai_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"pebblebase/internal/ai"
)

func TestService_SupportedProviders(t *testing.T) {
	store, enc := newTestAIStore(t)
	svc := ai.NewService(store, enc)

	providers := svc.GetSupportedProviders()
	if len(providers) != 5 {
		t.Fatalf("expected 5 providers, got %d", len(providers))
	}

	expectedIDs := map[string]bool{
		ai.ProviderOpenAI:    true,
		ai.ProviderGemini:    true,
		ai.ProviderAnthropic: true,
		ai.ProviderGroq:      true,
		ai.ProviderOllama:    true,
	}

	for _, p := range providers {
		if !expectedIDs[p.ID] {
			t.Errorf("unexpected provider ID: %s", p.ID)
		}
	}
}

func TestService_OpenAI_MockCompletion(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":{"message":"Invalid API key"}}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"model": "gpt-4o-mini",
			"choices": [
				{
					"message": {
						"content": "SELECT * FROM users;"
					}
				}
			]
		}`))
	}))
	defer ts.Close()

	store, enc := newTestAIStore(t)
	svc := ai.NewService(store, enc)
	ctx := context.Background()

	// Save config with mock server BaseURL
	_, err := svc.SaveConfig(ctx, &ai.ConfigPayload{
		Provider:  ai.ProviderOpenAI,
		Model:     "gpt-4o-mini",
		BaseURL:   ts.URL,
		APIKey:    "test-key",
		MaxTokens: 100,
	})
	if err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	// Test connection
	testRes, err := svc.TestConnection(ctx, &ai.ConfigPayload{
		Provider: ai.ProviderOpenAI,
		Model:    "gpt-4o-mini",
		BaseURL:  ts.URL,
		APIKey:   "test-key",
	})
	if err != nil {
		t.Fatalf("test connection error: %v", err)
	}
	if !testRes.OK {
		t.Fatalf("expected test connection OK, got message: %s", testRes.Message)
	}

	// Test generate
	genResp, err := svc.Generate(ctx, &ai.CompletionRequest{
		Messages: []ai.ChatMessage{
			{Role: "user", Content: "Give me SQL"},
		},
	})
	if err != nil {
		t.Fatalf("generate error: %v", err)
	}
	if genResp.Content != "SELECT * FROM users;" {
		t.Errorf("unexpected content: %s", genResp.Content)
	}
}

func TestService_Ollama_MockTagsAndChat(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/tags" {
			json.NewEncoder(w).Encode(map[string]any{
				"models": []map[string]any{
					{"name": "qwen2.5-coder:latest", "size": 4700000000},
					{"name": "llama3.2:latest", "size": 2000000000},
				},
			})
			return
		}
		if r.URL.Path == "/api/chat" {
			json.NewEncoder(w).Encode(map[string]any{
				"model": "qwen2.5-coder:latest",
				"message": map[string]string{
					"role":    "assistant",
					"content": "SELECT COUNT(*) FROM orders;",
				},
				"done": true,
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer ts.Close()

	store, enc := newTestAIStore(t)
	svc := ai.NewService(store, enc)
	ctx := context.Background()

	testRes, err := svc.TestConnection(ctx, &ai.ConfigPayload{
		Provider: ai.ProviderOllama,
		Model:    "qwen2.5-coder:latest",
		BaseURL:  ts.URL,
	})
	if err != nil {
		t.Fatalf("ollama test connection error: %v", err)
	}
	if !testRes.OK {
		t.Fatalf("expected Ollama test OK, got: %s", testRes.Message)
	}
	if len(testRes.AvailableModels) != 2 {
		t.Errorf("expected 2 available models, got %d", len(testRes.AvailableModels))
	}
}
