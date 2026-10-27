package mssql

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

// ExplainQuery executes SET SHOWPLAN_TEXT ON on a dedicated connection to retrieve the query execution plan.
func (a *MSSQLAdapter) ExplainQuery(ctx context.Context, query string) (adapter.ExplainResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	cleanQuery = strings.TrimSuffix(cleanQuery, ";")
	if cleanQuery == "" {
		return adapter.ExplainResult{}, fmt.Errorf("mssql explain: query cannot be empty")
	}

	conn, err := a.db.Conn(ctx)
	if err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("mssql explain: acquire connection: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "SET SHOWPLAN_TEXT ON"); err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("mssql explain: enable showplan: %w", err)
	}
	defer conn.ExecContext(ctx, "SET SHOWPLAN_TEXT OFF")

	rows, err := conn.QueryContext(ctx, cleanQuery)
	if err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("mssql explain: %w", err)
	}
	defer rows.Close()

	var planLines []string
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return adapter.ExplainResult{}, fmt.Errorf("mssql explain: scan plan: %w", err)
		}
		planLines = append(planLines, line)
	}
	if err := rows.Err(); err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("mssql explain: iterate plan: %w", err)
	}

	rawPlan := strings.Join(planLines, "\n")
	if strings.TrimSpace(rawPlan) == "" {
		rawPlan = "No execution plan output available."
	}

	return adapter.ExplainResult{
		Plan:            rawPlan,
		Raw:             rawPlan,
		ExecutionTimeMs: adapter.ElapsedMs(start),
		Format:          "text",
	}, nil
}
