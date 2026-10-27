package mssql

import (
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
