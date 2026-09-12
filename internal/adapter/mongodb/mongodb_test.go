package mongodb_test

import (
	"context"
	"os"
	"testing"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/adapter/mongodb"
)

func getTestMongoURI() string {
	if uri := os.Getenv("TEST_MONGODB_URI"); uri != "" {
		return uri
	}
	return "mongodb://pebble:pebble@localhost:27017/pebble_test?authSource=admin"
}

func setupMongoAdapter(t *testing.T) (*mongodb.Adapter, context.Context) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)

	uri := getTestMongoURI()
	a, err := mongodb.New(ctx, uri)
	if err != nil {
		t.Skipf("MongoDB not reachable at %s: %v (skipping integration tests)", uri, err)
		return nil, nil
	}
	t.Cleanup(func() { _ = a.Close() })
	return a, ctx
}

func TestMongoDB_Ping(t *testing.T) {
	a, ctx := setupMongoAdapter(t)
	if err := a.Ping(ctx); err != nil {
		t.Fatalf("Ping() failed: %v", err)
	}
}

func TestMongoDB_Introspect(t *testing.T) {
	a, ctx := setupMongoAdapter(t)

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect() error: %v", err)
	}

	tableMap := make(map[string]map[string]bool)
	typeMap := make(map[string]map[string]string)
	nullableMap := make(map[string]map[string]bool)

	for _, tbl := range tables {
		tableMap[tbl.Name] = make(map[string]bool)
		typeMap[tbl.Name] = make(map[string]string)
		nullableMap[tbl.Name] = make(map[string]bool)
		for _, col := range tbl.Columns {
			tableMap[tbl.Name][col.Name] = col.IsPrimaryKey
			typeMap[tbl.Name][col.Name] = col.Type
			nullableMap[tbl.Name][col.Name] = col.Nullable
		}
	}

	// 1. Verify required collections exist
	for _, expected := range []string{"users", "products", "orders"} {
		if _, ok := tableMap[expected]; !ok {
			t.Errorf("expected table %q not found in introspected tables", expected)
		}
	}

	// 2. Verify users collection schema
	userCols := tableMap["users"]
	if isPK, ok := userCols["_id"]; !ok || !isPK {
		t.Errorf("expected _id to be primary key in users, got ok=%v, isPK=%v", ok, isPK)
	}
	if typeMap["users"]["age"] != "int" {
		t.Errorf("expected users.age to be int, got %q", typeMap["users"]["age"])
	}
	if typeMap["users"]["is_active"] != "bool" {
		t.Errorf("expected users.is_active to be bool, got %q", typeMap["users"]["is_active"])
	}
	if typeMap["users"]["created_at"] != "datetime" {
		t.Errorf("expected users.created_at to be datetime, got %q", typeMap["users"]["created_at"])
	}
	if typeMap["users"]["profile"] != "json" {
		t.Errorf("expected users.profile to be json, got %q", typeMap["users"]["profile"])
	}

	// 3. Verify products collection with heterogeneous schema
	prodCols := tableMap["products"]
	if _, ok := prodCols["_id"]; !ok {
		t.Errorf("expected _id in products")
	}
	// "color" and "warranty_months" only exist on 1 document -> must be marked nullable!
	if !nullableMap["products"]["color"] {
		t.Errorf("expected products.color to be nullable due to document inconsistency")
	}
	if !nullableMap["products"]["warranty_months"] {
		t.Errorf("expected products.warranty_months to be nullable due to document inconsistency")
	}
	if !nullableMap["products"]["tags"] {
		t.Errorf("expected products.tags to be nullable due to document inconsistency")
	}
	// _id must NEVER be nullable
	if nullableMap["products"]["_id"] {
		t.Errorf("expected products._id to NOT be nullable")
	}
}

