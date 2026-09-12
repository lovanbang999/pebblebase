package mongodb

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"pebblebase/internal/schema"
)

const sampleDocumentCount = 100

// Introspect inspects all non-system collections in the connected MongoDB database,
// samples up to N documents per collection, and merges field and type definitions
// into a unified schema.Table representation.
func (a *Adapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	colls, err := a.db.ListCollectionNames(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("mongodb: list collections: %w", err)
	}

	// Filter out system collections and hidden namespaces.
	userColls := make([]string, 0, len(colls))
	for _, c := range colls {
		if !strings.HasPrefix(c, "system.") && !strings.HasPrefix(c, ".") {
			userColls = append(userColls, c)
		}
	}
	sort.Strings(userColls)

	tables := make([]schema.Table, 0, len(userColls))
	collSet := make(map[string]struct{}, len(userColls))
	for _, c := range userColls {
		collSet[c] = struct{}{}
	}

	for _, collName := range userColls {
		tbl, err := a.introspectCollection(ctx, collName, collSet)
		if err != nil {
			return nil, fmt.Errorf("mongodb: introspect collection %q: %w", collName, err)
		}
		tables = append(tables, tbl)
	}

	return tables, nil
}

type fieldInfo struct {
	seenCount int
	hasNull   bool
	typeFreq  map[string]int
}

func (a *Adapter) introspectCollection(ctx context.Context, name string, allCollections map[string]struct{}) (schema.Table, error) {
	coll := a.db.Collection(name)

	// Sample up to 100 documents using $sample pipeline.
	pipeline := mongo.Pipeline{
		{{Key: "$sample", Value: bson.D{{Key: "size", Value: sampleDocumentCount}}}},
	}

	cursor, err := coll.Aggregate(ctx, pipeline)
	if err != nil {
		return schema.Table{}, fmt.Errorf("sample aggregate: %w", err)
	}
	defer cursor.Close(ctx)

	fieldOrder := make([]string, 0)
	fieldMap := make(map[string]*fieldInfo)
	totalDocs := 0

	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		totalDocs++

		for _, elem := range doc {
			k := elem.Key
			meta, exists := fieldMap[k]
			if !exists {
				meta = &fieldInfo{typeFreq: make(map[string]int)}
				fieldMap[k] = meta
				fieldOrder = append(fieldOrder, k)
			}
			meta.seenCount++

			inferred := inferType(elem.Value)
			if inferred == "null" {
				meta.hasNull = true
			} else {
				meta.typeFreq[inferred]++
			}
		}
	}

	if err := cursor.Err(); err != nil {
		return schema.Table{}, fmt.Errorf("cursor iterate: %w", err)
	}

	// If collection is empty, provide default _id primary key
	if totalDocs == 0 {
		return schema.Table{
			Name: name,
			Columns: []schema.Column{
				{
					Name:         "_id",
					Type:         "string",
					Nullable:     false,
					IsPrimaryKey: true,
				},
			},
		}, nil
	}

	// Ensure _id is always first
	orderedCols := make([]string, 0, len(fieldOrder))
	orderedCols = append(orderedCols, "_id")
	for _, k := range fieldOrder {
		if k != "_id" {
			orderedCols = append(orderedCols, k)
		}
	}

	columns := make([]schema.Column, 0, len(orderedCols))
	relations := make([]schema.Relation, 0)

	for _, colName := range orderedCols {
		meta, found := fieldMap[colName]
		if !found {
			// e.g. collection had documents without _id (unlikely, but safe fallback)
			columns = append(columns, schema.Column{
				Name:         colName,
				Type:         "string",
				Nullable:     false,
				IsPrimaryKey: colName == "_id",
			})
			continue
		}

		isPK := colName == "_id"
		// If not all documents contain this field, it's nullable in the collection
		nullable := meta.hasNull || (meta.seenCount < totalDocs)
		if isPK {
			nullable = false
		}

		colType := resolveType(meta.typeFreq)

		// Check for potential foreign key convention: e.g. "user_id" -> "users" or "user"
		isFK := false
		if !isPK && strings.HasSuffix(colName, "_id") {
			targetCandidate := strings.TrimSuffix(colName, "_id")
			pluralTarget := targetCandidate + "s"
			var targetTable string
			if _, ok := allCollections[pluralTarget]; ok {
				targetTable = pluralTarget
			} else if _, ok := allCollections[targetCandidate]; ok {
				targetTable = targetCandidate
			}
			if targetTable != "" {
				isFK = true
				relations = append(relations, schema.Relation{
					Name:       fmt.Sprintf("%s_%s_%s", name, colName, targetTable),
					Type:       schema.OneToMany,
					FromTable:  name,
					FromColumn: colName,
					ToTable:    targetTable,
					ToColumn:   "_id",
				})
			}
		}

		columns = append(columns, schema.Column{
			Name:         colName,
			Type:         colType,
			Nullable:     nullable,
			IsPrimaryKey: isPK,
			IsForeignKey: isFK,
		})
	}

	return schema.Table{
		Name:      name,
		Columns:   columns,
		Relations: relations,
	}, nil
}

// inferType normalizes a BSON value into the standard Pebblebase types:
// "string", "int", "float", "bool", "datetime", "json", "binary", "uuid", "unknown".
func inferType(v any) string {
	if v == nil {
		return "null"
	}

	switch v.(type) {
	case primitive.ObjectID:
		return "string"
	case string:
		return "string"
	case int, int8, int16, int32, int64:
		return "int"
	case uint, uint8, uint16, uint32, uint64:
		return "int"
	case float32, float64, primitive.Decimal128:
		return "float"
	case bool:
		return "bool"
	case time.Time, primitive.DateTime, primitive.Timestamp:
		return "datetime"
	case primitive.Binary:
		return "binary"
	case primitive.M, primitive.D, primitive.A, map[string]any, []any:
		return "json"
	case primitive.Null, primitive.Undefined:
		return "null"
	default:
		return "unknown"
	}
}

// resolveType determines the single unified type from the frequency of types observed.
func resolveType(typeFreq map[string]int) string {
	if len(typeFreq) == 0 {
		return "unknown"
	}
	if len(typeFreq) == 1 {
		for t := range typeFreq {
			return t
		}
	}

	// If numeric mix of int and float -> float
	hasInt := typeFreq["int"] > 0
	hasFloat := typeFreq["float"] > 0
	if len(typeFreq) == 2 && hasInt && hasFloat {
		return "float"
	}

	// If heterogeneous types exist across documents, classify as "json" or "unknown"
	// "json" allows flexible rich display/editing in Pebblebase UI.
	return "json"
}
