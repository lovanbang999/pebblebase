package mongodb

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"pebblebase/internal/adapter"
)

// PreviewPipeline executes the given pipeline stages with a safety limit guard and returns intermediate documents.
func (a *Adapter) PreviewPipeline(ctx context.Context, table string, stagesJSON string, limit int) (*adapter.PipelinePreviewResult, error) {
	start := time.Now()

	trimmed := strings.TrimSpace(stagesJSON)
	if trimmed == "" || trimmed == "[]" {
		trimmed = "[]"
	}

	var rawStages []bson.D
	if err := bson.UnmarshalExtJSON([]byte(trimmed), true, &rawStages); err != nil {
		// Fallback attempt: if passed as []bson.M
		var mStages []bson.M
		if errM := bson.UnmarshalExtJSON([]byte(trimmed), true, &mStages); errM != nil {
			return nil, fmt.Errorf("invalid aggregation pipeline JSON: %w", err)
		}
		rawStages = make([]bson.D, 0, len(mStages))
		for _, m := range mStages {
			d := make(bson.D, 0, len(m))
			for k, v := range m {
				d = append(d, bson.E{Key: k, Value: v})
			}
			rawStages = append(rawStages, d)
		}
	}

	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	pipeline := make(mongo.Pipeline, 0, len(rawStages)+1)
	for _, stage := range rawStages {
		pipeline = append(pipeline, stage)
	}
	pipeline = append(pipeline, bson.D{{Key: "$limit", Value: int64(limit)}})

	coll := a.db.Collection(table)
	cursor, err := coll.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("pipeline preview failed: %w", err)
	}
	defer cursor.Close(ctx)

	rows := make([]map[string]any, 0)
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return nil, fmt.Errorf("decode document: %w", err)
		}

		cleanRow := make(map[string]any, len(doc))
		for _, elem := range doc {
			cleanRow[elem.Key] = cleanValue(elem.Value)
		}
		rows = append(rows, cleanRow)
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("cursor iteration error: %w", err)
	}

	return &adapter.PipelinePreviewResult{
		Documents:       rows,
		Count:           len(rows),
		ExecutionTimeMs: adapter.ElapsedMs(start),
	}, nil
}
