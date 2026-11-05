package mongodb

import (
	"math"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestIdentifyBsonTypeName(t *testing.T) {
	oid := primitive.NewObjectID()
	tests := []struct {
		val      any
		expected string
	}{
		{oid, "ObjectId"},
		{"hello", "String"},
		{true, "Boolean"},
		{int32(10), "Int32"},
		{int64(20), "Int64"},
		{3.1415, "Double"},
		{primitive.NewDateTimeFromTime(time.Now()), "Date"},
		{primitive.Null{}, "Null"},
		{nil, "Null"},
		{bson.D{{Key: "a", Value: 1}}, "Object"},
		{primitive.A{"x", "y"}, "Array"},
	}

	for _, tc := range tests {
		got := identifyBsonTypeName(tc.val)
		if got != tc.expected {
			t.Errorf("identifyBsonTypeName(%v) = %q, expected %q", tc.val, got, tc.expected)
		}
	}
}

func TestSchemaAnalysis_AccumulatorsAndPolymorphic(t *testing.T) {
	// Simulate 4 documents sampled
	oid1 := primitive.NewObjectID()
	oid2 := primitive.NewObjectID()
	oid3 := primitive.NewObjectID()
	oid4 := primitive.NewObjectID()

	docs := []bson.D{
		// Doc 1: full profile with address, age is Int32
		{
			{Key: "_id", Value: oid1},
			{Key: "name", Value: "Alice"},
			{Key: "age", Value: int32(25)},
			{Key: "profile", Value: bson.D{
				{Key: "city", Value: "New York"},
				{Key: "zip", Value: "10001"},
			}},
			{Key: "tags", Value: primitive.A{"admin", "editor"}},
		},
		// Doc 2: age is String ("unknown"), no profile (missing)
		{
			{Key: "_id", Value: oid2},
			{Key: "name", Value: "Bob"},
			{Key: "age", Value: "unknown"},
			{Key: "tags", Value: primitive.A{"viewer"}},
		},
		// Doc 3: age is Int32(40), profile without zip
		{
			{Key: "_id", Value: oid3},
			{Key: "name", Value: "Charlie"},
			{Key: "age", Value: int32(40)},
			{Key: "profile", Value: bson.D{
				{Key: "city", Value: "Boston"},
			}},
		},
		// Doc 4: no age, has profile with city and zip
		{
			{Key: "_id", Value: oid4},
			{Key: "name", Value: "Diana"},
			{Key: "profile", Value: bson.D{
				{Key: "city", Value: "Chicago"},
				{Key: "zip", Value: "60601"},
			}},
		},
	}

	accumulators := make(map[string]*fieldAccumulator)
	orderCounter := 0
	totalSampled := len(docs) // 4

	for _, doc := range docs {
		seenInThisDoc := make(map[string]bool)
		for _, elem := range doc {
			traverseBsonElement("", elem.Key, elem.Value, 1, accumulators, seenInThisDoc, &orderCounter)
		}
	}

	// Verify _id: 4 docs (100%), type: ObjectId
	idAcc := accumulators["_id"]
	if idAcc == nil || idAcc.docCount != 4 {
		t.Fatalf("expected _id docCount=4, got %v", idAcc)
	}
	if idAcc.typeCounts["ObjectId"] != 4 {
		t.Errorf("expected _id to have 4 ObjectId types, got %v", idAcc.typeCounts)
	}

	// Verify name: 4 docs (100%), type: String
	nameAcc := accumulators["name"]
	if nameAcc == nil || nameAcc.docCount != 4 {
		t.Fatalf("expected name docCount=4, got %v", nameAcc)
	}
	if nameAcc.typeCounts["String"] != 4 {
		t.Errorf("expected name to have 4 String types, got %v", nameAcc.typeCounts)
	}

	// Verify age: 3 docs (75%), types: Int32 (2) and String (1) -> Polymorphic!
	ageAcc := accumulators["age"]
	if ageAcc == nil || ageAcc.docCount != 3 {
		t.Fatalf("expected age docCount=3, got %v", ageAcc)
	}
	if len(ageAcc.typeCounts) != 2 {
		t.Errorf("expected age to have 2 distinct types, got %d", len(ageAcc.typeCounts))
	}
	if ageAcc.typeCounts["Int32"] != 2 || ageAcc.typeCounts["String"] != 1 {
		t.Errorf("expected age types Int32:2, String:1, got %v", ageAcc.typeCounts)
	}
	// Verify numeric stats on age: min=25, max=40, avg=32.5
	if ageAcc.numericCount != 2 || *ageAcc.minNum != 25 || *ageAcc.maxNum != 40 {
		t.Errorf("expected age numeric min=25, max=40, got min=%v, max=%v", ageAcc.minNum, ageAcc.maxNum)
	}
	avgAge := math.Round((ageAcc.numericSum/float64(ageAcc.numericCount))*100) / 100
	if avgAge != 32.5 {
		t.Errorf("expected avg age=32.5, got %v", avgAge)
	}

	// Verify nested profile.city: 3 docs (75%), missing count = 1 (25% missing)
	cityAcc := accumulators["profile.city"]
	if cityAcc == nil || cityAcc.docCount != 3 {
		t.Fatalf("expected profile.city docCount=3, got %v", cityAcc)
	}
	missingCity := totalSampled - cityAcc.docCount
	if missingCity != 1 {
		t.Errorf("expected profile.city missing=1, got %d", missingCity)
	}

	// Verify array tags[]: 2 docs (50%), element type String
	tagsItemAcc := accumulators["tags[]"]
	if tagsItemAcc == nil || tagsItemAcc.docCount != 2 {
		t.Fatalf("expected tags[] docCount=2, got %v", tagsItemAcc)
	}
	if tagsItemAcc.typeCounts["String"] != 3 { // 2 items in doc1, 1 item in doc2
		t.Errorf("expected tags[] to contain 3 String occurrences, got %v", tagsItemAcc.typeCounts)
	}
}
