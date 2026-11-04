package mssql

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"pebblebase/internal/adapter"

	mssql "github.com/microsoft/go-mssqldb"
)

func TestEscapeIdentifier(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"users", "[users]"},
		{"[users]", "[users]"},
		{"dbo.users", "[dbo].[users]"},
		{"[dbo].[users]", "[dbo].[users]"},
		{"sales.order_items", "[sales].[order_items]"},
		{"col]name", "[col]]name]"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := escapeIdentifier(tt.input)
			if got != tt.expected {
				t.Errorf("escapeIdentifier(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSplitSchemaAndTable(t *testing.T) {
	tests := []struct {
		input      string
		wantSchema string
		wantTable  string
	}{
		{"users", "dbo", "users"},
		{"[users]", "dbo", "users"},
		{"dbo.users", "dbo", "users"},
		{"sales.orders", "sales", "orders"},
		{"[sales].[orders]", "sales", "orders"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			s, tbl := splitSchemaAndTable(tt.input)
			if s != tt.wantSchema || tbl != tt.wantTable {
				t.Errorf("splitSchemaAndTable(%q) = (%q, %q), want (%q, %q)", tt.input, s, tbl, tt.wantSchema, tt.wantTable)
			}
		})
	}
}

func TestNormalizeType(t *testing.T) {
	tests := []struct {
		raw      string
		expected string
	}{
		{"int", "int"},
		{"bigint", "int"},
		{"smallint", "int"},
		{"tinyint", "int"},
		{"bit", "bool"},
		{"decimal", "float"},
		{"numeric", "float"},
		{"float", "float"},
		{"money", "float"},
		{"datetime", "datetime"},
		{"datetime2", "datetime"},
		{"datetimeoffset", "datetime"},
		{"date", "datetime"},
		{"varchar", "string"},
		{"nvarchar", "string"},
		{"text", "string"},
		{"ntext", "string"},
		{"uniqueidentifier", "uuid"},
		{"varbinary", "binary"},
		{"image", "binary"},
		{"xml", "json"},
		{"json", "json"},
	}

	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got := normalizeType(tt.raw)
			if got != tt.expected {
				t.Errorf("normalizeType(%q) = %q, want %q", tt.raw, got, tt.expected)
			}
		})
	}
}

func TestBuildWhere(t *testing.T) {
	filters := []adapter.Filter{
		{Column: "age", Operator: "gte", Value: 18},
		{Column: "name", Operator: "contains", Value: "John"},
		{Column: "status", Operator: "in", Value: []any{"active", "pending"}},
	}

	where, args := buildWhere(filters, 1)

	expectedWhere := "WHERE [age] >= @p1 AND [name] LIKE @p2 AND [status] IN (@p3, @p4)"
	if where != expectedWhere {
		t.Errorf("buildWhere() = %q, want %q", where, expectedWhere)
	}

	expectedArgs := []any{18, "%John%", "active", "pending"}
	if !reflect.DeepEqual(args, expectedArgs) {
		t.Errorf("buildWhere() args = %v, want %v", args, expectedArgs)
	}
}

func TestBuildSelect_Pagination(t *testing.T) {
	// Case 1: with SortBy, Limit, and Offset
	opts1 := adapter.QueryOptions{
		SortBy:   "id",
		SortDesc: true,
		Limit:    25,
		Offset:   50,
	}
	sql1, _ := buildSelect("users", "", nil, opts1)
	expected1 := "SELECT * FROM [users]  ORDER BY [id] DESC OFFSET 50 ROWS FETCH NEXT 25 ROWS ONLY"
	if sql1 != expected1 {
		t.Errorf("buildSelect() = %q, want %q", sql1, expected1)
	}

	// Case 2: no SortBy, but has Limit -> Must inject ORDER BY (SELECT NULL) for T-SQL compatibility
	opts2 := adapter.QueryOptions{
		Limit: 10,
	}
	sql2, _ := buildSelect("orders", "WHERE [status] = @p1", []any{"active"}, opts2)
	expected2 := "SELECT * FROM [orders] WHERE [status] = @p1 ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY"
	if sql2 != expected2 {
		t.Errorf("buildSelect() = %q, want %q", sql2, expected2)
	}

	// Case 3: no pagination at all
	opts3 := adapter.QueryOptions{}
	sql3, _ := buildSelect("roles", "", nil, opts3)
	expected3 := "SELECT * FROM [roles] "
	if sql3 != expected3 {
		t.Errorf("buildSelect() = %q, want %q", sql3, expected3)
	}
}

