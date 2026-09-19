package savedquery_test

import (
	"context"
	"database/sql"
	"testing"

	"pebblebase/internal/savedquery"

	_ "modernc.org/sqlite"
)

func newTestStore(t *testing.T) *savedquery.Store {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite memory db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	store, err := savedquery.NewStore(db)
	if err != nil {
		t.Fatalf("failed to create savedquery store: %v", err)
	}
	return store
}

func TestSavedQuery_CRUD_And_FolderFilter(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	// 1. Create queries with folders and tags
	q1, err := store.Create(ctx, "conn1", "user1", "Monthly Active Users", "SELECT * FROM users", "reporting/finance", []string{"monthly", "users"}, true)
	if err != nil {
		t.Fatalf("failed to create q1: %v", err)
	}
	if q1.Folder != "reporting/finance" {
		t.Errorf("expected folder 'reporting/finance', got %q", q1.Folder)
	}

	q2, err := store.Create(ctx, "conn1", "user1", "Daily Orders", "SELECT * FROM orders", "reporting", []string{"daily", "orders"}, false)
	if err != nil {
		t.Fatalf("failed to create q2: %v", err)
	}

	q3, err := store.Create(ctx, "conn1", "user1", "Uncategorized Log", "SELECT 1", "", []string{"misc"}, false)
	if err != nil {
		t.Fatalf("failed to create q3: %v", err)
	}

	// 2. List all
	all, err := store.List(ctx, "conn1", savedquery.ListParams{})
	if err != nil {
		t.Fatalf("failed to list all: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("expected 3 items, got %d", len(all))
	}

	// 3. Filter by parent folder 'reporting' (should match 'reporting' and 'reporting/finance')
	reportingList, err := store.List(ctx, "conn1", savedquery.ListParams{Folder: "reporting"})
	if err != nil {
		t.Fatalf("failed to list reporting folder: %v", err)
	}
	if len(reportingList) != 2 {
		t.Errorf("expected 2 items for folder 'reporting', got %d", len(reportingList))
	}

	// 4. Filter by exact folder 'reporting/finance'
	financeList, err := store.List(ctx, "conn1", savedquery.ListParams{Folder: "reporting/finance"})
	if err != nil {
		t.Fatalf("failed to list reporting/finance folder: %v", err)
	}
	if len(financeList) != 1 || financeList[0].ID != q1.ID {
		t.Errorf("expected 1 item for folder 'reporting/finance', got %d", len(financeList))
	}

	// 5. Update folder and tag
	newFolder := "analytics"
	updated, err := store.Update(ctx, q2.ID, savedquery.UpdateInput{
		Folder: &newFolder,
	})
	if err != nil {
		t.Fatalf("failed to update q2 folder: %v", err)
	}
	if updated.Folder != "analytics" {
		t.Errorf("expected updated folder 'analytics', got %q", updated.Folder)
	}

	// 6. Delete query
	if err := store.Delete(ctx, q3.ID); err != nil {
		t.Fatalf("failed to delete q3: %v", err)
	}

	allAfterDelete, err := store.List(ctx, "conn1", savedquery.ListParams{})
	if err != nil {
		t.Fatalf("failed to list after delete: %v", err)
	}
	if len(allAfterDelete) != 2 {
		t.Errorf("expected 2 items after delete, got %d", len(allAfterDelete))
	}
}
