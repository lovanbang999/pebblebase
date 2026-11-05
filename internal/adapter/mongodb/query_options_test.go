package mongodb

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"pebblebase/internal/adapter"
)

func TestBuildFilter_Operators(t *testing.T) {
	oidHex := "507f1f77bcf86cd799439011"
	expectedOid, _ := primitive.ObjectIDFromHex(oidHex)

	tests := []struct {
		name     string
		filters  []adapter.Filter
		validate func(t *testing.T, m bson.M)
	}{
		{
			name: "eq with ObjectId normalization",
			filters: []adapter.Filter{
				{Column: "_id", Operator: "eq", Value: oidHex},
			},
			validate: func(t *testing.T, m bson.M) {
				if m["_id"] != expectedOid {
					t.Fatalf("expected _id %v, got %v", expectedOid, m["_id"])
				}
			},
		},
		{
			name: "neq and gt operator",
			filters: []adapter.Filter{
				{Column: "status", Operator: "neq", Value: "inactive"},
				{Column: "age", Operator: "gt", Value: "21"},
			},
			validate: func(t *testing.T, m bson.M) {
				neDoc, ok := m["status"].(bson.M)
				if !ok || neDoc["$ne"] != "inactive" {
					t.Fatalf("expected $ne: inactive, got %v", m["status"])
				}
				gtDoc, ok := m["age"].(bson.M)
				if !ok || gtDoc["$gt"] != int64(21) {
					t.Fatalf("expected $gt: 21 (int64), got %v", m["age"])
				}
			},
		},
		{
			name: "contains operator regex",
			filters: []adapter.Filter{
				{Column: "name", Operator: "contains", Value: "alice"},
			},
			validate: func(t *testing.T, m bson.M) {
				regDoc, ok := m["name"].(bson.M)
				if !ok || regDoc["$regex"] != "alice" || regDoc["$options"] != "i" {
					t.Fatalf("expected regex: alice with options i, got %v", m["name"])
				}
			},
		},
		{
			name: "in operator with comma string",
			filters: []adapter.Filter{
				{Column: "role", Operator: "in", Value: "admin, moderator"},
			},
			validate: func(t *testing.T, m bson.M) {
				inDoc, ok := m["role"].(bson.M)
				if !ok {
					t.Fatalf("expected bson.M for in, got %v", m["role"])
				}
				inSlice, ok := inDoc["$in"].([]any)
				if !ok || len(inSlice) != 2 || inSlice[0] != "admin" || inSlice[1] != "moderator" {
					t.Fatalf("expected slice [admin, moderator], got %v", inDoc["$in"])
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, err := buildFilter(tt.filters)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			tt.validate(t, m)
		})
	}
}

func TestCleanValue_BsonTypes(t *testing.T) {
	oid, _ := primitive.ObjectIDFromHex("507f1f77bcf86cd799439011")
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	dec, _ := primitive.ParseDecimal128("123.45")

	inputDoc := primitive.D{
		{Key: "_id", Value: oid},
		{Key: "createdAt", Value: primitive.NewDateTimeFromTime(now)},
		{Key: "price", Value: dec},
		{Key: "binary", Value: primitive.Binary{Data: []byte("sample")}},
		{Key: "tags", Value: primitive.A{"go", "mongodb"}},
		{Key: "nested", Value: primitive.D{
			{Key: "city", Value: "San Francisco"},
		}},
	}

	cleaned, ok := cleanValue(inputDoc).(map[string]any)
	if !ok {
		t.Fatalf("expected cleanValue to return map[string]any, got %T", cleanValue(inputDoc))
	}

	if cleaned["_id"] != oid.Hex() {
		t.Errorf("expected _id %q, got %q", oid.Hex(), cleaned["_id"])
	}
	if cleaned["createdAt"] != now.Format(time.RFC3339) {
		t.Errorf("expected createdAt %q, got %q", now.Format(time.RFC3339), cleaned["createdAt"])
	}
	if cleaned["price"] != "123.45" {
		t.Errorf("expected price '123.45', got %v", cleaned["price"])
	}
	if string(cleaned["binary"].([]byte)) != "sample" {
		t.Errorf("expected binary data 'sample', got %v", cleaned["binary"])
	}

	tags, ok := cleaned["tags"].([]any)
	if !ok || len(tags) != 2 || tags[0] != "go" || tags[1] != "mongodb" {
		t.Errorf("unexpected tags: %v", cleaned["tags"])
	}

	nested, ok := cleaned["nested"].(map[string]any)
	if !ok || nested["city"] != "San Francisco" {
		t.Errorf("unexpected nested doc: %v", cleaned["nested"])
	}
}

func TestQueryOptions_RelaxedJSONUnmarshaling(t *testing.T) {
	// Test relaxed JSON format handling for RawFilter with unquoted keys
	rawFilter := `status: "active", count: { $gt: 10 }`
	var filter bson.M
	if err := parseBsonDocument(rawFilter, &filter); err != nil {
		t.Fatalf("failed to unmarshal relaxed JSON filter: %v", err)
	}
	if filter["status"] != "active" {
		t.Errorf("expected status 'active', got %v", filter["status"])
	}

	// Test projection relaxed unmarshaling
	rawProj := `{ name: 1, email: 1, _id: 0 }`
	var proj bson.M
	if err := parseBsonDocument(rawProj, &proj); err != nil {
		t.Fatalf("failed to unmarshal projection: %v", err)
	}
	if len(proj) != 3 {
		t.Errorf("expected 3 projected fields, got %d", len(proj))
	}
}
