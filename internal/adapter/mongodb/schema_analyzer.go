package mongodb

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"pebblebase/internal/adapter"
)

type fieldAccumulator struct {
	name            string
	firstSeenOrder  int
	docCount        int
	typeCounts      map[string]int
	numericSum      float64
	numericCount    int
	minNum          *float64
	maxNum          *float64
	minDate         *time.Time
	maxDate         *time.Time
	stringLens      []int
	distinctSeen    map[string]bool
	distinctSamples []any
}

// AnalyzeSchema samples documents from the collection using $sample: sampleSize
// and computes detailed field presence, type distribution, and summary statistics.
func (a *Adapter) AnalyzeSchema(ctx context.Context, table string, sampleSize int) (*adapter.MongoSchemaAnalysisResult, error) {
	start := time.Now()

	if sampleSize <= 0 {
		sampleSize = 1000
	}
	if sampleSize > 10000 {
		sampleSize = 10000
	}

	coll := a.db.Collection(table)

	// Attempt aggregation with $sample stage
	pipeline := mongo.Pipeline{
		{{Key: "$sample", Value: bson.D{{Key: "size", Value: int64(sampleSize)}}}},
	}

	var docs []bson.D
	cursor, err := coll.Aggregate(ctx, pipeline)
	if err == nil {
		defer cursor.Close(ctx)
		_ = cursor.All(ctx, &docs)
	}

	// Fallback to standard find with limit if $sample is not supported or failed
	if len(docs) == 0 {
		findOpts := options.Find().SetLimit(int64(sampleSize))
		findCursor, findErr := coll.Find(ctx, bson.D{}, findOpts)
		if findErr == nil {
			defer findCursor.Close(ctx)
			_ = findCursor.All(ctx, &docs)
		}
	}

	totalSampled := len(docs)
	if totalSampled == 0 {
		return &adapter.MongoSchemaAnalysisResult{
			Collection:      table,
			TotalSampled:    0,
			TotalFields:     0,
			ExecutionTimeMs: adapter.ElapsedMs(start),
			Fields:          []adapter.MongoFieldAnalysis{},
		}, nil
	}

	accumulators := make(map[string]*fieldAccumulator)
	orderCounter := 0

	for _, doc := range docs {
		seenInThisDoc := make(map[string]bool)
		for _, elem := range doc {
			traverseBsonElement("", elem.Key, elem.Value, 1, accumulators, seenInThisDoc, &orderCounter)
		}
	}

	resultFields := make([]adapter.MongoFieldAnalysis, 0, len(accumulators))
	for _, acc := range accumulators {
		freq := math.Round((float64(acc.docCount)/float64(totalSampled))*10000) / 100
		missingCount := totalSampled - acc.docCount
		missingRate := math.Round((float64(missingCount)/float64(totalSampled))*10000) / 100

		// Calculate type distribution breakdown
		totalInstances := 0
		for _, c := range acc.typeCounts {
			totalInstances += c
		}

		typeDist := make([]adapter.MongoTypeDistribution, 0, len(acc.typeCounts))
		for tName, count := range acc.typeCounts {
			pct := 0.0
			if totalInstances > 0 {
				pct = math.Round((float64(count)/float64(totalInstances))*10000) / 100
			}
			typeDist = append(typeDist, adapter.MongoTypeDistribution{
				Type:       tName,
				Count:      count,
				Percentage: pct,
			})
		}
		sort.Slice(typeDist, func(i, j int) bool {
			if typeDist[i].Count == typeDist[j].Count {
				return typeDist[i].Type < typeDist[j].Type
			}
			return typeDist[i].Count > typeDist[j].Count
		})

		stats := adapter.MongoFieldStats{
			DistinctSamples: acc.distinctSamples,
		}

		if acc.numericCount > 0 {
			stats.Min = *acc.minNum
			stats.Max = *acc.maxNum
			avg := math.Round((acc.numericSum/float64(acc.numericCount))*100) / 100
			stats.Avg = &avg
		} else if acc.minDate != nil && acc.maxDate != nil {
			stats.Min = acc.minDate.Format(time.RFC3339)
			stats.Max = acc.maxDate.Format(time.RFC3339)
		}

		if len(acc.stringLens) > 0 {
			minL := acc.stringLens[0]
			maxL := acc.stringLens[0]
			sumL := 0
			for _, l := range acc.stringLens {
				if l < minL {
					minL = l
				}
				if l > maxL {
					maxL = l
				}
				sumL += l
			}
			avgL := math.Round((float64(sumL)/float64(len(acc.stringLens)))*100) / 100
			stats.MinLength = &minL
			stats.MaxLength = &maxL
			stats.AvgLength = &avgL
		}

		resultFields = append(resultFields, adapter.MongoFieldAnalysis{
			Name:          acc.name,
			Count:         acc.docCount,
			Frequency:     freq,
			MissingCount:  missingCount,
			MissingRate:   missingRate,
			Types:         typeDist,
			IsPolymorphic: len(typeDist) > 1,
			Stats:         stats,
		})
	}

	// Sort fields: "_id" always first, then by frequency descending, then by natural appearance order
	sort.Slice(resultFields, func(i, j int) bool {
		if resultFields[i].Name == "_id" {
			return true
		}
		if resultFields[j].Name == "_id" {
			return false
		}
		if resultFields[i].Frequency != resultFields[j].Frequency {
			return resultFields[i].Frequency > resultFields[j].Frequency
		}
		return accumulators[resultFields[i].Name].firstSeenOrder < accumulators[resultFields[j].Name].firstSeenOrder
	})

	return &adapter.MongoSchemaAnalysisResult{
		Collection:      table,
		TotalSampled:    totalSampled,
		TotalFields:     len(resultFields),
		ExecutionTimeMs: adapter.ElapsedMs(start),
		Fields:          resultFields,
	}, nil
}

