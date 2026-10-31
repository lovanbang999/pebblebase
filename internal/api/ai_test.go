package api_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pebblebase/internal/ai"
	"pebblebase/internal/api"
	"pebblebase/internal/storage"

	_ "modernc.org/sqlite"
)

func setupAITestServer(t *testing.T) (*http.ServeMux, *ai.Service, *httptest.Server) {
	t.Helper()
	dir := t.TempDir()

	mockLLMServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/chat/completions" || r.URL.Path == "/chat/completions" {
			content := "Hello from mock AI!"
			var body struct {
				Messages []struct {
					Content string `json:"content"`
				} `json:"messages"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err == nil && len(body.Messages) > 0 {
				lastMsg := body.Messages[len(body.Messages)-1].Content
				if lastMsg == "assist-test" {
					content = `{"query": "SELECT * FROM orders;", "explanation": "Fetches all orders"}`
				}
			}
			w.Write(fmt.Appendf(nil, `{
				"model": "gpt-4o-mini",
				"choices": [{"message": {"content": %q}}]
			}`, content))
			return
		}
		if r.URL.Path == "/api/tags" {
			w.Write([]byte(`{"models":[{"name":"qwen2.5-coder:latest"}]}`))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(func() { mockLLMServer.Close() })

	key := []byte("12345678901234567890123456789012")
	enc, err := storage.NewEncryptor(key)
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}
	store, err := storage.NewStore(dir, enc)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	metaDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { metaDB.Close() })

	aiStore, err := ai.NewStore(metaDB, enc)
	if err != nil {
		t.Fatalf("ai.NewStore: %v", err)
	}
	aiSvc := ai.NewService(aiStore, enc)

	mux := http.NewServeMux()
	srv := api.NewServer(store, enc, nil, nil, nil, nil, aiSvc, false)
	srv.RegisterRoutes(mux)

	return mux, aiSvc, mockLLMServer
}

type errorAIProvider struct{ message string }

func (p errorAIProvider) Name() string { return "openai" }
func (p errorAIProvider) TestConnection(_ context.Context, _ *ai.AIConfig, _ string) (*ai.TestResult, error) {
	return nil, fmt.Errorf("upstream echoed credential: %s", p.message)
}
func (p errorAIProvider) Generate(context.Context, *ai.AIConfig, string, *ai.CompletionRequest) (*ai.CompletionResponse, error) {
	return nil, fmt.Errorf("provider error")
}

func newAIEndpointTestMux(t *testing.T) (*http.ServeMux, *ai.Service) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	enc, err := storage.NewEncryptor([]byte("01234567890123456789012345678901"))
	if err != nil {
		t.Fatal(err)
	}
	store, err := ai.NewStore(db, enc)
	if err != nil {
		t.Fatal(err)
	}
	svc := ai.NewService(store, enc)
	mux := http.NewServeMux()
	api.NewServer(nil, enc, nil, nil, nil, nil, svc, false).RegisterRoutes(mux)
	return mux, svc
}

func TestAIConfigMasksCredentialAndTestFailureDoesNotEchoIt(t *testing.T) {
	mux, svc := newAIEndpointTestMux(t)
	secret := "sk-live-do-not-return-this"
	var capturedLogs bytes.Buffer
	previousLogOutput := log.Writer()
	log.SetOutput(&capturedLogs)
	t.Cleanup(func() { log.SetOutput(previousLogOutput) })
	body := fmt.Sprintf(`{"provider":"openai","model":"test-model","base_url":"https://provider.invalid","api_key":%q}`, secret)
	save := httptest.NewRecorder()
	mux.ServeHTTP(save, httptest.NewRequest(http.MethodPost, "/api/ai/config", strings.NewReader(body)))
	if save.Code != http.StatusOK {
		t.Fatalf("save config status = %d", save.Code)
	}
	if strings.Contains(save.Body.String(), secret) {
		t.Fatal("save response exposed the API key")
	}

	read := httptest.NewRecorder()
	mux.ServeHTTP(read, httptest.NewRequest(http.MethodGet, "/api/ai/config", nil))
	if read.Code != http.StatusOK {
		t.Fatalf("get config status = %d", read.Code)
	}
	if strings.Contains(read.Body.String(), secret) {
		t.Fatal("config read exposed the API key")
	}
	var config ai.ConfigPayload
	if err := json.Unmarshal(read.Body.Bytes(), &config); err != nil {
		t.Fatal(err)
	}
	if !config.HasKey || config.KeyMask == "" || config.KeyMask == secret {
		t.Fatalf("expected masked key metadata, got %+v", config)
	}
	status := httptest.NewRecorder()
	mux.ServeHTTP(status, httptest.NewRequest(http.MethodGet, "/api/ai/status", nil))
	if status.Code != http.StatusOK || !strings.Contains(status.Body.String(), `"configured":true`) || strings.Contains(status.Body.String(), secret) {
		t.Fatalf("AI status should report readiness without credentials: status=%d body=%s", status.Code, status.Body.String())
	}

	svc.RegisterProvider(errorAIProvider{message: secret})
	testBody := fmt.Sprintf(`{"provider":"openai","model":"test-model","base_url":"https://provider.invalid","api_key":%q}`, secret)
	testResponse := httptest.NewRecorder()
	mux.ServeHTTP(testResponse, httptest.NewRequest(http.MethodPost, "/api/ai/test", strings.NewReader(testBody)))
	if strings.Contains(testResponse.Body.String(), secret) {
		t.Fatal("connection test response echoed API key")
	}
	if strings.Contains(capturedLogs.String(), secret) {
		t.Fatal("AI key was written to the application log")
	}
	if !strings.Contains(testResponse.Body.String(), "Connection test failed") {
		t.Fatalf("expected sanitized failure, got %s", testResponse.Body.String())
	}
}

func TestAI_API_Endpoints(t *testing.T) {
	mux, _, mockLLM := setupAITestServer(t)

	// 1. GET /api/ai/providers
	reqProviders := httptest.NewRequest(http.MethodGet, "/api/ai/providers", nil)
	recProviders := httptest.NewRecorder()
	mux.ServeHTTP(recProviders, reqProviders)

	if recProviders.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recProviders.Code)
	}
	var providers []ai.ProviderInfo
	if err := json.Unmarshal(recProviders.Body.Bytes(), &providers); err != nil {
		t.Fatalf("unmarshal providers: %v", err)
	}
	if len(providers) != 5 {
		t.Errorf("expected 5 providers, got %d", len(providers))
	}

	// 2. GET /api/ai/config initially
	reqGetInit := httptest.NewRequest(http.MethodGet, "/api/ai/config", nil)
	recGetInit := httptest.NewRecorder()
	mux.ServeHTTP(recGetInit, reqGetInit)

	if recGetInit.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recGetInit.Code)
	}
	var initConfig ai.ConfigPayload
	if err := json.Unmarshal(recGetInit.Body.Bytes(), &initConfig); err != nil {
		t.Fatalf("unmarshal init config: %v", err)
	}
	if initConfig.HasKey {
		t.Errorf("expected HasKey false initially, got true")
	}

	// 3. POST /api/ai/config (Save)
	saveBody, _ := json.Marshal(ai.ConfigPayload{
		Provider:    ai.ProviderOpenAI,
		Model:       "gpt-4o-mini",
		BaseURL:     mockLLM.URL,
		APIKey:      "sk-proj-1234567890abcdef",
		Temperature: 0.3,
		MaxTokens:   1000,
	})
	reqSave := httptest.NewRequest(http.MethodPost, "/api/ai/config", bytes.NewReader(saveBody))
	recSave := httptest.NewRecorder()
	mux.ServeHTTP(recSave, reqSave)

	if recSave.Code != http.StatusOK {
		t.Fatalf("expected status 200 on save, got %d: %s", recSave.Code, recSave.Body.String())
	}
	var savedConfig ai.ConfigPayload
	if err := json.Unmarshal(recSave.Body.Bytes(), &savedConfig); err != nil {
		t.Fatalf("unmarshal saved config: %v", err)
	}
	if !savedConfig.HasKey {
		t.Errorf("expected HasKey true after save, got false")
	}
	if savedConfig.KeyMask == "" || savedConfig.KeyMask == "sk-proj-1234567890abcdef" {
		t.Errorf("expected masked key, got %q", savedConfig.KeyMask)
	}

	// 4. POST /api/ai/test (Connectivity Test)
	testBody, _ := json.Marshal(ai.ConfigPayload{
		Provider: ai.ProviderOpenAI,
		Model:    "gpt-4o-mini",
		BaseURL:  mockLLM.URL,
		APIKey:   "sk-proj-1234567890abcdef",
	})
	reqTest := httptest.NewRequest(http.MethodPost, "/api/ai/test", bytes.NewReader(testBody))
	recTest := httptest.NewRecorder()
	mux.ServeHTTP(recTest, reqTest)

	if recTest.Code != http.StatusOK {
		t.Fatalf("expected status 200 on test, got %d: %s", recTest.Code, recTest.Body.String())
	}
	var testRes ai.TestResult
	if err := json.Unmarshal(recTest.Body.Bytes(), &testRes); err != nil {
		t.Fatalf("unmarshal test result: %v", err)
	}
	if !testRes.OK {
		t.Errorf("expected test OK true, got false: %s", testRes.Message)
	}

	// 5. POST /api/ai/generate
	genBody, _ := json.Marshal(ai.CompletionRequest{
		Messages: []ai.ChatMessage{
			{Role: "user", Content: "Hello"},
		},
	})
	reqGen := httptest.NewRequest(http.MethodPost, "/api/ai/generate", bytes.NewReader(genBody))
	recGen := httptest.NewRecorder()
	mux.ServeHTTP(recGen, reqGen)

	if recGen.Code != http.StatusOK {
		t.Fatalf("expected status 200 on generate, got %d: %s", recGen.Code, recGen.Body.String())
	}
	var compResp ai.CompletionResponse
	if err := json.Unmarshal(recGen.Body.Bytes(), &compResp); err != nil {
		t.Fatalf("unmarshal generate resp: %v", err)
	}
	if compResp.Content != "Hello from mock AI!" {
		t.Errorf("unexpected content: %s", compResp.Content)
	}

	// 6. POST /api/ai/query-assist
	assistBody, _ := json.Marshal(ai.QueryAssistRequest{
		Mode:   ai.AssistModeGenerate,
		Engine: "postgres",
		Prompt: "assist-test",
	})
	reqAssist := httptest.NewRequest(http.MethodPost, "/api/ai/query-assist", bytes.NewReader(assistBody))
	recAssist := httptest.NewRecorder()
	mux.ServeHTTP(recAssist, reqAssist)

	if recAssist.Code != http.StatusOK {
		t.Fatalf("expected status 200 on query-assist, got %d: %s", recAssist.Code, recAssist.Body.String())
	}
	var assistResp ai.QueryAssistResponse
	if err := json.Unmarshal(recAssist.Body.Bytes(), &assistResp); err != nil {
		t.Fatalf("unmarshal query-assist resp: %v", err)
	}
	if assistResp.Query != "SELECT * FROM orders;" {
		t.Errorf("unexpected query: %s", assistResp.Query)
	}
}
