package redis

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

// Ensure Adapter implements adapter.QueryExplainer at compile time.
var _ adapter.QueryExplainer = (*Adapter)(nil)

// ExplainQuery provides execution plan / memory analysis for a Redis command or key.
func (a *Adapter) ExplainQuery(ctx context.Context, query string) (adapter.ExplainResult, error) {
	start := time.Now()
	explainCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return adapter.ExplainResult{
			Format: "text",
			Raw:    "Empty Redis command",
		}, nil
	}

	args, err := parseCommandArgs(trimmed)
	if err != nil {
		return adapter.ExplainResult{}, err
	}
	if len(args) == 0 {
		return adapter.ExplainResult{
			Format: "text",
			Raw:    "No command specified",
		}, nil
	}

	cmdName := strings.ToUpper(args[0])
	var rawExplanation strings.Builder
	rawExplanation.WriteString(fmt.Sprintf("Command: %s\n", cmdName))
	rawExplanation.WriteString(fmt.Sprintf("Arguments: %v\n", args[1:]))

	// If command specifies a target key as second argument, inspect memory and type
	if len(args) > 1 {
		targetKey := args[1]
		kType, _ := a.client.Type(explainCtx, targetKey).Result()
		memBytes, _ := a.client.MemoryUsage(explainCtx, targetKey).Result()
		ttl, _ := a.client.TTL(explainCtx, targetKey).Result()

		rawExplanation.WriteString(fmt.Sprintf("Target Key: %s\n", targetKey))
		rawExplanation.WriteString(fmt.Sprintf("Key Type: %s\n", kType))
		rawExplanation.WriteString(fmt.Sprintf("Memory Footprint: %d bytes\n", memBytes))
		rawExplanation.WriteString(fmt.Sprintf("TTL: %v\n", ttl))
	}

	elapsed := adapter.ElapsedMs(start)
	return adapter.ExplainResult{
		Plan: map[string]any{
			"command":   cmdName,
			"arguments": args[1:],
			"database":  fmt.Sprintf("db%d", a.dbIndex),
		},
		ExecutionTimeMs: elapsed,
		Format:          "text",
		Raw:             rawExplanation.String(),
	}, nil
}
