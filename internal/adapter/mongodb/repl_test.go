package mongodb

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestMongoShell_InfiniteLoopTimeout(t *testing.T) {
	a := &Adapter{}

	// Execute an infinite loop; should be interrupted by default timeout
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	start := time.Now()
	_, err := a.ExecuteShell(ctx, "while(true) {}")
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected error on infinite loop, got nil")
	}

	if !strings.Contains(err.Error(), "timed out") && !strings.Contains(err.Error(), "context deadline exceeded") {
		t.Fatalf("expected timeout error message, got: %v", err)
	}

	t.Logf("Infinite loop safely interrupted in %v with error: %v", elapsed, err)
}

func TestMongoShell_SyntaxError(t *testing.T) {
	a := &Adapter{}
	ctx := context.Background()

	_, err := a.ExecuteShell(ctx, "function invalid( {")
	if err == nil {
		t.Fatal("expected syntax error, got nil")
	}

	if !strings.Contains(err.Error(), "SyntaxError") && !strings.Contains(err.Error(), "mongo shell") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestMongoShell_BsonHelpersAndTransform(t *testing.T) {
	a := &Adapter{}
	ctx := context.Background()

	script := `
		const id = ObjectId("507f1f77bcf86cd799439011");
		const date = ISODate("2026-10-27T10:00:00Z");
		const num = NumberLong("9876543210");
		const uuid = UUID("123e4567-e89b-12d3-a456-426614174000");

		({
			idHex: id.hex,
			idStr: id.toString(),
			dateIso: date.date,
			numVal: num.value,
			uuidVal: uuid.value
		});
	`

	res, err := a.ExecuteShell(ctx, script)
	if err != nil {
		t.Fatalf("ExecuteShell failed: %v", err)
	}

	if len(res.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(res.Rows))
	}

	row := res.Rows[0]
	if row["idHex"] != "507f1f77bcf86cd799439011" {
		t.Errorf("expected idHex 507f1f77bcf86cd799439011, got %v", row["idHex"])
	}
	if row["numVal"] != "9876543210" {
		t.Errorf("expected numVal 9876543210, got %v", row["numVal"])
	}
}

func TestMongoShell_ArrayTransform(t *testing.T) {
	a := &Adapter{}
	ctx := context.Background()

	script := `
		const items = [
			{ name: "item1", price: 100 },
			{ name: "item2", price: 200 }
		];
		items.map(x => ({ ...x, doubled: x.price * 2 }));
	`

	res, err := a.ExecuteShell(ctx, script)
	if err != nil {
		t.Fatalf("ExecuteShell failed: %v", err)
	}

	if len(res.Rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(res.Rows))
	}

	if res.Rows[0]["doubled"] != int64(200) && res.Rows[0]["doubled"] != float64(200) {
		t.Errorf("expected doubled=200, got %v", res.Rows[0]["doubled"])
	}
}
