package mysql

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

// ExplainQuery executes EXPLAIN FORMAT=JSON on the given query.
func (a *MySQLAdapter) ExplainQuery(ctx context.Context, query string) (adapter.ExplainResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	cleanQuery = strings.TrimSuffix(cleanQuery, ";")
	if cleanQuery == "" {
		return adapter.ExplainResult{}, fmt.Errorf("mysql explain: query cannot be empty")
	}

	explainSQL := fmt.Sprintf("EXPLAIN FORMAT=JSON %s", cleanQuery)
	rows, err := a.db.QueryContext(ctx, explainSQL)
	if err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("mysql explain: %w", err)
	}
	defer rows.Close()

	var rawJSON string
	if rows.Next() {
		var val any
		if err := rows.Scan(&val); err != nil {
			return adapter.ExplainResult{}, fmt.Errorf("mysql explain scan: %w", err)
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
		return adapter.ExplainResult{}, fmt.Errorf("mysql explain iterate: %w", err)
	}

	if rawJSON == "" {
		return adapter.ExplainResult{}, fmt.Errorf("mysql explain: empty plan returned")
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
		Format:          "EXPLAIN FORMAT=JSON",
		Raw:             rawJSON,
		ExecutionTimeMs: adapter.ElapsedMs(start),
	}

	// Extract stats from MySQL JSON plan
	if rootObj, ok := parsed.(map[string]any); ok {
		extractMySQLPlanStats(rootObj, &res)
	}

	return res, nil
}

func extractMySQLPlanStats(obj map[string]any, res *adapter.ExplainResult) {
	for k, v := range obj {
		if k == "key" && res.IndexUsed == "" {
			if s, ok := v.(string); ok && s != "" && s != "NULL" {
				res.IndexUsed = s
			}
		}
		if (k == "rows_examined_per_scan" || k == "rows_produced_per_join") && res.EstimatedRows == nil {
			switch n := v.(type) {
			case float64:
				val := int64(n)
				res.EstimatedRows = &val
			case string:
				if parsed, err := strconv.ParseInt(n, 10, 64); err == nil {
					res.EstimatedRows = &parsed
				}
			}
		}
		if childMap, ok := v.(map[string]any); ok {
			extractMySQLPlanStats(childMap, res)
		} else if childArr, ok := v.([]any); ok {
			for _, item := range childArr {
				if itemMap, ok := item.(map[string]any); ok {
					extractMySQLPlanStats(itemMap, res)
				}
			}
		}
	}
}
