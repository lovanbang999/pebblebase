package clickhouse

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

// ExplainQuery executes EXPLAIN on the given ClickHouse query.
func (a *ClickHouseAdapter) ExplainQuery(ctx context.Context, query string) (adapter.ExplainResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	cleanQuery = strings.TrimSuffix(cleanQuery, ";")
	if cleanQuery == "" {
		return adapter.ExplainResult{}, fmt.Errorf("clickhouse explain: query cannot be empty")
	}

	explainSQL := fmt.Sprintf("EXPLAIN plan = 1, description = 1 %s", cleanQuery)
	rows, err := a.db.QueryContext(ctx, explainSQL)
	if err != nil {
		// Fallback to basic EXPLAIN
		explainSQL = fmt.Sprintf("EXPLAIN %s", cleanQuery)
		rows, err = a.db.QueryContext(ctx, explainSQL)
		if err != nil {
			return adapter.ExplainResult{}, fmt.Errorf("clickhouse explain: %w", err)
		}
	}
	defer rows.Close()

	var planLines []string
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return adapter.ExplainResult{}, fmt.Errorf("clickhouse explain scan: %w", err)
		}
		planLines = append(planLines, line)
	}
	if err := rows.Err(); err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("clickhouse explain iterate: %w", err)
	}

	rawPlan := strings.Join(planLines, "\n")
	if strings.TrimSpace(rawPlan) == "" {
		rawPlan = "No execution plan returned."
	}

	return adapter.ExplainResult{
		Plan:            rawPlan,
		Raw:             rawPlan,
		ExecutionTimeMs: adapter.ElapsedMs(start),
		Format:          "text",
	}, nil
}