func TestFormatMSSQLValue(t *testing.T) {
	// 1. UniqueIdentifier
	var uid mssql.UniqueIdentifier
	uid[0] = 0x01
	uid[15] = 0x0f
	formattedUID := formatMSSQLValue(uid, nil)
	uidStr, ok := formattedUID.(string)
	if !ok || len(uidStr) != 36 {
		t.Errorf("expected 36-char UUID string, got %v", formattedUID)
	}

	// 2. DateTimeOffset
	refTime := time.Date(2026, 10, 27, 9, 30, 0, 0, time.UTC)
	dto := mssql.DateTimeOffset(refTime)
	formattedDTO := formatMSSQLValue(dto, nil)
	if formattedDTO != refTime.Format(time.RFC3339Nano) {
		t.Errorf("expected RFC3339Nano string, got %v", formattedDTO)
	}

	// 3. Raw Bytes for varbinary
	rawBytes := []byte{0xDE, 0xAD, 0xBE, 0xEF}
	formattedBytes := formatMSSQLValue(rawBytes, nil)
	if formattedBytes != "0xdeadbeef" {
		t.Errorf("expected 0xdeadbeef, got %v", formattedBytes)
	}

	// 4. nil
	if formatMSSQLValue(nil, nil) != nil {
		t.Errorf("expected nil for nil value")
	}

	// 5. String
	if formatMSSQLValue("hello", nil) != "hello" {
		t.Errorf("expected hello")
	}
}

func TestCleanDefaultValue(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"((0))", "0"},
		{"('active')", "'active'"},
		{"(getdate())", "getdate()"},
		{"100", "100"},
	}

	for _, c := range cases {
		s := c.in
		cleaned := cleanDefaultValue(&s)
		if cleaned == nil || *cleaned != c.want {
			t.Errorf("cleanDefaultValue(%q) = %v, want %q", c.in, cleaned, c.want)
		}
	}
}

func TestIsMutationSQL(t *testing.T) {
	mutations := []string{
		"INSERT INTO users VALUES (1)",
		"UPDATE users SET name = 'a'",
		"DELETE FROM users",
		"CREATE TABLE foo (id INT)",
		"ALTER TABLE foo ADD col INT",
		"DROP TABLE foo",
		"TRUNCATE TABLE foo",
		"MERGE INTO target USING source ON target.id = source.id",
	}
	for _, q := range mutations {
		if !isMutationSQL(strings.ToUpper(q)) {
			t.Errorf("expected isMutationSQL(%q) = true", q)
		}
	}

	queries := []string{
		"SELECT * FROM users",
		"WITH cte AS (SELECT 1 AS n) SELECT * FROM cte",
	}
	for _, q := range queries {
		if isMutationSQL(strings.ToUpper(q)) {
			t.Errorf("expected isMutationSQL(%q) = false", q)
		}
	}
}

