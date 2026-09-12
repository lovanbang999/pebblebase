package mongodb

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"pebblebase/internal/adapter"
)

// Query fetches documents matching opts from the specified MongoDB collection.
func (a *Adapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	coll := a.db.Collection(table)

	filter, err := buildFilter(opts.Filters)
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mongodb: build filter: %w", err)
	}

	totalCount, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mongodb: count documents: %w", err)
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}

	findOpts := options.Find().
		SetSkip(int64(opts.Offset)).
		SetLimit(int64(limit))

	if opts.SortBy != "" {
		dir := 1
		if opts.SortDesc {
			dir = -1
		}
		findOpts.SetSort(bson.D{{Key: opts.SortBy, Value: dir}})
	} else {
		// Stable ordering by _id
		findOpts.SetSort(bson.D{{Key: "_id", Value: 1}})
	}

	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mongodb: find documents: %w", err)
	}
	defer cursor.Close(ctx)

	rows := make([]map[string]any, 0)
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return adapter.QueryResult{}, fmt.Errorf("mongodb: decode document: %w", err)
		}

		cleanRow := make(map[string]any, len(doc))
		for _, elem := range doc {
			cleanRow[elem.Key] = cleanValue(elem.Value)
		}
		rows = append(rows, cleanRow)
	}

	if err := cursor.Err(); err != nil {
		return adapter.QueryResult{}, fmt.Errorf("mongodb: cursor error: %w", err)
	}

	return adapter.QueryResult{
		Rows:       rows,
		TotalCount: int(totalCount),
	}, nil
}

// buildFilter converts a list of adapter.Filter items into a BSON filter document.
func buildFilter(filters []adapter.Filter) (bson.M, error) {
	if len(filters) == 0 {
		return bson.M{}, nil
	}

	m := make(bson.M, len(filters))
	for _, f := range filters {
		val := normalizeFilterVal(f.Column, f.Value)

		switch f.Operator {
		case "eq":
			m[f.Column] = val
		case "neq":
			m[f.Column] = bson.M{"$ne": val}
		case "gt":
			m[f.Column] = bson.M{"$gt": parseNumericIfPossible(val)}
		case "lt":
			m[f.Column] = bson.M{"$lt": parseNumericIfPossible(val)}
		case "contains":
			m[f.Column] = bson.M{
				"$regex":   regexp.QuoteMeta(fmt.Sprint(val)),
				"$options": "i",
			}
		case "in":
			m[f.Column] = bson.M{"$in": parseInSlice(f.Column, val)}
		default:
			return nil, fmt.Errorf("unsupported filter operator: %q", f.Operator)
		}
	}
	return m, nil
}

func normalizeFilterVal(col string, val any) any {
	if col == "_id" {
		if s, ok := val.(string); ok && len(s) == 24 {
			if oid, err := primitive.ObjectIDFromHex(s); err == nil {
				return oid
			}
		}
	}
	return val
}

func parseNumericIfPossible(v any) any {
	if s, ok := v.(string); ok {
		if i, err := strconv.ParseInt(s, 10, 64); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
	}
	return v
}

func parseInSlice(col string, val any) []any {
	switch v := val.(type) {
	case []any:
		res := make([]any, len(v))
		for i, item := range v {
			res[i] = normalizeFilterVal(col, item)
		}
		return res
	case string:
		parts := strings.Split(v, ",")
		res := make([]any, len(parts))
		for i, p := range parts {
			res[i] = normalizeFilterVal(col, strings.TrimSpace(p))
		}
		return res
	default:
		return []any{normalizeFilterVal(col, val)}
	}
}

// cleanValue converts BSON-specific types into clean Go standard types for JSON marshaling.
func cleanValue(v any) any {
	switch val := v.(type) {
	case primitive.ObjectID:
		return val.Hex()
	case primitive.DateTime:
		return val.Time().Format(time.RFC3339)
	case primitive.Timestamp:
		return time.Unix(int64(val.T), 0).Format(time.RFC3339)
	case primitive.Decimal128:
		return val.String()
	case primitive.Binary:
		return val.Data
	case primitive.A:
		res := make([]any, len(val))
		for i, elem := range val {
			res[i] = cleanValue(elem)
		}
		return res
	case []any:
		res := make([]any, len(val))
		for i, elem := range val {
			res[i] = cleanValue(elem)
		}
		return res
	case primitive.D:
		res := make(map[string]any, len(val))
		for _, elem := range val {
			res[elem.Key] = cleanValue(elem.Value)
		}
		return res
	case bson.M:
		res := make(map[string]any, len(val))
		for k, elem := range val {
			res[k] = cleanValue(elem)
		}
		return res
	case map[string]any:
		res := make(map[string]any, len(val))
		for k, elem := range val {
			res[k] = cleanValue(elem)
		}
		return res
	case nil, primitive.Null, primitive.Undefined:
		return nil
	default:
		return val
	}
}
