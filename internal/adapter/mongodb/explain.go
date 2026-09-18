package mongodb

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"pebblebase/internal/adapter"
)

// ExplainQuery executes an explain command with "executionStats" verbosity on the MongoDB query.
func (a *Adapter) ExplainQuery(ctx context.Context, query string) (adapter.ExplainResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return adapter.ExplainResult{}, fmt.Errorf("mongodb explain: query cannot be empty")
	}

	var explainCmd bson.D

	if strings.HasPrefix(cleanQuery, "db.") {
		matches := shellCallRegex.FindStringSubmatch(cleanQuery)
		if len(matches) < 3 {
			return adapter.ExplainResult{}, fmt.Errorf("invalid mongo shell syntax: expected db.<collection>.<method>(...)")
		}
		collName := matches[1]
		method := matches[2]
		rawArgs := strings.TrimSpace(matches[3])

		// Strip trailing chained calls if present, e.g. .limit(50)
		if idx := strings.LastIndex(rawArgs, ").limit("); idx != -1 {
			rawArgs = strings.TrimSpace(rawArgs[:idx])
		}
		if idx := strings.LastIndex(rawArgs, ").skip("); idx != -1 {
			rawArgs = strings.TrimSpace(rawArgs[:idx])
		}

		switch method {
		case "find":
			var filter bson.M
			if rawArgs != "" && rawArgs != "{}" {
				if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &filter); err != nil {
					return adapter.ExplainResult{}, fmt.Errorf("mongodb explain: parse find filter: %w", err)
				}
			} else {
				filter = bson.M{}
			}

			explainCmd = bson.D{
				{Key: "explain", Value: bson.D{
					{Key: "find", Value: collName},
					{Key: "filter", Value: filter},
				}},
				{Key: "verbosity", Value: "executionStats"},
			}

		case "aggregate":
			var pipeline []bson.M
			if rawArgs == "" {
				pipeline = []bson.M{}
			} else {
				if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &pipeline); err != nil {
					var singleStage bson.M
					if err2 := bson.UnmarshalExtJSON([]byte(rawArgs), true, &singleStage); err2 == nil {
						pipeline = []bson.M{singleStage}
					} else {
						return adapter.ExplainResult{}, fmt.Errorf("mongodb explain: parse pipeline: %w", err)
					}
				}
			}

			explainCmd = bson.D{
				{Key: "explain", Value: bson.D{
					{Key: "aggregate", Value: collName},
					{Key: "pipeline", Value: pipeline},
					{Key: "cursor", Value: bson.M{}},
				}},
				{Key: "verbosity", Value: "executionStats"},
			}

		case "countDocuments":
			var filter bson.M
			if rawArgs != "" && rawArgs != "{}" {
				if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &filter); err != nil {
					filter = bson.M{}
				}
			} else {
				filter = bson.M{}
			}

			explainCmd = bson.D{
				{Key: "explain", Value: bson.D{
					{Key: "count", Value: collName},
					{Key: "query", Value: filter},
				}},
				{Key: "verbosity", Value: "executionStats"},
			}

		default:
			return adapter.ExplainResult{}, fmt.Errorf("mongodb explain: method %q is not supported for explain", method)
		}
	} else {
		// Treat as JSON command doc
		var cmdDoc bson.M
		if err := bson.UnmarshalExtJSON([]byte(cleanQuery), true, &cmdDoc); err != nil {
			return adapter.ExplainResult{}, fmt.Errorf("mongodb explain: parse command json: %w", err)
		}
		explainCmd = bson.D{
			{Key: "explain", Value: cmdDoc},
			{Key: "verbosity", Value: "executionStats"},
		}
	}

	var explainResult bson.M
	if err := a.db.RunCommand(ctx, explainCmd).Decode(&explainResult); err != nil {
		return adapter.ExplainResult{}, fmt.Errorf("mongodb explain execution: %w", err)
	}

	rawJSONBytes, err := json.MarshalIndent(explainResult, "", "  ")
	rawJSON := string(rawJSONBytes)
	if err != nil {
		rawJSON = fmt.Sprintf("%v", explainResult)
	}

	res := adapter.ExplainResult{
		Plan:            explainResult,
		Format:          "executionStats",
		Raw:             rawJSON,
		ExecutionTimeMs: adapter.ElapsedMs(start),
	}

	extractMongoPlanStats(explainResult, &res)

	return res, nil
}

func extractMongoPlanStats(node map[string]any, res *adapter.ExplainResult) {
	for k, v := range node {
		if k == "executionStats" {
			if statsMap, ok := v.(map[string]any); ok {
				if nRet, ok := statsMap["nReturned"].(int32); ok {
					rows := int64(nRet)
					res.ActualRows = &rows
				} else if nRet64, ok := statsMap["nReturned"].(int64); ok {
					res.ActualRows = &nRet64
				} else if nRetFloat, ok := statsMap["nReturned"].(float64); ok {
					rows := int64(nRetFloat)
					res.ActualRows = &rows
				}

				if timeMs, ok := statsMap["executionTimeMillis"].(int32); ok {
					res.ExecutionTimeMs = float64(timeMs)
				} else if timeMs64, ok := statsMap["executionTimeMillis"].(int64); ok {
					res.ExecutionTimeMs = float64(timeMs64)
				} else if timeMsFloat, ok := statsMap["executionTimeMillis"].(float64); ok {
					res.ExecutionTimeMs = timeMsFloat
				}

				if totalDocs, ok := statsMap["totalDocsExamined"].(int32); ok && res.EstimatedRows == nil {
					est := int64(totalDocs)
					res.EstimatedRows = &est
				} else if totalDocs64, ok := statsMap["totalDocsExamined"].(int64); ok && res.EstimatedRows == nil {
					res.EstimatedRows = &totalDocs64
				}
			}
		}

		if (k == "indexName" || k == "index") && res.IndexUsed == "" {
			if s, ok := v.(string); ok && s != "" && s != "None" {
				res.IndexUsed = s
			}
		}

		if childMap, ok := v.(map[string]any); ok {
			extractMongoPlanStats(childMap, res)
		} else if childArr, ok := v.([]any); ok {
			for _, item := range childArr {
				if itemMap, ok := item.(map[string]any); ok {
					extractMongoPlanStats(itemMap, res)
				}
			}
		}
	}
}