func traverseBsonElement(
	prefix string,
	key string,
	val any,
	depth int,
	accumulators map[string]*fieldAccumulator,
	seenInThisDoc map[string]bool,
	orderCounter *int,
) {
	fullPath := key
	if prefix != "" {
		fullPath = prefix + "." + key
	}

	acc, exists := accumulators[fullPath]
	if !exists {
		acc = &fieldAccumulator{
			name:            fullPath,
			firstSeenOrder:  *orderCounter,
			typeCounts:      make(map[string]int),
			distinctSeen:    make(map[string]bool),
			distinctSamples: make([]any, 0, 5),
		}
		*orderCounter++
		accumulators[fullPath] = acc
	}

	if !seenInThisDoc[fullPath] {
		acc.docCount++
		seenInThisDoc[fullPath] = true
	}

	typeName := identifyBsonTypeName(val)
	acc.typeCounts[typeName]++

	// Record distinct sample preview
	recordDistinctSample(acc, val)

	// Collect numeric stats
	if num, ok := toFloat64(val); ok {
		acc.numericSum += num
		acc.numericCount++
		if acc.minNum == nil || num < *acc.minNum {
			acc.minNum = &num
		}
		if acc.maxNum == nil || num > *acc.maxNum {
			acc.maxNum = &num
		}
	}

	// Collect date stats
	if t, ok := toTime(val); ok {
		if acc.minDate == nil || t.Before(*acc.minDate) {
			acc.minDate = &t
		}
		if acc.maxDate == nil || t.After(*acc.maxDate) {
			acc.maxDate = &t
		}
	}

	// Collect string length stats
	if str, ok := val.(string); ok {
		acc.stringLens = append(acc.stringLens, len(str))
	}

	// Recurse into nested documents up to max depth 4
	if depth < 4 {
		switch nested := val.(type) {
		case primitive.D:
			for _, elem := range nested {
				traverseBsonElement(fullPath, elem.Key, elem.Value, depth+1, accumulators, seenInThisDoc, orderCounter)
			}
		case primitive.M:
			for k, v := range nested {
				traverseBsonElement(fullPath, k, v, depth+1, accumulators, seenInThisDoc, orderCounter)
			}
		case map[string]any:
			for k, v := range nested {
				traverseBsonElement(fullPath, k, v, depth+1, accumulators, seenInThisDoc, orderCounter)
			}
		case primitive.A:
			for _, item := range nested {
				if isContainerType(item) {
					traverseContainerArray(fullPath+"[]", item, depth+1, accumulators, seenInThisDoc, orderCounter)
				} else {
					recordArrayItemPrimitive(fullPath+"[]", item, accumulators, seenInThisDoc, orderCounter)
				}
			}
		case []any:
			for _, item := range nested {
				if isContainerType(item) {
					traverseContainerArray(fullPath+"[]", item, depth+1, accumulators, seenInThisDoc, orderCounter)
				} else {
					recordArrayItemPrimitive(fullPath+"[]", item, accumulators, seenInThisDoc, orderCounter)
				}
			}
		}
	}
}

