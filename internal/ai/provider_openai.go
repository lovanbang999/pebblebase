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

// OpenAIProvider handles OpenAI and Groq (OpenAI-compatible) API completions.
type OpenAIProvider struct {
	client *http.Client
	name   string
}

// NewOpenAIProvider creates an OpenAI or Groq provider instance.
func NewOpenAIProvider(name string) *OpenAIProvider {
	return &OpenAIProvider{
		client: &http.Client{Timeout: 60 * time.Second},
		name:   name,
	}
}

func (p *OpenAIProvider) Name() string {
	return p.name
}

type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAICompletionPayload struct {
	Model       string              `json:"model"`
	Messages    []openAIChatMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens,omitempty"`
}

type openAIResponseChoice struct {
	Message struct {
		Content string `json:"content"`
	} `json:"message"`
}

type openAIResponsePayload struct {
	Model   string                 `json:"model"`
	Choices []openAIResponseChoice `json:"choices"`
	Error   *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (p *OpenAIProvider) TestConnection(ctx context.Context, cfg *AIConfig, apiKey string) (*TestResult, error) {
	if strings.TrimSpace(apiKey) == "" {
		return &TestResult{
			OK:      false,
			Message: fmt.Sprintf("%s API key is required", strings.ToUpper(p.name)),
		}, nil
	}

	start := time.Now()
	testReq := &CompletionRequest{
		Messages: []ChatMessage{
			{Role: "user", Content: "Ping"},
		},
		MaxTokens: 5,
	}

	resp, err := p.Generate(ctx, cfg, apiKey, testReq)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return &TestResult{
			OK:        false,
			LatencyMs: latency,
			Message:   fmt.Sprintf("Connection failed: %v", err),
		}, nil
	}

	return &TestResult{
		OK:        true,
		LatencyMs: latency,
		Message:   fmt.Sprintf("Successfully connected to %s (%s). Response latency: %dms", p.name, resp.Model, latency),
	}, nil
}

func (p *OpenAIProvider) Generate(ctx context.Context, cfg *AIConfig, apiKey string, req *CompletionRequest) (*CompletionResponse, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("api key is required")
	}

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		if p.name == ProviderGroq {
			baseURL = "https://api.groq.com/openai/v1"
		} else {
			baseURL = "https://api.openai.com/v1"
		}
	}

	url := baseURL + "/chat/completions"

	messages := make([]openAIChatMessage, len(req.Messages))
	for i, m := range req.Messages {
		messages[i] = openAIChatMessage{Role: m.Role, Content: m.Content}
	}

	temp := req.Temperature
	if temp == 0 && cfg.Temperature != 0 {
		temp = cfg.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = cfg.MaxTokens
	}

	bodyData := openAICompletionPayload{
		Model:       cfg.Model,
		Messages:    messages,
		Temperature: temp,
		MaxTokens:   maxTokens,
	}

	bodyBytes, err := json.Marshal(bodyData)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	start := time.Now()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var parsed openAIResponsePayload
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(respBytes))
		}
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	if parsed.Error != nil {
		return nil, errors.New(parsed.Error.Message)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("provider returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	if len(parsed.Choices) == 0 {
		return nil, errors.New("no completion choices returned by provider")
	}

	return &CompletionResponse{
		Content:   parsed.Choices[0].Message.Content,
		Model:     parsed.Model,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}
