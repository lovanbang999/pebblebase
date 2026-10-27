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

// AnthropicProvider handles Anthropic Claude API completions.
type AnthropicProvider struct {
	client *http.Client
}

// NewAnthropicProvider creates an Anthropic provider instance.
func NewAnthropicProvider() *AnthropicProvider {
	return &AnthropicProvider{
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

func (p *AnthropicProvider) Name() string {
	return ProviderAnthropic
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicRequestPayload struct {
	Model       string             `json:"model"`
	MaxTokens   int                `json:"max_tokens"`
	Temperature float64            `json:"temperature,omitempty"`
	System      string             `json:"system,omitempty"`
	Messages    []anthropicMessage `json:"messages"`
}

type anthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type anthropicResponsePayload struct {
	Model   string                  `json:"model"`
	Content []anthropicContentBlock `json:"content"`
	Error   *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *AnthropicProvider) TestConnection(ctx context.Context, cfg *AIConfig, apiKey string) (*TestResult, error) {
	if strings.TrimSpace(apiKey) == "" {
		return &TestResult{
			OK:      false,
			Message: "Anthropic API key is required",
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
		Message:   fmt.Sprintf("Successfully connected to Anthropic Claude (%s). Response latency: %dms", resp.Model, latency),
	}, nil
}

func (p *AnthropicProvider) Generate(ctx context.Context, cfg *AIConfig, apiKey string, req *CompletionRequest) (*CompletionResponse, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("api key is required")
	}

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.anthropic.com/v1"
	}

	url := baseURL + "/messages"

	var systemPrompt string
	var messages []anthropicMessage

	for _, m := range req.Messages {
		if m.Role == "system" {
			systemPrompt = m.Content
		} else {
			messages = append(messages, anthropicMessage{
				Role:    m.Role,
				Content: m.Content,
			})
		}
	}

	if len(messages) == 0 {
		messages = append(messages, anthropicMessage{
			Role:    "user",
			Content: "Hello",
		})
	}

	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = cfg.MaxTokens
	}
	if maxTokens <= 0 {
		maxTokens = 2048
	}

	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "claude-3-5-haiku-20241022"
	}

	payload := anthropicRequestPayload{
		Model:       model,
		MaxTokens:   maxTokens,
		Temperature: cfg.Temperature,
		System:      systemPrompt,
		Messages:    messages,
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	start := time.Now()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var parsed anthropicResponsePayload
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

	var textBuilder strings.Builder
	for _, block := range parsed.Content {
		if block.Type == "text" {
			textBuilder.WriteString(block.Text)
		}
	}

	return &CompletionResponse{
		Content:   textBuilder.String(),
		Model:     parsed.Model,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}