// TestMSSQL_LiveIntegration validates SQL Server connectivity, schema isolation (e.g. sales vs dbo),
// identity column auto-increment generation, and table introspection against Microsoft SQL Server.
func TestMSSQL_LiveIntegration(t *testing.T) {
	dsn := os.Getenv("PEBBLEBASE_TEST_MSSQL_DSN")
	if dsn == "" {
		t.Skip("PEBBLEBASE_TEST_MSSQL_DSN not set — skipping MSSQL live integration test")
	}

	ctx := context.Background()
	a, err := New(ctx, dsn)
	if err != nil {
		t.Fatalf("MSSQL New failed: %v", err)
	}
	defer a.Close()

	if err := a.Ping(ctx); err != nil {
		t.Fatalf("MSSQL Ping failed: %v", err)
	}

	setupSQL := `
	IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'sales')
		EXEC('CREATE SCHEMA sales');

	IF OBJECT_ID('sales.orders', 'U') IS NOT NULL DROP TABLE sales.orders;
	IF OBJECT_ID('dbo.orders', 'U') IS NOT NULL DROP TABLE dbo.orders;

	CREATE TABLE sales.orders (
		order_id INT IDENTITY(1,1) PRIMARY KEY,
		title NVARCHAR(100) NOT NULL,
		created_at DATETIME2 DEFAULT SYSUTCDATETIME()
	);

	CREATE TABLE dbo.orders (
		order_id INT IDENTITY(1000,1) PRIMARY KEY,
		title NVARCHAR(100) NOT NULL,
		created_at DATETIME2 DEFAULT SYSUTCDATETIME()
	);
	`
	if _, err := a.ExecuteRaw(ctx, setupSQL); err != nil {
		t.Fatalf("setup MSSQL schema failed: %v", err)
	}

	t.Cleanup(func() {
		cleanup := `
		IF OBJECT_ID('sales.orders', 'U') IS NOT NULL DROP TABLE sales.orders;
		IF OBJECT_ID('dbo.orders', 'U') IS NOT NULL DROP TABLE dbo.orders;
		`
		_, _ = a.ExecuteRaw(context.Background(), cleanup)
	})

	// 1. Insert rows and verify identity column auto-increment behavior
	err = a.Mutate(ctx, "sales.orders", adapter.MutationOp{
		Type: "insert",
		Values: map[string]any{
			"title": "Sales Order 1",
		},
	})
	if err != nil {
		t.Fatalf("insert into sales.orders failed: %v", err)
	}

	err = a.Mutate(ctx, "dbo.orders", adapter.MutationOp{
		Type: "insert",
		Values: map[string]any{
			"title": "DBO Order 1",
		},
	})
	if err != nil {
		t.Fatalf("insert into dbo.orders failed: %v", err)
	}

	// 2. Query each table and verify schema isolation and starting identity IDs
	salesRes, err := a.Query(ctx, "sales.orders", adapter.QueryOptions{Limit: 1})
	if err != nil || len(salesRes.Rows) == 0 {
		t.Fatalf("query sales.orders failed: %v", err)
	}
	salesID := fmt.Sprintf("%v", salesRes.Rows[0]["order_id"])
	if salesID != "1" {
		t.Errorf("expected sales.orders identity start at 1, got %s", salesID)
	}

	dboRes, err := a.Query(ctx, "dbo.orders", adapter.QueryOptions{Limit: 1})
	if err != nil || len(dboRes.Rows) == 0 {
		t.Fatalf("query dbo.orders failed: %v", err)
	}
	dboID := fmt.Sprintf("%v", dboRes.Rows[0]["order_id"])
	if dboID != "1000" {
		t.Errorf("expected dbo.orders identity start at 1000, got %s", dboID)
	}

	// 3. Introspect schema isolation
	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("MSSQL Introspect failed: %v", err)
	}

	foundSales := false
	foundDbo := false
	for _, tbl := range tables {
		if tbl.Name == "sales.orders" {
			foundSales = true
		}
		if tbl.Name == "orders" || tbl.Name == "dbo.orders" {
			foundDbo = true
		}
	}
	if !foundSales || !foundDbo {
		t.Errorf("schema isolation introspect mismatch: foundSales=%v, foundDbo=%v",
			foundSales, foundDbo)
	}
}
