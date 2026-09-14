package mongodb

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
	"pebblebase/internal/adapter"
)

var shellCallRegex = regexp.MustCompile(`^db\.([a-zA-Z0-9_\-\.]+)\.([a-zA-Z0-9_]+)\s*\(([\s\S]*)\)`)

func (a *Adapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	start := time.Now()
	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return adapter.RawQueryResult{}, fmt.Errorf("query cannot be empty")
	}

	// 1. Check if it is a Mongo Shell expression: db.collection.method(...)
	if strings.HasPrefix(cleanQuery, "db.") {
		return a.executeShellQuery(ctx, cleanQuery, start)
	}

	// 2. Otherwise handle as JSON / BSON command: {"find": "users", ...}
	return a.executeJSONCommand(ctx, cleanQuery, start)
}

func (a *Adapter) executeShellQuery(ctx context.Context, query string, start time.Time) (adapter.RawQueryResult, error) {
	matches := shellCallRegex.FindStringSubmatch(query)
	if len(matches) < 3 {
		return adapter.RawQueryResult{}, fmt.Errorf("invalid mongo shell syntax: expected db.<collection>.<method>(...)")
	}

	collName := matches[1]
	method := matches[2]
	rawArgs := strings.TrimSpace(matches[3])

	// Strip trailing chained calls if present, e.g. .limit(50)
	limitVal := int64(50)
	skipVal := int64(0)
	if idx := strings.LastIndex(rawArgs, ").limit("); idx != -1 {
		limStr := strings.TrimSuffix(rawArgs[idx+len(").limit("):], ")")
		if l, err := strconv.ParseInt(strings.TrimSpace(limStr), 10, 64); err == nil {
			limitVal = l
		}
		rawArgs = strings.TrimSpace(rawArgs[:idx])
	}
	if idx := strings.LastIndex(rawArgs, ").skip("); idx != -1 {
		skipStr := strings.TrimSuffix(rawArgs[idx+len(").skip("):], ")")
		if s, err := strconv.ParseInt(strings.TrimSpace(skipStr), 10, 64); err == nil {
			skipVal = s
		}
		rawArgs = strings.TrimSpace(rawArgs[:idx])
	}

	coll := a.db.Collection(collName)

	switch method {
	case "find":
		var filter bson.M
		if rawArgs != "" && rawArgs != "{}" {
			if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &filter); err != nil {
				return adapter.RawQueryResult{}, fmt.Errorf("mongodb: parse find filter: %w", err)
			}
		} else {
			filter = bson.M{}
		}

		findOpts := options.Find().SetLimit(limitVal).SetSkip(skipVal)
		cursor, err := coll.Find(ctx, filter, findOpts)
		if err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: find error: %w", err)
		}
		defer cursor.Close(ctx)

		return cursorToResult(ctx, cursor, start, false)

	case "aggregate":
		var pipeline []bson.M
		if rawArgs == "" {
			pipeline = []bson.M{}
		} else {
			if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &pipeline); err != nil {
				// Try single object pipeline wrapper
				var singleStage bson.M
				if err2 := bson.UnmarshalExtJSON([]byte(rawArgs), true, &singleStage); err2 == nil {
					pipeline = []bson.M{singleStage}
				} else {
					return adapter.RawQueryResult{}, fmt.Errorf("mongodb: parse aggregate pipeline: %w", err)
				}
			}
		}

		cursor, err := coll.Aggregate(ctx, pipeline)
		if err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: aggregate error: %w", err)
		}
		defer cursor.Close(ctx)

		return cursorToResult(ctx, cursor, start, false)

	case "count", "countDocuments":
		var filter bson.M
		if rawArgs != "" && rawArgs != "{}" {
			if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &filter); err != nil {
				return adapter.RawQueryResult{}, fmt.Errorf("mongodb: parse count filter: %w", err)
			}
		} else {
			filter = bson.M{}
		}

		count, err := coll.CountDocuments(ctx, filter)
		if err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: count error: %w", err)
		}

		return adapter.RawQueryResult{
			Columns:         []string{"count"},
			Rows:            []map[string]any{{"count": count}},
			ExecutionTimeMs: adapter.ElapsedMs(start),
			RowsAffected:    1,
			IsMutation:      false,
		}, nil

	case "insertOne":
		var doc bson.M
		if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &doc); err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: parse insertOne document: %w", err)
		}
		res, err := coll.InsertOne(ctx, doc)
		if err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: insertOne error: %w", err)
		}
		return adapter.RawQueryResult{
			Columns:         []string{"insertedId"},
			Rows:            []map[string]any{{"insertedId": cleanValue(res.InsertedID)}},
			ExecutionTimeMs: adapter.ElapsedMs(start),
			RowsAffected:    1,
			IsMutation:      true,
		}, nil

	case "deleteMany", "deleteOne":
		var filter bson.M
		if err := bson.UnmarshalExtJSON([]byte(rawArgs), true, &filter); err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: parse delete filter: %w", err)
		}
		var deletedCount int64
		if method == "deleteOne" {
			res, err := coll.DeleteOne(ctx, filter)
			if err != nil {
				return adapter.RawQueryResult{}, fmt.Errorf("mongodb: deleteOne error: %w", err)
			}
			deletedCount = res.DeletedCount
		} else {
			res, err := coll.DeleteMany(ctx, filter)
			if err != nil {
				return adapter.RawQueryResult{}, fmt.Errorf("mongodb: deleteMany error: %w", err)
			}
			deletedCount = res.DeletedCount
		}
		return adapter.RawQueryResult{
			Columns:         []string{"deletedCount"},
			Rows:            []map[string]any{{"deletedCount": deletedCount}},
			ExecutionTimeMs: adapter.ElapsedMs(start),
			RowsAffected:    deletedCount,
			IsMutation:      true,
		}, nil

	default:
		return adapter.RawQueryResult{}, fmt.Errorf("unsupported mongo shell method: %q (supported: find, aggregate, countDocuments, insertOne, deleteOne, deleteMany)", method)
	}
}

