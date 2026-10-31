package mongodb

import (
	"context"
	"fmt"
	"regexp"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"pebblebase/internal/adapter"
)

// FindColumn performs a bounded, read-only column lookup. Mongo's MaxTimeMS
// provides a server-side bound in addition to the request context deadline.
func (a *Adapter) FindColumn(ctx context.Context, table, column string, value any, operator string, limit int) (adapter.ValueMatch, error) {
	if limit < 1 || limit > 4 {
		limit = 4
	}
	matchValue := any(value)
	filter := bson.M{}
	if operator == "contains" {
		filter[column] = bson.M{"$regex": primitive.Regex{Pattern: regexpQuote(fmt.Sprint(value)), Options: "i"}}
	} else if text, ok := value.(string); ok && len(text) == 24 {
		if oid, err := primitive.ObjectIDFromHex(text); err == nil {
			filter[column] = bson.M{"$in": bson.A{matchValue, oid}}
		} else {
			filter[column] = matchValue
		}
	} else {
		filter[column] = matchValue
	}
	coll := a.db.Collection(table)
	maxTime := 2 * time.Second
	findOptions := options.Find().SetLimit(int64(limit)).SetMaxTime(maxTime).SetProjection(bson.M{column: 1, "_id": 1})
	cursor, err := coll.Find(ctx, filter, findOptions)
	if err != nil {
		return adapter.ValueMatch{}, fmt.Errorf("mongodb search: %w", err)
	}
	defer cursor.Close(ctx)
	rows := []map[string]any{}
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return adapter.ValueMatch{}, err
		}
		row := map[string]any{}
		for key, item := range doc {
			row[key] = cleanValue(item)
		}
		rows = append(rows, row)
	}
	if err := cursor.Err(); err != nil {
		return adapter.ValueMatch{}, err
	}
	_ = cursor.Close(ctx)
	count, err := coll.CountDocuments(ctx, filter, options.Count().SetMaxTime(maxTime))
	if err != nil {
		return adapter.ValueMatch{Table: table, Count: len(rows), Column: column, Rows: rows, Truncated: true}, nil
	}
	return adapter.ValueMatch{Table: table, Count: int(count), Column: column, Rows: rows}, nil
}

func regexpQuote(value string) string { return regexp.QuoteMeta(value) }