func TestMongoDB_Query(t *testing.T) {
	a, ctx := setupMongoAdapter(t)

	// 1. Pagination & TotalCount
	res, err := a.Query(ctx, "users", adapter.QueryOptions{Limit: 2, Offset: 0})
	if err != nil {
		t.Fatalf("Query() error: %v", err)
	}
	if res.TotalCount != 5 {
		t.Errorf("expected TotalCount=5, got %d", res.TotalCount)
	}
	if len(res.Rows) != 2 {
		t.Errorf("expected 2 rows returned with Limit=2, got %d", len(res.Rows))
	}
	// Verify _id is string hex
	firstID, ok := res.Rows[0]["_id"].(string)
	if !ok || len(firstID) != 24 {
		t.Errorf("expected _id to be a 24-character hex string, got %v (%T)", res.Rows[0]["_id"], res.Rows[0]["_id"])
	}

	// 2. Filter: eq
	resEq, err := a.Query(ctx, "users", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "email", Operator: "eq", Value: "alice@example.com"},
		},
	})
	if err != nil {
		t.Fatalf("Query eq error: %v", err)
	}
	if resEq.TotalCount != 1 || len(resEq.Rows) != 1 {
		t.Fatalf("expected 1 row for Alice, got count=%d rows=%d", resEq.TotalCount, len(resEq.Rows))
	}
	if resEq.Rows[0]["name"] != "Alice" {
		t.Errorf("expected name=Alice, got %v", resEq.Rows[0]["name"])
	}

	// 3. Filter: gt numeric
	resGt, err := a.Query(ctx, "users", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "age", Operator: "gt", Value: 30},
		},
	})
	if err != nil {
		t.Fatalf("Query gt error: %v", err)
	}
	if resGt.TotalCount != 2 {
		t.Errorf("expected 2 users with age > 30 (Bob 34, Dave 41), got %d", resGt.TotalCount)
	}

	// 4. Filter: contains
	resContains, err := a.Query(ctx, "products", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "name", Operator: "contains", Value: "Keyboard"},
		},
	})
	if err != nil {
		t.Fatalf("Query contains error: %v", err)
	}
	if resContains.TotalCount != 1 || len(resContains.Rows) != 1 {
		t.Fatalf("expected 1 product containing 'Keyboard', got %d", resContains.TotalCount)
	}

	// 5. Sorting
	resSort, err := a.Query(ctx, "products", adapter.QueryOptions{
		SortBy:   "price",
		SortDesc: true,
	})
	if err != nil {
		t.Fatalf("Query sort error: %v", err)
	}
	if len(resSort.Rows) == 0 || resSort.Rows[0]["name"] != "Laptop Pro" {
		t.Errorf("expected highest price product to be Laptop Pro, got %v", resSort.Rows[0]["name"])
	}
}

func TestMongoDB_Mutate(t *testing.T) {
	a, ctx := setupMongoAdapter(t)

	// 1. Insert
	insertOp := adapter.MutationOp{
		Type: "insert",
		Values: map[string]any{
			"name":        "Wireless Gaming Mouse",
			"price":       49.99,
			"in_stock":    true,
			"dpi":         16000,
			"extra_notes": "Test document for mutation lifecycle",
		},
	}
	if err := a.Mutate(ctx, "products", insertOp); err != nil {
		t.Fatalf("Mutate(insert) failed: %v", err)
	}

	// Verify insert
	res, err := a.Query(ctx, "products", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "name", Operator: "eq", Value: "Wireless Gaming Mouse"},
		},
	})
	if err != nil || len(res.Rows) != 1 {
		t.Fatalf("failed to find inserted document: err=%v rows=%d", err, len(res.Rows))
	}

	insertedDoc := res.Rows[0]
	docID, ok := insertedDoc["_id"].(string)
	if !ok || len(docID) != 24 {
		t.Fatalf("expected inserted document to have 24-char hex _id, got %v", insertedDoc["_id"])
	}

	// 2. Update by _id
	updateOp := adapter.MutationOp{
		Type:  "update",
		Where: map[string]any{"_id": docID},
		Values: map[string]any{
			"price": 39.99,
			"color": "matte black",
		},
	}
	if err := a.Mutate(ctx, "products", updateOp); err != nil {
		t.Fatalf("Mutate(update) failed: %v", err)
	}

	// Verify update
	resUpdated, err := a.Query(ctx, "products", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "_id", Operator: "eq", Value: docID},
		},
	})
	if err != nil || len(resUpdated.Rows) != 1 {
		t.Fatalf("failed to query updated document: err=%v", err)
	}
	if resUpdated.Rows[0]["color"] != "matte black" {
		t.Errorf("expected color 'matte black', got %v", resUpdated.Rows[0]["color"])
	}

	// 3. Delete by _id
	deleteOp := adapter.MutationOp{
		Type:  "delete",
		Where: map[string]any{"_id": docID},
	}
	if err := a.Mutate(ctx, "products", deleteOp); err != nil {
		t.Fatalf("Mutate(delete) failed: %v", err)
	}

	// Verify delete
	resDeleted, err := a.Query(ctx, "products", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "_id", Operator: "eq", Value: docID},
		},
	})
	if err != nil {
		t.Fatalf("Query after delete failed: %v", err)
	}
	if resDeleted.TotalCount != 0 || len(resDeleted.Rows) != 0 {
		t.Errorf("expected 0 rows after delete, got %d", resDeleted.TotalCount)
	}
}
