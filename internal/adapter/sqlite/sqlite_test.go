package sqlite_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"pebblebase/internal/adapter"
	"pebblebase/internal/adapter/sqlite"

	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) string {
	t.Helper()
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("setup: open sqlite: %v", err)
	}
	defer db.Close()

	schemaSQL := `
	CREATE TABLE authors (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE posts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		author_id INTEGER NOT NULL,
		title TEXT NOT NULL,
		content TEXT,
		published BOOLEAN DEFAULT 0,
		views INTEGER DEFAULT 0,
		FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
	);
	`
	if _, err := db.Exec(schemaSQL); err != nil {
		t.Fatalf("setup: exec schema: %v", err)
	}

	return dbPath
}

func TestSQLiteAdapter_ConnectAndPing(t *testing.T) {
	ctx := context.Background()
	dbPath := setupTestDB(t)

	a, err := sqlite.New(ctx, dbPath)
	if err != nil {
		t.Fatalf("sqlite.New() error: %v", err)
	}
	defer a.Close()

	if err := a.Ping(ctx); err != nil {
		t.Fatalf("Ping() error: %v", err)
	}
}

func TestSQLiteAdapter_NonExistentFile(t *testing.T) {
	ctx := context.Background()
	missingPath := filepath.Join(t.TempDir(), "does_not_exist.db")

	_, err := sqlite.New(ctx, missingPath)
	if err == nil {
		t.Fatal("sqlite.New() expected error for non-existent file, got nil")
	}
}

func TestSQLiteAdapter_Introspect(t *testing.T) {
	ctx := context.Background()
	dbPath := setupTestDB(t)

	a, err := sqlite.New(ctx, dbPath)
	if err != nil {
		t.Fatalf("sqlite.New() error: %v", err)
	}
	defer a.Close()

	tables, err := a.Introspect(ctx)
	if err != nil {
		t.Fatalf("Introspect() error: %v", err)
	}

	if len(tables) < 2 {
		t.Fatalf("Introspect() expected at least 2 tables, got %d", len(tables))
	}

	tableMap := make(map[string]bool)
	for _, tbl := range tables {
		tableMap[tbl.Name] = true
	}

	if !tableMap["authors"] || !tableMap["posts"] {
		t.Errorf("Introspect() missing expected tables, got: %v", tableMap)
	}

	// Verify posts table columns & FK
	var postsTable *struct {
		Name    string
		Columns []string
		HasFK   bool
		PKCol   string
	}

	for _, tbl := range tables {
		if tbl.Name == "posts" {
			postsTable = &struct {
				Name    string
				Columns []string
				HasFK   bool
				PKCol   string
			}{}
			for _, c := range tbl.Columns {
				postsTable.Columns = append(postsTable.Columns, c.Name)
				if c.IsPrimaryKey {
					postsTable.PKCol = c.Name
				}
				if c.IsForeignKey {
					postsTable.HasFK = true
				}
			}
			if len(tbl.Relations) > 0 {
				rel := tbl.Relations[0]
				if rel.ToTable != "authors" || rel.FromColumn != "author_id" {
					t.Errorf("unexpected relation: %+v", rel)
				}
			} else {
				t.Error("expected relation on posts.author_id, got none")
			}
		}
	}

	if postsTable == nil {
		t.Fatal("posts table not found")
	}
	if postsTable.PKCol != "id" {
		t.Errorf("expected PK 'id', got %q", postsTable.PKCol)
	}
	if !postsTable.HasFK {
		t.Error("expected posts.author_id to have IsForeignKey=true")
	}
}

