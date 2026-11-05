package mongodb

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"pebblebase/internal/adapter"
)

// Mutate executes insert, update, or delete operations on the specified collection.
func (a *Adapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	coll := a.db.Collection(table)

	switch op.Type {
	case "insert":
		return a.mutateInsert(ctx, coll, op.Values)
	case "update":
		return a.mutateUpdate(ctx, coll, op.Where, op.Values)
	case "delete":
		return a.mutateDelete(ctx, coll, op.Where)
	default:
		return fmt.Errorf("mongodb: unsupported mutation type: %q", op.Type)
	}
}

func (a *Adapter) mutateInsert(ctx context.Context, coll *mongo.Collection, values map[string]any) error {
	if len(values) == 0 {
		return fmt.Errorf("mongodb: insert values cannot be empty")
	}

	doc := make(bson.M, len(values))
	for k, v := range values {
		if k == "_id" {
			if s, ok := v.(string); ok {
				if s == "" {
					// Omit empty _id so MongoDB generates a fresh ObjectID
					continue
				}
				if len(s) == 24 {
					if oid, err := primitive.ObjectIDFromHex(s); err == nil {
						doc[k] = oid
						continue
					}
				}
			}
		}
		doc[k] = normalizeMutationValue(k, v)
	}

	if _, err := coll.InsertOne(ctx, doc); err != nil {
		return fmt.Errorf("mongodb: insert error: %w", err)
	}
	return nil
}

func (a *Adapter) mutateUpdate(ctx context.Context, coll *mongo.Collection, where, values map[string]any) error {
	if len(where) == 0 {
		return fmt.Errorf("mongodb: update where condition cannot be empty")
	}
	if len(values) == 0 {
		return fmt.Errorf("mongodb: update values cannot be empty")
	}

	filter := buildWhereFilter(where)

	// In MongoDB, _id is immutable and will error if passed in $set.
	updateSet := make(bson.M, len(values))
	for k, v := range values {
		if k == "_id" {
			continue
		}
		updateSet[k] = normalizeMutationValue(k, v)
	}

	if len(updateSet) == 0 {
		return nil
	}

	if _, err := coll.UpdateMany(ctx, filter, bson.M{"$set": updateSet}); err != nil {
		return fmt.Errorf("mongodb: update error: %w", err)
	}
	return nil
}

func normalizeMutationValue(k string, v any) any {
	switch val := v.(type) {
	case string:
		// Check for ObjectId hex string on ID fields
		lowerK := strings.ToLower(k)
		if len(val) == 24 && (lowerK == "_id" || strings.HasSuffix(lowerK, "id") || strings.HasSuffix(lowerK, "_id")) {
			if oid, err := primitive.ObjectIDFromHex(val); err == nil {
				return oid
			}
		}
		// Check for ISO 8601 Date string
		if len(val) >= 19 && (strings.Contains(val, "T") || strings.Contains(val, "-")) {
			if t, err := time.Parse(time.RFC3339Nano, val); err == nil {
				return primitive.NewDateTimeFromTime(t)
			}
			if t, err := time.Parse(time.RFC3339, val); err == nil {
				return primitive.NewDateTimeFromTime(t)
			}
		}
		return val

	case map[string]any:
		// MongoDB Extended JSON support
		if oid, ok := val["$oid"].(string); ok && len(oid) == 24 {
			if parsedOid, err := primitive.ObjectIDFromHex(oid); err == nil {
				return parsedOid
			}
		}
		if dateVal, ok := val["$date"]; ok {
			if dateStr, ok := dateVal.(string); ok {
				if t, err := time.Parse(time.RFC3339Nano, dateStr); err == nil {
					return primitive.NewDateTimeFromTime(t)
				}
			}
		}
		if longStr, ok := val["$numberLong"].(string); ok {
			if i, err := strconv.ParseInt(longStr, 10, 64); err == nil {
				return i
			}
		}
		if decStr, ok := val["$numberDecimal"].(string); ok {
			if dec, err := primitive.ParseDecimal128(decStr); err == nil {
				return dec
			}
		}
		return val

	default:
		return val
	}
}

func (a *Adapter) mutateDelete(ctx context.Context, coll *mongo.Collection, where map[string]any) error {
	if len(where) == 0 {
		return fmt.Errorf("mongodb: delete where condition cannot be empty")
	}

	filter := buildWhereFilter(where)

	if _, err := coll.DeleteMany(ctx, filter); err != nil {
		return fmt.Errorf("mongodb: delete error: %w", err)
	}
	return nil
}

func buildWhereFilter(where map[string]any) bson.M {
	filter := make(bson.M, len(where))
	for k, v := range where {
		if k == "_id" {
			if s, ok := v.(string); ok && len(s) == 24 {
				if oid, err := primitive.ObjectIDFromHex(s); err == nil {
					filter[k] = oid
					continue
				}
			}
		}
		filter[k] = v
	}
	return filter
}