func (a *Adapter) executeJSONCommand(ctx context.Context, query string, start time.Time) (adapter.RawQueryResult, error) {
	var cmd bson.D
	if err := bson.UnmarshalExtJSON([]byte(query), true, &cmd); err != nil {
		// Try standard json Unmarshal as fallback
		var rawMap map[string]any
		if err2 := json.Unmarshal([]byte(query), &rawMap); err2 != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: invalid JSON command or query: %w", err)
		}
		bytes, _ := bson.Marshal(rawMap)
		_ = bson.Unmarshal(bytes, &cmd)
	}

	var res bson.M
	if err := a.db.RunCommand(ctx, cmd).Decode(&res); err != nil {
		return adapter.RawQueryResult{}, fmt.Errorf("mongodb: command error: %w", err)
	}

	// Clean BSON response
	cleaned := cleanValue(res).(map[string]any)

	// Check if the command returned a cursor with a batch of documents (e.g. find, aggregate)
	if cursorMap, ok := cleaned["cursor"].(map[string]any); ok {
		if firstBatch, ok := cursorMap["firstBatch"].([]any); ok {
			rows := make([]map[string]any, 0, len(firstBatch))
			colSet := make(map[string]struct{})
			var cols []string

			for _, doc := range firstBatch {
				if docMap, ok := doc.(map[string]any); ok {
					for k := range docMap {
						if _, exists := colSet[k]; !exists {
							colSet[k] = struct{}{}
							cols = append(cols, k)
						}
					}
					rows = append(rows, docMap)
				}
			}

			return adapter.RawQueryResult{
				Columns:         cols,
				Rows:            rows,
				ExecutionTimeMs: adapter.ElapsedMs(start),
				RowsAffected:    int64(len(rows)),
				IsMutation:      false,
			}, nil
		}
	}

	// Single document command response (e.g. {"ok": 1, ...})
	var cols []string
	for k := range cleaned {
		cols = append(cols, k)
	}

	return adapter.RawQueryResult{
		Columns:         cols,
		Rows:            []map[string]any{cleaned},
		ExecutionTimeMs: adapter.ElapsedMs(start),
		RowsAffected:    1,
		IsMutation:      false,
	}, nil
}

func cursorToResult(ctx context.Context, cursor interface {
	Next(context.Context) bool
	Decode(any) error
	Err() error
}, start time.Time, isMutation bool) (adapter.RawQueryResult, error) {
	var rows []map[string]any
	colSet := make(map[string]struct{})
	var cols []string

	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongodb: decode document: %w", err)
		}

		row := make(map[string]any, len(doc))
		for _, elem := range doc {
			if _, exists := colSet[elem.Key]; !exists {
				colSet[elem.Key] = struct{}{}
				cols = append(cols, elem.Key)
			}
			row[elem.Key] = cleanValue(elem.Value)
		}
		rows = append(rows, row)
	}

	if err := cursor.Err(); err != nil {
		return adapter.RawQueryResult{}, fmt.Errorf("mongodb: cursor error: %w", err)
	}

	if rows == nil {
		rows = []map[string]any{}
	}

	// If _id exists in columns, move to front
	for i, c := range cols {
		if c == "_id" && i > 0 {
			cols = append([]string{"_id"}, append(cols[:i], cols[i+1:]...)...)
			break
		}
	}

	return adapter.RawQueryResult{
		Columns:         cols,
		Rows:            rows,
		ExecutionTimeMs: adapter.ElapsedMs(start),
		RowsAffected:    int64(len(rows)),
		IsMutation:      isMutation,
	}, nil
}