func TestSQLiteAdapter_CRUD_And_Query(t *testing.T) {
	ctx := context.Background()
	dbPath := setupTestDB(t)

	a, err := sqlite.New(ctx, dbPath)
	if err != nil {
		t.Fatalf("sqlite.New() error: %v", err)
	}
	defer a.Close()

	// 1. Insert Author
	err = a.Mutate(ctx, "authors", adapter.MutationOp{
		Type: "insert",
		Values: map[string]any{
			"name":  "Ada Lovelace",
			"email": "ada@example.com",
		},
	})
	if err != nil {
		t.Fatalf("Mutate(insert author) error: %v", err)
	}

	// Query authors
	res, err := a.Query(ctx, "authors", adapter.QueryOptions{})
	if err != nil {
		t.Fatalf("Query(authors) error: %v", err)
	}
	if res.TotalCount != 1 || len(res.Rows) != 1 {
		t.Fatalf("Query(authors) unexpected result: count=%d rows=%d", res.TotalCount, len(res.Rows))
	}
	if res.Rows[0]["name"] != "Ada Lovelace" {
		t.Errorf("expected author name 'Ada Lovelace', got %v", res.Rows[0]["name"])
	}

	authorID := res.Rows[0]["id"]

	// 2. Insert Multiple Posts
	posts := []string{"First Post", "Second Post", "Third Post"}
	for _, title := range posts {
		err = a.Mutate(ctx, "posts", adapter.MutationOp{
			Type: "insert",
			Values: map[string]any{
				"author_id": authorID,
				"title":     title,
				"content":   "Hello world content",
			},
		})
		if err != nil {
			t.Fatalf("Mutate(insert post %s) error: %v", title, err)
		}
	}

	// 3. Query with Filter (contains)
	filterRes, err := a.Query(ctx, "posts", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "title", Operator: "contains", Value: "Second"},
		},
	})
	if err != nil {
		t.Fatalf("Query(filter) error: %v", err)
	}
	if filterRes.TotalCount != 1 {
		t.Errorf("Query(filter) expected 1 match, got %d", filterRes.TotalCount)
	}

	// 4. Query with Sort and Pagination
	sortedRes, err := a.Query(ctx, "posts", adapter.QueryOptions{
		SortBy:   "title",
		SortDesc: true,
		Limit:    2,
		Offset:   0,
	})
	if err != nil {
		t.Fatalf("Query(sort) error: %v", err)
	}
	if sortedRes.TotalCount != 3 {
		t.Errorf("Query(sort) expected total_count=3, got %d", sortedRes.TotalCount)
	}
	if len(sortedRes.Rows) != 2 {
		t.Errorf("Query(sort) expected 2 rows, got %d", len(sortedRes.Rows))
	}
	if sortedRes.Rows[0]["title"] != "Third Post" {
		t.Errorf("expected first row 'Third Post', got %v", sortedRes.Rows[0]["title"])
	}

	// 5. Update Post
	err = a.Mutate(ctx, "posts", adapter.MutationOp{
		Type: "update",
		Where: map[string]any{
			"title": "First Post",
		},
		Values: map[string]any{
			"title": "Updated First Post",
		},
	})
	if err != nil {
		t.Fatalf("Mutate(update post) error: %v", err)
	}

	// Verify update
	updatedRes, err := a.Query(ctx, "posts", adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: "title", Operator: "eq", Value: "Updated First Post"},
		},
	})
	if err != nil || updatedRes.TotalCount != 1 {
		t.Fatalf("Query after update failed: total=%d, err=%v", updatedRes.TotalCount, err)
	}

	// 6. Delete Post
	err = a.Mutate(ctx, "posts", adapter.MutationOp{
		Type: "delete",
		Where: map[string]any{
			"title": "Updated First Post",
		},
	})
	if err != nil {
		t.Fatalf("Mutate(delete post) error: %v", err)
	}

	// Verify deletion
	afterDeleteRes, err := a.Query(ctx, "posts", adapter.QueryOptions{})
	if err != nil {
		t.Fatalf("Query after delete error: %v", err)
	}
	if afterDeleteRes.TotalCount != 2 {
		t.Errorf("expected total_count=2 after delete, got %d", afterDeleteRes.TotalCount)
	}
}
