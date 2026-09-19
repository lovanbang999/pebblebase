package seeder

import (
	"pebblebase/internal/schema"
	"strings"
	"testing"
)

func TestResolveDependencies_SimpleHierarchy(t *testing.T) {
	usersTable := schema.Table{
		Name: "users",
		Columns: []schema.Column{
			{Name: "id", Type: "uuid", IsPrimaryKey: true},
			{Name: "email", Type: "string"},
		},
	}

	ordersTable := schema.Table{
		Name: "orders",
		Columns: []schema.Column{
			{Name: "id", Type: "uuid", IsPrimaryKey: true},
			{Name: "user_id", Type: "uuid", IsForeignKey: true},
			{Name: "total_amount", Type: "float"},
		},
		Relations: []schema.Relation{
			{
				FromTable:  "orders",
				FromColumn: "user_id",
				ToTable:    "users",
				ToColumn:   "id",
			},
		},
	}

	allTables := []schema.Table{ordersTable, usersTable}

	ordered, err := ResolveDependencies(allTables, "orders")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(ordered) != 2 {
		t.Fatalf("expected 2 tables, got %d", len(ordered))
	}

	// users must precede orders
	if ordered[0].Name != "users" || ordered[1].Name != "orders" {
		t.Errorf("expected [users, orders], got [%s, %s]", ordered[0].Name, ordered[1].Name)
	}
}

func TestResolveDependencies_DeepHierarchy(t *testing.T) {
	users := schema.Table{Name: "users"}
	categories := schema.Table{Name: "categories"}
	products := schema.Table{
		Name: "products",
		Relations: []schema.Relation{
			{FromTable: "products", FromColumn: "cat_id", ToTable: "categories", ToColumn: "id"},
		},
	}
	orders := schema.Table{
		Name: "orders",
		Relations: []schema.Relation{
			{FromTable: "orders", FromColumn: "user_id", ToTable: "users", ToColumn: "id"},
		},
	}
	orderItems := schema.Table{
		Name: "order_items",
		Relations: []schema.Relation{
			{FromTable: "order_items", FromColumn: "order_id", ToTable: "orders", ToColumn: "id"},
			{FromTable: "order_items", FromColumn: "product_id", ToTable: "products", ToColumn: "id"},
		},
	}

	allTables := []schema.Table{orderItems, orders, products, categories, users}

	ordered, err := ResolveDependencies(allTables, "order_items")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(ordered) != 5 {
		t.Fatalf("expected 5 tables, got %d", len(ordered))
	}

	indices := make(map[string]int)
	for i, tbl := range ordered {
		indices[tbl.Name] = i
	}

	if indices["users"] >= indices["orders"] {
		t.Errorf("users (%d) must precede orders (%d)", indices["users"], indices["orders"])
	}
	if indices["categories"] >= indices["products"] {
		t.Errorf("categories (%d) must precede products (%d)", indices["categories"], indices["products"])
	}
	if indices["orders"] >= indices["order_items"] {
		t.Errorf("orders (%d) must precede order_items (%d)", indices["orders"], indices["order_items"])
	}
	if indices["products"] >= indices["order_items"] {
		t.Errorf("products (%d) must precede order_items (%d)", indices["products"], indices["order_items"])
	}
}

func TestResolveDependencies_CircularDependency(t *testing.T) {
	tableA := schema.Table{
		Name: "table_a",
		Relations: []schema.Relation{
			{FromTable: "table_a", FromColumn: "b_id", ToTable: "table_b", ToColumn: "id"},
		},
	}
	tableB := schema.Table{
		Name: "table_b",
		Relations: []schema.Relation{
			{FromTable: "table_b", FromColumn: "a_id", ToTable: "table_a", ToColumn: "id"},
		},
	}

	ordered, err := ResolveDependencies([]schema.Table{tableA, tableB}, "table_a")
	if err != nil {
		t.Fatalf("unexpected error on circular dep: %v", err)
	}

	if len(ordered) != 2 {
		t.Fatalf("expected 2 tables, got %d", len(ordered))
	}
}

func TestGenerateSeedSQL_FKIntegrity(t *testing.T) {
	usersTable := schema.Table{
		Name: "users",
		Columns: []schema.Column{
			{Name: "id", Type: "uuid", IsPrimaryKey: true},
			{Name: "email", Type: "string"},
			{Name: "created_at", Type: "datetime"},
		},
	}

	ordersTable := schema.Table{
		Name: "orders",
		Columns: []schema.Column{
			{Name: "id", Type: "uuid", IsPrimaryKey: true},
			{Name: "user_id", Type: "uuid", IsForeignKey: true},
			{Name: "status", Type: "string"},
			{Name: "total_amount", Type: "float"},
		},
		Relations: []schema.Relation{
			{
				FromTable:  "orders",
				FromColumn: "user_id",
				ToTable:    "users",
				ToColumn:   "id",
			},
		},
	}

	ordered := []schema.Table{usersTable, ordersTable}
	sql, tablesSeeded, err := GenerateSeedSQL(ordered, "orders", 10, "postgres")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(tablesSeeded) != 2 {
		t.Errorf("expected 2 tables seeded, got %v", tablesSeeded)
	}

	if !strings.HasPrefix(sql, "BEGIN;\n") {
		t.Errorf("expected SQL to begin with transaction BEGIN")
	}
	if !strings.HasSuffix(strings.TrimSpace(sql), "COMMIT;") {
		t.Errorf("expected SQL to end with transaction COMMIT")
	}

	// users should be inserted before orders
	userPos := strings.Index(sql, `INSERT INTO "users"`)
	orderPos := strings.Index(sql, `INSERT INTO "orders"`)
	if userPos == -1 || orderPos == -1 {
		t.Fatalf("missing INSERT statements in output: %s", sql)
	}
	if userPos >= orderPos {
		t.Errorf("expected users INSERT before orders INSERT")
	}

	// Email should be present in realistic format
	if !strings.Contains(sql, "@example.com") {
		t.Errorf("expected generated email addresses in SQL")
	}
}

func TestGenerateSeedSQL_MySQLDialect(t *testing.T) {
	table := schema.Table{
		Name: "items",
		Columns: []schema.Column{
			{Name: "id", Type: "int", IsPrimaryKey: true},
			{Name: "name", Type: "string"},
		},
	}

	sql, _, err := GenerateSeedSQL([]schema.Table{table}, "items", 5, "mysql")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(sql, "INSERT INTO `items` (`id`, `name`)") {
		t.Errorf("expected MySQL backtick quoting in SQL: %s", sql)
	}
}
