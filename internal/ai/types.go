// Package ai handles privacy-first BYO-key and local LLM integration with AES-256-GCM encryption.
package ai

import (
	"context"
	"time"
)

// Provider type constants
const (
	ProviderOpenAI    = "openai"
	ProviderGemini    = "gemini"
	ProviderAnthropic = "anthropic"
	ProviderGroq      = "groq"
	ProviderOllama    = "ollama"
)

// AIConfig represents the persistent AI provider configuration.
type AIConfig struct {
	ID              string    `json:"id"`
	Provider        string    `json:"provider"`
	Model           string    `json:"model"`
	BaseURL         string    `json:"base_url"`
	APIKeyEncrypted string    `json:"-"`
	Temperature     float64   `json:"temperature"`
	MaxTokens       int       `json:"max_tokens"`
	IsActive        bool      `json:"is_active"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ConfigPayload is used for frontend configuration exchange without exposing raw secrets.
type ConfigPayload struct {
	Provider    string  `json:"provider"`
	Model       string  `json:"model"`
	BaseURL     string  `json:"base_url"`
	APIKey      string  `json:"api_key,omitempty"` // Cleartext on write, omitted on read
	HasKey      bool    `json:"has_key"`           // Indicates if encrypted key is stored
	KeyMask     string  `json:"key_mask"`          // e.g. "sk-...ab12"
	Temperature float64 `json:"temperature"`
	MaxTokens   int     `json:"max_tokens"`
}

// TestResult represents the outcome of a provider connectivity verification.
type TestResult struct {
	OK              bool     `json:"ok"`
	LatencyMs       int64    `json:"latency_ms"`
	Message         string   `json:"message"`
	AvailableModels []string `json:"available_models,omitempty"`
}

// ChatMessage represents a single message in a conversation context.
type ChatMessage struct {
	Role    string `json:"role"` // system | user | assistant
	Content string `json:"content"`
}

// CompletionRequest represents a generic LLM completion request.
type CompletionRequest struct {
	Messages    []ChatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

// CompletionResponse represents the generated text completion.
type CompletionResponse struct {
	Content   string `json:"content"`
	Model     string `json:"model"`
	LatencyMs int64  `json:"latency_ms"`
}

// ProviderInfo provides frontend catalog metadata for supported providers.
type ProviderInfo struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	DefaultBaseURL string   `json:"default_base_url"`
	DefaultModel   string   `json:"default_model"`
	Models         []string `json:"models"`
	RequiresKey    bool     `json:"requires_key"`
	DocURL         string   `json:"doc_url"`
}

// AIProvider defines the contract for an LLM provider driver.
type AIProvider interface {
	Name() string
	TestConnection(ctx context.Context, cfg *AIConfig, apiKey string) (*TestResult, error)
	Generate(ctx context.Context, cfg *AIConfig, apiKey string, req *CompletionRequest) (*CompletionResponse, error)
}
