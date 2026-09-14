package mongodb

import (
	"context"
	"encoding/json"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"pebblebase/internal/adapter"
)

var _ adapter.DDLProvider = (*Adapter)(nil)

// GetTableDDL queries collection options, validator rules, and indexes, returning a formatted JSON schema definition.
func (a *Adapter) GetTableDDL(ctx context.Context, table string) (string, error) {
	// 1. List collection details for options & validators
	cursor, err := a.db.ListCollections(ctx, bson.M{"name": table})
	if err != nil {
		return "", fmt.Errorf("mongodb: list collection %q: %w", table, err)
	}
	defer cursor.Close(ctx)

	var collDoc bson.M
	if cursor.Next(ctx) {
		if err := cursor.Decode(&collDoc); err != nil {
			return "", fmt.Errorf("mongodb: decode collection %q: %w", table, err)
		}
	} else {
		return "", fmt.Errorf("mongodb: collection %q not found", table)
	}

	// 2. Fetch Indexes
	indexes, err := a.GetTableIndexes(ctx, table)
	if err != nil {
		return "", err
	}

	// 3. Assemble JSON definition
	spec := map[string]any{
		"collection": table,
		"database":   a.dbName,
		"options":    collDoc["options"],
		"indexes":    indexes,
	}

	bytes, err := json.MarshalIndent(spec, "", "  ")
	if err != nil {
		return "", fmt.Errorf("mongodb: marshal ddl: %w", err)
	}

	return string(bytes), nil
}

// GetTableIndexes returns all indexes defined on the given MongoDB collection.
func (a *Adapter) GetTableIndexes(ctx context.Context, table string) ([]adapter.IndexInfo, error) {
	coll := a.db.Collection(table)
	cursor, err := coll.Indexes().List(ctx)
	if err != nil {
		return nil, fmt.Errorf("mongodb: list indexes for %q: %w", table, err)
	}
	defer cursor.Close(ctx)

	var indexes []adapter.IndexInfo
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			continue
		}

		var (
			name      string
			isUnique  bool
			isPrimary bool
			cols      []string
		)

		for _, elem := range doc {
			switch elem.Key {
			case "name":
				if s, ok := elem.Value.(string); ok {
					name = s
					if s == "_id_" {
						isPrimary = true
					}
				}
			case "unique":
				if u, ok := elem.Value.(bool); ok {
					isUnique = u
				}
			case "key":
				if keyDoc, ok := elem.Value.(bson.D); ok {
					for _, k := range keyDoc {
						cols = append(cols, k.Key)
					}
				} else if keyMap, ok := elem.Value.(bson.M); ok {
					for k := range keyMap {
						cols = append(cols, k)
					}
				}
			}
		}

		indexes = append(indexes, adapter.IndexInfo{
			Name:    name,
			Columns: cols,
			Unique:  isUnique || isPrimary,
			Primary: isPrimary,
		})
	}

	return indexes, cursor.Err()
}
