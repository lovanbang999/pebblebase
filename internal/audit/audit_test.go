package audit_test

import (
	"context"
	"database/sql"
	"net/http/httptest"
	"testing"

	"pebblebase/internal/audit"
	_ "modernc.org/sqlite"
)

func TestAuditLogger(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	defer db.Close()

	logger, err := audit.NewLogger(db)
	if err != nil {
		t.Fatalf("NewLogger failed: %v", err)
	}

	ctx := context.Background()

	// Initial count should be 0
	entries, total, err := logger.List(ctx, 10, 0)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if total != 0 || len(entries) != 0 {
		t.Errorf("expected 0 entries initially, got total=%d, len=%d", total, len(entries))
	}

	// Insert 3 entries
	logger.Log(ctx, "user-1", "admin", audit.ActionLogin, "", "logged in", "127.0.0.1")
	logger.Log(ctx, "user-1", "admin", audit.ActionConnectionCreate, "Local SQLite", "sqlite", "127.0.0.1")
	logger.Log(ctx, "user-2", "viewer", audit.ActionQueryExecute, "Local SQLite", "SELECT 1", "192.168.1.10")

	entries, total, err = logger.List(ctx, 10, 0)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if total != 3 || len(entries) != 3 {
		t.Fatalf("expected 3 entries, got total=%d, len=%d", total, len(entries))
	}

	// Newest first check: last inserted was ActionQueryExecute
	if entries[0].Action != audit.ActionQueryExecute {
		t.Errorf("expected newest entry to have action %s, got %s", audit.ActionQueryExecute, entries[0].Action)
	}
	if entries[0].Username != "viewer" {
		t.Errorf("expected username 'viewer', got %s", entries[0].Username)
	}

	// Test pagination limit & offset
	page1, _, err := logger.List(ctx, 2, 0)
	if err != nil || len(page1) != 2 {
		t.Fatalf("expected page 1 with 2 items, got %d, err: %v", len(page1), err)
	}
	page2, _, err := logger.List(ctx, 2, 2)
	if err != nil || len(page2) != 1 {
		t.Fatalf("expected page 2 with 1 item, got %d, err: %v", len(page2), err)
	}
	if page1[0].ID == page2[0].ID {
		t.Errorf("page 1 and page 2 items should not overlap")
	}
}

func TestIPFromRequest(t *testing.T) {
	// Without X-Forwarded-For
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	if ip := audit.IPFromRequest(req); ip != "10.0.0.1:1234" {
		t.Errorf("expected remote addr %q, got %q", "10.0.0.1:1234", ip)
	}

	// With X-Forwarded-For
	req.Header.Set("X-Forwarded-For", "203.0.113.195")
	if ip := audit.IPFromRequest(req); ip != "203.0.113.195" {
		t.Errorf("expected forwarded ip %q, got %q", "203.0.113.195", ip)
	}
}
