package ai

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"pebblebase/internal/storage"
)

// Service coordinates AI configuration persistence, encryption, and provider routing.
type Service struct {
	store     *Store
	enc       *storage.Encryptor
	providers map[string]AIProvider
}

// NewService creates a new AI Service instance with all registered providers.
func NewService(store *Store, enc *storage.Encryptor) *Service {
	s := &Service{
		store:     store,
		enc:       enc,
		providers: make(map[string]AIProvider),
	}

	s.RegisterProvider(NewOpenAIProvider(ProviderOpenAI))
	s.RegisterProvider(NewGeminiProvider())
	s.RegisterProvider(NewAnthropicProvider())
	s.RegisterProvider(NewOpenAIProvider(ProviderGroq))
	s.RegisterProvider(NewOllamaProvider())

	return s
}

// RegisterProvider adds or overrides a provider driver.
func (s *Service) RegisterProvider(p AIProvider) {
	s.providers[strings.ToLower(p.Name())] = p
}

// GetProvider retrieves a provider driver by name.
func (s *Service) GetProvider(name string) (AIProvider, error) {
	p, ok := s.providers[strings.ToLower(strings.TrimSpace(name))]
	if !ok {
		return nil, fmt.Errorf("unsupported AI provider: %q", name)
	}
	return p, nil
}

// GetConfig returns the active configuration with masked secrets for frontend consumption.
func (s *Service) GetConfig(ctx context.Context) (*ConfigPayload, error) {
	cfg, rawKey, err := s.store.GetActiveConfig(ctx)
	if err != nil {
		return nil, err
	}
	if cfg == nil {
		// Return sensible defaults
		return &ConfigPayload{
			Provider:    ProviderOpenAI,
			Model:       "gpt-4o-mini",
			BaseURL:     "https://api.openai.com/v1",
			HasKey:      false,
			KeyMask:     "",
			Temperature: 0.2,
			MaxTokens:   2048,
		}, nil
	}

	return &ConfigPayload{
		Provider:    cfg.Provider,
		Model:       cfg.Model,
		BaseURL:     cfg.BaseURL,
		HasKey:      rawKey != "",
		KeyMask:     MaskKey(rawKey),
		Temperature: cfg.Temperature,
		MaxTokens:   cfg.MaxTokens,
	}, nil
}

// SaveConfig persists the AI configuration, encrypting any newly supplied API key.
func (s *Service) SaveConfig(ctx context.Context, payload *ConfigPayload) (*ConfigPayload, error) {
	cfg, err := s.store.SaveConfig(ctx, payload)
	if err != nil {
		return nil, err
	}

	var rawKey string
	if cfg.APIKeyEncrypted != "" {
		decrypted, _ := s.enc.Decrypt(cfg.APIKeyEncrypted)
		rawKey = decrypted
	}

	return &ConfigPayload{
		Provider:    cfg.Provider,
		Model:       cfg.Model,
		BaseURL:     cfg.BaseURL,
		HasKey:      rawKey != "",
		KeyMask:     MaskKey(rawKey),
		Temperature: cfg.Temperature,
		MaxTokens:   cfg.MaxTokens,
	}, nil
}

// TestConnection verifies connectivity with the given or active provider.
func (s *Service) TestConnection(ctx context.Context, payload *ConfigPayload) (*TestResult, error) {
	providerName := strings.ToLower(strings.TrimSpace(payload.Provider))
	p, err := s.GetProvider(providerName)
	if err != nil {
		return nil, err
	}

	effectiveKey := strings.TrimSpace(payload.APIKey)
	if effectiveKey == "" && providerName != ProviderOllama {
		// Attempt to load existing active key if not passed explicitly in payload
		activeCfg, rawKey, err := s.store.GetActiveConfig(ctx)
		if err == nil && activeCfg != nil && activeCfg.Provider == providerName {
			effectiveKey = rawKey
		}
	}

	tempCfg := &AIConfig{
		Provider:    providerName,
		Model:       payload.Model,
		BaseURL:     payload.BaseURL,
		Temperature: payload.Temperature,
		MaxTokens:   payload.MaxTokens,
	}

	return p.TestConnection(ctx, tempCfg, effectiveKey)
}

