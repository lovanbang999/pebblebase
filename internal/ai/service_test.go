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

func TestBuildPrompt(t *testing.T) {
	req := &ai.QueryAssistRequest{
		Mode:   ai.AssistModeGenerate,
		Engine: "postgres",
		Prompt: "Calculate monthly revenue for 2025",
		Schema: []ai.TableSchemaSummary{
			{
				Name:        "orders",
				Columns:     []string{"id", "total", "created_at"},
				PrimaryKeys: []string{"id"},
			},
		},
	}

	msgs := ai.BuildPrompt(req)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "system" || msgs[1].Role != "user" {
		t.Errorf("unexpected roles: %s, %s", msgs[0].Role, msgs[1].Role)
	}
}

func TestParseAssistResponse(t *testing.T) {
	jsonRaw := "```json\n{\"query\": \"SELECT date_trunc('month', created_at), sum(total) FROM orders GROUP BY 1;\", \"explanation\": \"Aggregates monthly revenue.\", \"indexes\": [\"CREATE INDEX idx_orders_created_at ON orders(created_at);\"]}\n```"
	resp := ai.ParseAssistResponse(jsonRaw)
	if resp.Query == "" || resp.Explanation == "" {
		t.Fatalf("expected query and explanation, got %+v", resp)
	}
	if len(resp.Indexes) != 1 {
		t.Errorf("expected 1 index, got %d", len(resp.Indexes))
	}

	// Fallback raw sql
	rawSQL := "SELECT * FROM users WHERE active = true;"
	respFallback := ai.ParseAssistResponse(rawSQL)
	if respFallback.Query != rawSQL {
		t.Errorf("expected fallback query %q, got %q", rawSQL, respFallback.Query)
	}
}
