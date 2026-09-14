package mongodb

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"pebblebase/internal/adapter"
)

const defaultChunkSize = 1000

// streamTableRows executes a query and streams rows in chunks of up to defaultChunkSize.
func streamTableRows(
	ctx context.Context,
	adapterInstance *Adapter,
	table string,
	opts adapter.QueryOptions,
	onChunk func(columns []string, rows []map[string]any) error,
) error {
	coll := adapterInstance.db.Collection(table)

	filter, err := buildFilter(opts.Filters)
	if err != nil {
		return fmt.Errorf("mongodb: build filter: %w", err)
	}

	findOpts := options.Find()
	if opts.Offset > 0 {
		findOpts.SetSkip(int64(opts.Offset))
	}
	if opts.Limit > 0 {
		findOpts.SetLimit(int64(opts.Limit))
	}

	if opts.SortBy != "" {
		dir := 1
		if opts.SortDesc {
			dir = -1
		}
		findOpts.SetSort(bson.D{{Key: opts.SortBy, Value: dir}})
	} else {
		findOpts.SetSort(bson.D{{Key: "_id", Value: 1}})
	}

	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		return fmt.Errorf("mongodb: stream find %q: %w", table, err)
	}
	defer cursor.Close(ctx)

	colSet := make(map[string]struct{})
	var colNames []string
	chunk := make([]map[string]any, 0, defaultChunkSize)

	hasStreamed := false

	for cursor.Next(ctx) {
		if err := ctx.Err(); err != nil {
			return err
		}

		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return fmt.Errorf("mongodb: stream decode: %w", err)
		}

		row := make(map[string]any, len(doc))
		for _, elem := range doc {
			if _, exists := colSet[elem.Key]; !exists {
				colSet[elem.Key] = struct{}{}
				colNames = append(colNames, elem.Key)
			}
			row[elem.Key] = cleanValue(elem.Value)
		}
		chunk = append(chunk, row)

		if len(chunk) >= defaultChunkSize {
			if err := onChunk(orderCols(colNames), chunk); err != nil {
				return err
			}
			hasStreamed = true
			chunk = make([]map[string]any, 0, defaultChunkSize)
		}
	}

	if err := cursor.Err(); err != nil {
		return fmt.Errorf("mongodb: stream iterate: %w", err)
	}

	// Flush remaining rows if any, or flush empty chunk if 0 rows returned
	if len(chunk) > 0 || !hasStreamed {
		if err := onChunk(orderCols(colNames), chunk); err != nil {
			return err
		}
	}

	return nil
}

func orderCols(cols []string) []string {
	for i, c := range cols {
		if c == "_id" && i > 0 {
			res := append([]string{"_id"}, cols[:i]...)
			return append(res, cols[i+1:]...)
		}
	}
	return cols
}

// bulkInsert inserts rows in batches of up to 500 documents.
func bulkInsert(
	ctx context.Context,
	adapterInstance *Adapter,
	table string,
	columns []string,
	records [][]any,
) (int64, error) {
	if len(records) == 0 || len(columns) == 0 {
		return 0, nil
	}

	coll := adapterInstance.db.Collection(table)
	maxBatch := 500
	var totalInserted int64

	for i := 0; i < len(records); i += maxBatch {
		end := i + maxBatch
		if end > len(records) {
			end = len(records)
		}
		batch := records[i:end]

		docs := make([]interface{}, len(batch))
		for rIdx, row := range batch {
			doc := bson.M{}
			for cIdx, col := range columns {
				if cIdx < len(row) {
					val := row[cIdx]
					if col == "_id" {
						if str, ok := val.(string); ok && len(str) == 24 {
							if oid, err := primitive.ObjectIDFromHex(str); err == nil {
								val = oid
							}
						}
					}
					doc[col] = val
				}
			}
			docs[rIdx] = doc
		}

		res, err := coll.InsertMany(ctx, docs)
		if err != nil {
			return totalInserted, fmt.Errorf("mongodb: bulk insert batch rows [%d-%d]: %w", i+1, end, err)
		}

		totalInserted += int64(len(res.InsertedIDs))
	}

	return totalInserted, nil
}