func traverseContainerArray(
	arrayPath string,
	item any,
	depth int,
	accumulators map[string]*fieldAccumulator,
	seenInThisDoc map[string]bool,
	orderCounter *int,
) {
	switch sub := item.(type) {
	case primitive.D:
		for _, elem := range sub {
			traverseBsonElement(arrayPath, elem.Key, elem.Value, depth, accumulators, seenInThisDoc, orderCounter)
		}
	case primitive.M:
		for k, v := range sub {
			traverseBsonElement(arrayPath, k, v, depth, accumulators, seenInThisDoc, orderCounter)
		}
	case map[string]any:
		for k, v := range sub {
			traverseBsonElement(arrayPath, k, v, depth, accumulators, seenInThisDoc, orderCounter)
		}
	}
}

func recordArrayItemPrimitive(
	path string,
	val any,
	accumulators map[string]*fieldAccumulator,
	seenInThisDoc map[string]bool,
	orderCounter *int,
) {
	acc, exists := accumulators[path]
	if !exists {
		acc = &fieldAccumulator{
			name:            path,
			firstSeenOrder:  *orderCounter,
			typeCounts:      make(map[string]int),
			distinctSeen:    make(map[string]bool),
			distinctSamples: make([]any, 0, 5),
		}
		*orderCounter++
		accumulators[path] = acc
	}
	if !seenInThisDoc[path] {
		acc.docCount++
		seenInThisDoc[path] = true
	}
	typeName := identifyBsonTypeName(val)
	acc.typeCounts[typeName]++
	recordDistinctSample(acc, val)
}

func isContainerType(val any) bool {
	switch val.(type) {
	case primitive.D, primitive.M, map[string]any:
		return true
	default:
		return false
	}
}

func identifyBsonTypeName(val any) string {
	if val == nil {
		return "Null"
	}
	switch val.(type) {
	case primitive.ObjectID:
		return "ObjectId"
	case string:
		return "String"
	case bool:
		return "Boolean"
	case int32:
		return "Int32"
	case int64:
		return "Int64"
	case int:
		return "Int32"
	case float64, float32:
		return "Double"
	case primitive.Decimal128:
		return "Decimal128"
	case primitive.DateTime, time.Time:
		return "Date"
	case primitive.Timestamp:
		return "Timestamp"
	case primitive.Binary:
		return "Binary"
	case primitive.Regex:
		return "Regex"
	case primitive.Null:
		return "Null"
	case primitive.Undefined:
		return "Undefined"
	case primitive.D, primitive.M, map[string]any:
		return "Object"
	case primitive.A, []any:
		return "Array"
	default:
		return "Unknown"
	}
}

func recordDistinctSample(acc *fieldAccumulator, val any) {
	if len(acc.distinctSamples) >= 5 || val == nil {
		return
	}
	repr := fmt.Sprintf("%v", val)
	if !acc.distinctSeen[repr] {
		acc.distinctSeen[repr] = true
		acc.distinctSamples = append(acc.distinctSamples, val)
	}
}

func toFloat64(val any) (float64, bool) {
	switch v := val.(type) {
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case float32:
		return float64(v), true
	case float64:
		return v, true
	case primitive.Decimal128:
		f, err := strconv.ParseFloat(v.String(), 64)
		if err == nil {
			return f, true
		}
		return 0, false
	default:
		return 0, false
	}
}

func toTime(val any) (time.Time, bool) {
	switch v := val.(type) {
	case time.Time:
		return v, true
	case primitive.DateTime:
		return v.Time(), true
	default:
		return time.Time{}, false
	}
}
