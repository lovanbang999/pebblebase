package sqlite

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

var indexRegex = regexp.MustCompile(`USING (?:COVERING )?INDEX ([a-zA-Z0-9_]+)`)

// SQLitePlanNode represents a node in SQLite's EXPLAIN QUERY PLAN tree.
type SQLitePlanNode struct {
	ID     int64             `json:"id"`
	Parent int64             `json:"parent"`
	Detail string            `json:"detail"`
	Nodes  []*SQLitePlanNode `json:"nodes,omitempty"`
}

// ExplainQuery executes EXPLAIN QUERY PLAN on the given query.
func (a *SQLiteAdapter) ExplainQuery(ctx context.Context, query string) (adapter.ExplainResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	cleanQuery = strings.TrimSuffix(cleanQuery, ";")
	if cleanQuery == "" {
		return adapter.ExplainResult{}, fmt.Errorf("sqlite explain: query cannot be empty")
	}

	explainSQL := fmt.Sprintf("EXPLAIN QUERY PLAN %s", cleanQuery)
	rows, err := a.db.QueryContext(ctx, explainSQL)
	if err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("sqlite explain: %w", err)
	}
	defer rows.Close()

	var nodes []*SQLitePlanNode
	nodeMap := make(map[int64]*SQLitePlanNode)
	var rootNodes []*SQLitePlanNode
	var rawLines []string
	var indexUsed string

	for rows.Next() {
		var id, parent, notused int64
		var detail string
		if err := rows.Scan(&id, &parent, &notused, &detail); err != nil {
			return adapter.ExplainResult{}, fmt.Errorf("sqlite explain scan: %w", err)
		}

		rawLines = append(rawLines, fmt.Sprintf("[%d -> %d] %s", id, parent, detail))

		if indexUsed == "" {
			if m := indexRegex.FindStringSubmatch(detail); len(m) > 1 {
				indexUsed = m[1]
			}
		}

		node := &SQLitePlanNode{
			ID:     id,
			Parent: parent,
			Detail: detail,
			Nodes:  []*SQLitePlanNode{},
		}
		nodes = append(nodes, node)
		nodeMap[id] = node
	}
	if err := rows.Err(); err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("sqlite explain iterate: %w", err)
	}

	// Build tree from id/parent relationships
	for _, node := range nodes {
		if parentNode, exists := nodeMap[node.Parent]; exists && node.Parent != node.ID {
			parentNode.Nodes = append(parentNode.Nodes, node)
		} else {
			rootNodes = append(rootNodes, node)
		}
	}

	rawSummary := strings.Join(rawLines, "\n")

	return adapter.ExplainResult{
		Plan:            rootNodes,
		Format:          "EXPLAIN QUERY PLAN",
		Raw:             rawSummary,
		IndexUsed:       indexUsed,
		ExecutionTimeMs: adapter.ElapsedMs(start),
	}, nil
}
