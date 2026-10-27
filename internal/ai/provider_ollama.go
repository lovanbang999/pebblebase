package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// OllamaProvider handles Local Ollama offline model completions and tag introspection.
type OllamaProvider struct {
	client *http.Client
}

// NewOllamaProvider creates a new local Ollama provider instance.
func NewOllamaProvider() *OllamaProvider {
	return &OllamaProvider{
		client: &http.Client{Timeout: 90 * time.Second},
	}
}

func (p *OllamaProvider) Name() string {
	return ProviderOllama
}

type ollamaChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ollamaOptions struct {
	Temperature float64 `json:"temperature,omitempty"`
	NumPredict  int     `json:"num_predict,omitempty"`
}

type ollamaChatPayload struct {
	Model    string              `json:"model"`
	Messages []ollamaChatMessage `json:"messages"`
	Stream   bool                `json:"stream"`
	Options  *ollamaOptions      `json:"options,omitempty"`
}

type ollamaChatResponse struct {
	Model   string            `json:"model"`
	Message ollamaChatMessage `json:"message"`
	Done    bool              `json:"done"`
	Error   string            `json:"error,omitempty"`
}

type ollamaTagsResponse struct {
	Models []struct {
		Name       string `json:"name"`
		Model      string `json:"model"`
		ModifiedAt string `json:"modified_at"`
		Size       int64  `json:"size"`
	} `json:"models"`
	Error string `json:"error,omitempty"`
}

func (p *OllamaProvider) TestConnection(ctx context.Context, cfg *AIConfig, apiKey string) (*TestResult, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	tagsURL := baseURL + "/api/tags"

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, tagsURL, nil)
	if err != nil {
		return &TestResult{
			OK:      false,
			Message: fmt.Sprintf("Failed to construct request: %v", err),
		}, nil
	}

	resp, err := p.client.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return &TestResult{
			OK:        false,
			LatencyMs: latency,
			Message:   fmt.Sprintf("Cannot connect to Ollama at %s. Ensure Ollama is running (`ollama serve`). Error: %v", baseURL, err),
		}, nil
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return &TestResult{
			OK:        false,
			LatencyMs: latency,
			Message:   fmt.Sprintf("Failed to read Ollama response: %v", err),
		}, nil
	}

	if resp.StatusCode != http.StatusOK {
		return &TestResult{
			OK:        false,
			LatencyMs: latency,
			Message:   fmt.Sprintf("Ollama returned status %d: %s", resp.StatusCode, string(bodyBytes)),
		}, nil
	}

	var tagsResp ollamaTagsResponse
	if err := json.Unmarshal(bodyBytes, &tagsResp); err != nil {
		return &TestResult{
			OK:        false,
			LatencyMs: latency,
			Message:   fmt.Sprintf("Failed to parse Ollama tags response: %v", err),
		}, nil
	}

	var available []string
	for _, m := range tagsResp.Models {
		available = append(available, m.Name)
	}

	var msg string
	if len(available) > 0 {
		msg = fmt.Sprintf("Successfully connected to local Ollama at %s. Found %d installed model(s). Response latency: %dms", baseURL, len(available), latency)
	} else {
		msg = fmt.Sprintf("Connected to Ollama at %s, but no models are currently pulled. Run `ollama pull %s` in your terminal.", baseURL, cfg.Model)
	}

	return &TestResult{
		OK:              true,
		LatencyMs:       latency,
		Message:         msg,
		AvailableModels: available,
	}, nil
}

func (p *OllamaProvider) Generate(ctx context.Context, cfg *AIConfig, apiKey string, req *CompletionRequest) (*CompletionResponse, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	chatURL := baseURL + "/api/chat"

	messages := make([]ollamaChatMessage, len(req.Messages))
	for i, m := range req.Messages {
		messages[i] = ollamaChatMessage{Role: m.Role, Content: m.Content}
	}

	temp := req.Temperature
	if temp == 0 && cfg.Temperature != 0 {
		temp = cfg.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = cfg.MaxTokens
	}

	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "qwen2.5-coder:latest"
	}

	bodyData := ollamaChatPayload{
		Model:    model,
		Messages: messages,
		Stream:   false,
		Options: &ollamaOptions{
			Temperature: temp,
			NumPredict:  maxTokens,
		},
	}

	bodyBytes, err := json.Marshal(bodyData)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	start := time.Now()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errObj struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(respBytes, &errObj) == nil && errObj.Error != "" {
			return nil, errors.New(errObj.Error)
		}
		return nil, fmt.Errorf("ollama returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	var parsed ollamaChatResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	if parsed.Error != "" {
		return nil, errors.New(parsed.Error)
	}

	return &CompletionResponse{
		Content:   parsed.Message.Content,
		Model:     parsed.Model,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}
