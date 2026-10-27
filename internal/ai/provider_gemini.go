package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// GeminiProvider handles Google Gemini API completions.
type GeminiProvider struct {
	client *http.Client
}

// NewGeminiProvider creates a Gemini provider instance.
func NewGeminiProvider() *GeminiProvider {
	return &GeminiProvider{
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

func (p *GeminiProvider) Name() string {
	return ProviderGemini
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiGenerationConfig struct {
	Temperature     float64 `json:"temperature,omitempty"`
	MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
}

type geminiRequestPayload struct {
	Contents          []geminiContent         `json:"contents"`
	SystemInstruction *geminiContent          `json:"system_instruction,omitempty"`
	GenerationConfig  *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

type geminiCandidate struct {
	Content geminiContent `json:"content"`
}

type geminiResponsePayload struct {
	Candidates []geminiCandidate `json:"candidates"`
	Error      *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

func (p *GeminiProvider) TestConnection(ctx context.Context, cfg *AIConfig, apiKey string) (*TestResult, error) {
	if strings.TrimSpace(apiKey) == "" {
		return &TestResult{
			OK:      false,
			Message: "Google Gemini API key is required",
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
		Message:   fmt.Sprintf("Successfully connected to Google Gemini (%s). Response latency: %dms", resp.Model, latency),
	}, nil
}

func (p *GeminiProvider) Generate(ctx context.Context, cfg *AIConfig, apiKey string, req *CompletionRequest) (*CompletionResponse, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("api key is required")
	}

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com"
	}

	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "gemini-2.0-flash"
	}

	requestURL := fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", baseURL, url.PathEscape(model), url.QueryEscape(apiKey))

	var contents []geminiContent
	var systemInstruction *geminiContent

	for _, m := range req.Messages {
		if m.Role == "system" {
			systemInstruction = &geminiContent{
				Parts: []geminiPart{{Text: m.Content}},
			}
		} else {
			role := "user"
			if m.Role == "assistant" {
				role = "model"
			}
			contents = append(contents, geminiContent{
				Role:  role,
				Parts: []geminiPart{{Text: m.Content}},
			})
		}
	}

	if len(contents) == 0 {
		contents = append(contents, geminiContent{
			Role:  "user",
			Parts: []geminiPart{{Text: "Hello"}},
		})
	}

	temp := req.Temperature
	if temp == 0 && cfg.Temperature != 0 {
		temp = cfg.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = cfg.MaxTokens
	}

	payload := geminiRequestPayload{
		Contents:          contents,
		SystemInstruction: systemInstruction,
		GenerationConfig: &geminiGenerationConfig{
			Temperature:     temp,
			MaxOutputTokens: maxTokens,
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	start := time.Now()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(bodyBytes))
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

	var parsed geminiResponsePayload
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

	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return nil, errors.New("no completion parts returned by Gemini")
	}

	return &CompletionResponse{
		Content:   parsed.Candidates[0].Content.Parts[0].Text,
		Model:     model,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}