// Generate invokes the active provider to generate an LLM response.
func (s *Service) Generate(ctx context.Context, req *CompletionRequest) (*CompletionResponse, error) {
	cfg, rawKey, err := s.store.GetActiveConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("retrieve ai config: %w", err)
	}
	if cfg == nil {
		return nil, errors.New("no active AI provider configured. Please configure an AI provider in Settings")
	}

	p, err := s.GetProvider(cfg.Provider)
	if err != nil {
		return nil, err
	}

	return p.Generate(ctx, cfg, rawKey, req)
}

// GetSupportedProviders returns static catalogue data for all supported providers.
func (s *Service) GetSupportedProviders() []ProviderInfo {
	return []ProviderInfo{
		{
			ID:             ProviderOpenAI,
			Name:           "OpenAI",
			DefaultBaseURL: "https://api.openai.com/v1",
			DefaultModel:   "gpt-4o-mini",
			Models: []string{
				"gpt-4o-mini",
				"gpt-4o",
				"o3-mini",
				"gpt-4-turbo",
			},
			RequiresKey: true,
			DocURL:      "https://platform.openai.com/api-keys",
		},
		{
			ID:             ProviderGemini,
			Name:           "Google Gemini",
			DefaultBaseURL: "https://generativelanguage.googleapis.com",
			DefaultModel:   "gemini-2.0-flash",
			Models: []string{
				"gemini-2.0-flash",
				"gemini-1.5-flash",
				"gemini-1.5-pro",
			},
			RequiresKey: true,
			DocURL:      "https://aistudio.google.com/app/apikey",
		},
		{
			ID:             ProviderAnthropic,
			Name:           "Anthropic Claude",
			DefaultBaseURL: "https://api.anthropic.com/v1",
			DefaultModel:   "claude-3-5-haiku-20241022",
			Models: []string{
				"claude-3-5-haiku-20241022",
				"claude-3-5-sonnet-20241022",
				"claude-3-opus-20240229",
			},
			RequiresKey: true,
			DocURL:      "https://console.anthropic.com/settings/keys",
		},
		{
			ID:             ProviderGroq,
			Name:           "Groq",
			DefaultBaseURL: "https://api.groq.com/openai/v1",
			DefaultModel:   "llama-3.3-70b-versatile",
			Models: []string{
				"llama-3.3-70b-versatile",
				"llama-3.1-8b-instant",
				"deepseek-r1-distill-llama-70b",
				"mixtral-8x7b-32768",
			},
			RequiresKey: true,
			DocURL:      "https://console.groq.com/keys",
		},
		{
			ID:             ProviderOllama,
			Name:           "Local Ollama",
			DefaultBaseURL: "http://localhost:11434",
			DefaultModel:   "qwen2.5-coder:latest",
			Models: []string{
				"qwen2.5-coder:latest",
				"llama3.2:latest",
				"deepseek-coder-v2:latest",
				"mistral:latest",
				"codellama:latest",
			},
			RequiresKey: false,
			DocURL:      "https://ollama.com",
		},
	}
}

// AssistQuery processes a QueryAssistRequest (generate, fix, or explain) using the active AI provider.
func (s *Service) AssistQuery(ctx context.Context, req *QueryAssistRequest) (*QueryAssistResponse, error) {
	if req == nil {
		return nil, errors.New("query assist request cannot be nil")
	}

	messages := BuildPrompt(req)

	compReq := &CompletionRequest{
		Messages: messages,
	}

	resp, err := s.Generate(ctx, compReq)
	if err != nil {
		return nil, err
	}

	parsed := ParseAssistResponse(resp.Content)
	return parsed, nil
}
