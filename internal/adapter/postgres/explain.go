package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

// ExplainQuery executes EXPLAIN (ANALYZE, FORMAT JSON) on the given query.
func (a *PostgresAdapter) ExplainQuery(ctx context.Context, query string) (adapter.ExplainResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	cleanQuery = strings.TrimSuffix(cleanQuery, ";")
	if cleanQuery == "" {
		return adapter.ExplainResult{}, fmt.Errorf("postgres explain: query cannot be empty")
	}

	explainSQL := fmt.Sprintf("EXPLAIN (ANALYZE, FORMAT JSON) %s", cleanQuery)
	rows, err := a.pool.Query(ctx, explainSQL)
	if err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("postgres explain: %w", err)
	}
	defer rows.Close()

	var rawJSON string
	if rows.Next() {
		var val any
		if err := rows.Scan(&val); err != nil {
			return adapter.ExplainResult{}, fmt.Errorf("postgres explain scan: %w", err)
		}
		switch v := val.(type) {
		case string:
			rawJSON = v
		case []byte:
			rawJSON = string(v)
		default:
			b, _ := json.Marshal(v)
			rawJSON = string(b)
		}
	}
	if err := rows.Err(); err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("postgres explain iterate: %w", err)
	}

	if rawJSON == "" {
		return adapter.ExplainResult{}, fmt.Errorf("postgres explain: empty plan returned")
	}

	var parsed any
	if err := json.Unmarshal([]byte(rawJSON), &parsed); err != nil {
		return adapter.ExplainResult{
			Plan:            rawJSON,
			Raw:             rawJSON,
			ExecutionTimeMs: adapter.ElapsedMs(start),
		}, nil
	}

	res := adapter.ExplainResult{
		Plan:            parsed,
		Format:          "EXPLAIN (ANALYZE, JSON)",
		Raw:             rawJSON,
		ExecutionTimeMs: adapter.ElapsedMs(start),
	}

	// Extract metrics from PostgreSQL JSON output:
	// [ { "Plan": { ... }, "Planning Time": ..., "Execution Time": ... } ]
	if arr, ok := parsed.([]any); ok && len(arr) > 0 {
		if rootObj, ok := arr[0].(map[string]any); ok {
			if execTime, ok := rootObj["Execution Time"].(float64); ok && execTime > 0 {
				res.ExecutionTimeMs = execTime
			}
			if planNode, ok := rootObj["Plan"].(map[string]any); ok {
				extractPostgresPlanStats(planNode, &res)
			}
		}
	}

	return res, nil
}

func extractPostgresPlanStats(node map[string]any, res *adapter.ExplainResult) {
	if res.ActualRows == nil {
		if act, ok := node["Actual Rows"].(float64); ok {
			actInt := int64(act)
			res.ActualRows = &actInt
		}
	}
	if res.EstimatedRows == nil {
		if est, ok := node["Plan Rows"].(float64); ok {
			estInt := int64(est)
			res.EstimatedRows = &estInt
		}
	}
	if res.IndexUsed == "" {
		if idxName, ok := node["Index Name"].(string); ok && idxName != "" {
			res.IndexUsed = idxName
		}
	}

	// Recursively search child plans if index not found yet
	if plans, ok := node["Plans"].([]any); ok {
		for _, child := range plans {
			if childNode, ok := child.(map[string]any); ok {
				if res.IndexUsed == "" {
					if idxName, ok := childNode["Index Name"].(string); ok && idxName != "" {
						res.IndexUsed = idxName
					}
				}
				if res.IndexUsed != "" && res.ActualRows != nil && res.EstimatedRows != nil {
					break
				}
			}
		}
	}
}
