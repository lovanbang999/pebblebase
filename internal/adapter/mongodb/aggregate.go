package mongodb

import (
	"context"
	"fmt"
	"math"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"pebblebase/internal/adapter"
)

// Aggregate computes column analytics, distributions, time-series, or stats for MongoDB collections.
func (a *Adapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
	coll := a.db.Collection(table)

	filter, err := buildFilter(opts.Filters)
	if err != nil {
		return adapter.AggregateResult{}, fmt.Errorf("mongodb build filter: %w", err)
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 10
	}

	fn := strings.ToLower(opts.Function)
	if fn == "" {
		fn = "distribution"
	}

	switch fn {
	case "distribution":
		pipeline := mongo.Pipeline{
			{{Key: "$match", Value: filter}},
			{{Key: "$group", Value: bson.D{
				{Key: "_id", Value: "$" + opts.Column},
				{Key: "cnt", Value: bson.D{{Key: "$sum", Value: 1}}},
			}}},
			{{Key: "$sort", Value: bson.D{{Key: "cnt", Value: -1}}}},
			{{Key: "$limit", Value: int64(limit)}},
		}

		cursor, err := coll.Aggregate(ctx, pipeline)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mongodb aggregate distribution: %w", err)
		}
		defer cursor.Close(ctx)

		var labels []string
		var values []any
		for cursor.Next(ctx) {
			var doc struct {
				ID  any   `bson:"_id"`
				Cnt int64 `bson:"cnt"`
			}
			if err := cursor.Decode(&doc); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mongodb decode distribution: %w", err)
			}
			label := "(NULL)"
			if doc.ID != nil {
				label = fmt.Sprint(doc.ID)
			}
			labels = append(labels, label)
			values = append(values, doc.Cnt)
		}
		if labels == nil {
			labels = []string{}
			values = []any{}
		}

		return adapter.AggregateResult{
			Labels: labels,
			Values: values,
		}, nil

	case "timeseries":
		formatStr := "%Y-%m-%d"
		switch strings.ToLower(opts.GroupBy) {
		case "week":
			formatStr = "%Y-W%V"
		case "month":
			formatStr = "%Y-%m"
		}

		// Ensure target column is present and not null
		matchFilter := bson.M{}
		for k, v := range filter {
			matchFilter[k] = v
		}
		matchFilter[opts.Column] = bson.M{"$ne": nil}

		pipeline := mongo.Pipeline{
			{{Key: "$match", Value: matchFilter}},
			{{Key: "$group", Value: bson.D{
				{Key: "_id", Value: bson.D{
					{Key: "$dateToString", Value: bson.D{
						{Key: "format", Value: formatStr},
						{Key: "date", Value: "$" + opts.Column},
					}},
				}},
				{Key: "cnt", Value: bson.D{{Key: "$sum", Value: 1}}},
			}}},
			{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
			{{Key: "$limit", Value: int64(limit * 10)}},
		}

		cursor, err := coll.Aggregate(ctx, pipeline)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mongodb aggregate timeseries: %w", err)
		}
		defer cursor.Close(ctx)

		var labels []string
		var values []any
		for cursor.Next(ctx) {
			var doc struct {
				ID  any   `bson:"_id"`
				Cnt int64 `bson:"cnt"`
			}
			if err := cursor.Decode(&doc); err != nil {
				return adapter.AggregateResult{}, fmt.Errorf("mongodb decode timeseries: %w", err)
			}
			if doc.ID != nil {
				labels = append(labels, fmt.Sprint(doc.ID))
				values = append(values, doc.Cnt)
			}
		}
		if labels == nil {
			labels = []string{}
			values = []any{}
		}

		return adapter.AggregateResult{
			Labels: labels,
			Values: values,
		}, nil

	case "stats", "summary":
		pipeline := mongo.Pipeline{
			{{Key: "$match", Value: filter}},
			{{Key: "$group", Value: bson.D{
				{Key: "_id", Value: nil},
				{Key: "total_rows", Value: bson.D{{Key: "$sum", Value: 1}}},
				{Key: "null_count", Value: bson.D{
					{Key: "$sum", Value: bson.D{
						{Key: "$cond", Value: bson.A{
							bson.D{{Key: "$or", Value: bson.A{
								bson.D{{Key: "$eq", Value: bson.A{"$" + opts.Column, nil}}},
								bson.D{{Key: "$not", Value: bson.A{"$" + opts.Column}}},
							}}},
							1,
							0,
						}},
					}},
				}},
				{Key: "min", Value: bson.D{{Key: "$min", Value: "$" + opts.Column}}},
				{Key: "max", Value: bson.D{{Key: "$max", Value: "$" + opts.Column}}},
				{Key: "avg", Value: bson.D{{Key: "$avg", Value: "$" + opts.Column}}},
				{Key: "sum", Value: bson.D{{Key: "$sum", Value: "$" + opts.Column}}},
			}}},
		}

		cursor, err := coll.Aggregate(ctx, pipeline)
		if err != nil {
			return adapter.AggregateResult{}, fmt.Errorf("mongodb aggregate stats: %w", err)
		}
		defer cursor.Close(ctx)

		stats := map[string]any{
			"total_rows":     int64(0),
			"non_null_count": int64(0),
			"null_count":     int64(0),
		}

		if cursor.Next(ctx) {
			var doc struct {
				TotalRows int64 `bson:"total_rows"`
				NullCount int64 `bson:"null_count"`
				Min       any   `bson:"min"`
				Max       any   `bson:"max"`
				Avg       any   `bson:"avg"`
				Sum       any   `bson:"sum"`
			}
			if err := cursor.Decode(&doc); err == nil {
				stats["total_rows"] = doc.TotalRows
				stats["null_count"] = doc.NullCount
				stats["non_null_count"] = doc.TotalRows - doc.NullCount
				if doc.Min != nil {
					stats["min"] = doc.Min
				}
				if doc.Max != nil {
					stats["max"] = doc.Max
				}
				if doc.Avg != nil {
					if f, ok := toFloat(doc.Avg); ok {
						stats["avg"] = round2(f)
					}
				}
				if doc.Sum != nil {
					if f, ok := toFloat(doc.Sum); ok {
						stats["sum"] = round2(f)
					}
				}
			}
		}

		nonNull := stats["non_null_count"]
		nulls := stats["null_count"]

		return adapter.AggregateResult{
			Labels: []string{"Non-Null", "Null"},
			Values: []any{nonNull, nulls},
			Stats:  stats,
		}, nil

	default:
		return adapter.AggregateResult{}, fmt.Errorf("unsupported mongodb aggregate function: %s", fn)
	}
}

// GetTableStats returns document count and storage size for a MongoDB collection.
func (a *Adapter) GetTableStats(ctx context.Context, table string) (adapter.TableStats, error) {
	coll := a.db.Collection(table)
	count, err := coll.EstimatedDocumentCount(ctx)
	if err != nil {
		count, _ = coll.CountDocuments(ctx, bson.M{})
	}

	var sizeBytes int64
	var result bson.M
	if err := a.db.RunCommand(ctx, bson.D{{Key: "collStats", Value: table}}).Decode(&result); err == nil {
		if s, ok := result["storageSize"]; ok {
			if f, ok := toFloat(s); ok {
				sizeBytes = int64(f)
			}
		}
	}

	return adapter.TableStats{
		TotalRows: count,
		SizeBytes: sizeBytes,
	}, nil
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case int32:
		return float64(n), true
	default:
		return 0, false
	}
}

func round2(f float64) float64 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	return math.Round(f*100) / 100
}
