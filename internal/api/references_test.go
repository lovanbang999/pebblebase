package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/auth"
	"pebblebase/internal/schema"
	"pebblebase/internal/storage"
)

func TestReferenceCandidatesUseOnlyPrimaryKeysAndCap(t *testing.T) {
	tables := make([]schema.Table, 40)
	for i := range tables {
		tables[i] = schema.Table{Name: "t", Columns: []schema.Column{{Name: "foreign_id", Type: "uuid"}, {Name: "id", Type: "uuid", IsPrimaryKey: true}}}
	}
	candidates := referenceCandidates(tables, "c", "postgres", "")
	if len(candidates) != 40 || candidates[0].column != "id" {
		t.Fatalf("unexpected candidates: %#v", candidates[:1])
	}
}

func TestResolveReferencesBoundsCandidateQueriesAndMapsCollisions(t *testing.T) {
	store, _ := storage.NewStore(t.TempDir(), nil)
	record, _ := store.Save("development", "postgres", "", "", "", "", "", false, storage.SaveParams{Environment: "local"})
	_, _ = store.Workspaces()
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	limit := 45
	started := 0
	a := &findTestAdapter{tables: make([]schema.Table, limit)}
	for i := range a.tables {
		a.tables[i] = schema.Table{Name: "t" + strings.Repeat("x", i), Columns: []schema.Column{{Name: "id", Type: "uuid", IsPrimaryKey: true}, {Name: "tenant", Type: "string", IsPrimaryKey: true}}}
	}
	a.query = func(ctx context.Context, table string, _ adapter.QueryOptions) (adapter.QueryResult, error) {
		started++
		if _, ok := ctx.Deadline(); !ok {
			t.Error("lookup query missing per-table deadline")
		}
		return adapter.QueryResult{TotalCount: 2, Rows: []map[string]any{{"id": "match", "tenant": "tenant-1", "secret": "hidden"}, {"id": "match2", "tenant": "tenant-2"}}}, nil
	}
	s.cache.set(record.ID, a)
	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	body := `{"workspaceId":"default","currentConnectionId":"` + record.ID + `","currentTable":"source","value":"f47ac10b-58cc-4372-a567-0e02b2c3d479"}`
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/references/resolve", strings.NewReader(body)))
	if response.Code != http.StatusOK {
		t.Fatalf("lookup status %d: %s", response.Code, response.Body.String())
	}
	var result referenceResponse
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if started != referenceCandidateCap || result.Checked != referenceCandidateCap || len(result.Matches) != referenceCandidateCap {
		t.Fatalf("cap/collision mapping failed: queries=%d result=%d", started, result.Checked)
	}
	if result.Matches[0].Table != "t" || result.Matches[1].Table != "tx" {
		t.Fatalf("collision ordering changed: %q then %q", result.Matches[0].Table, result.Matches[1].Table)
	}
	if value, present := result.Matches[0].Rows[0]["secret"]; !present || value != "[redacted]" {
		t.Fatal("sensitive field leaked")
	}
	if result.Matches[0].RowIdentity != `["match","tenant-1"]` {
		t.Fatalf("composite primary key identity not returned: %s", result.Matches[0].RowIdentity)
	}
}

func TestResolveReferencesSkipsOtherProductionConnectionsAndRequiresAuth(t *testing.T) {
	store, _ := storage.NewStore(t.TempDir(), nil)
	current, _ := store.Save("local", "postgres", "", "", "", "", "", false, storage.SaveParams{Environment: "local"})
	prod, _ := store.Save("prod", "postgres", "", "", "", "", "", false, storage.SaveParams{Environment: "production"})
	doc, _ := store.Workspaces()
	doc.Workspaces[0].ConnectionIDs = []string{current.ID, prod.ID}
	_ = store.SaveWorkspaces(doc)
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	local := &findTestAdapter{tables: []schema.Table{{Name: "a", Columns: []schema.Column{{Name: "id", Type: "uuid", IsPrimaryKey: true}}}}}
	prodAdapter := &findTestAdapter{tables: []schema.Table{{Name: "b", Columns: []schema.Column{{Name: "id", Type: "uuid", IsPrimaryKey: true}}}}}
	queries := 0
	local.query = func(context.Context, string, adapter.QueryOptions) (adapter.QueryResult, error) {
		queries++
		return adapter.QueryResult{}, nil
	}
	prodAdapter.query = func(context.Context, string, adapter.QueryOptions) (adapter.QueryResult, error) {
		t.Error("queried secondary production connection")
		return adapter.QueryResult{}, nil
	}
	s.cache.set(current.ID, local)
	s.cache.set(prod.ID, prodAdapter)
	request := referenceRequest{WorkspaceID: "default", CurrentConnection: current.ID, CurrentTable: "source", Value: "f47ac10b-58cc-4372-a567-0e02b2c3d479"}
	encoded, _ := json.Marshal(request)
	response := httptest.NewRecorder()
	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/references/resolve", strings.NewReader(string(encoded))))
	if response.Code != 200 || queries != 1 {
		t.Fatalf("production rule failed: status=%d queries=%d", response.Code, queries)
	}

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "auth.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	authStore, err := auth.NewStore(db)
	if err != nil {
		t.Fatal(err)
	}
	protected := NewServer(store, nil, auth.NewService(authStore, auth.NewJWTManager([]byte("test-signing-secret-at-least-32-chars-long"))), nil, nil, nil, nil, true)
	t.Cleanup(func() { _ = protected.Close() })
	protectedMux := http.NewServeMux()
	protected.RegisterRoutes(protectedMux)
	unauthorized := httptest.NewRecorder()
	protectedMux.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodPost, "/api/references/resolve", strings.NewReader(string(encoded))))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated reference lookup status=%d", unauthorized.Code)
	}
}

func TestReferenceLookupDeadlineIsThreeHundredMilliseconds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), referenceTableTimeout)
	defer cancel()
	deadline, ok := ctx.Deadline()
	if !ok || time.Until(deadline) > 300*time.Millisecond {
		t.Fatal("wrong lookup deadline")
	}
}

func TestResolveReferencesRejectsUnverifiedDeclaredRelation(t *testing.T) {
	store, _ := storage.NewStore(t.TempDir(), nil)
	record, _ := store.Save("local", "postgres", "", "", "", "", "", false)
	_, _ = store.Workspaces()
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	a := &findTestAdapter{tables: []schema.Table{{Name: "source", Columns: []schema.Column{{Name: "id", Type: "uuid", IsPrimaryKey: true}}}}}
	a.query = func(context.Context, string, adapter.QueryOptions) (adapter.QueryResult, error) {
		t.Error("unverified relation queried")
		return adapter.QueryResult{}, nil
	}
	s.cache.set(record.ID, a)
	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	body := `{"workspaceId":"default","currentConnectionId":"` + record.ID + `","currentTable":"source","value":"any-value","declaredTable":"target","declaredColumn":"id"}`
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/references/resolve", strings.NewReader(body)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unverified relation status=%d body=%s", response.Code, response.Body.String())
	}
}
