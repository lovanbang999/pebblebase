package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
	"pebblebase/internal/storage"
)

type findTestAdapter struct {
	mockTestAdapter
	tables []schema.Table
	query  func(context.Context, string, adapter.QueryOptions) (adapter.QueryResult, error)
}

func (a *findTestAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return a.tables, nil
}
func (a *findTestAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return a.query(ctx, table, opts)
}

func TestFindClassificationAndSafeSamples(t *testing.T) {
	cases := []struct {
		value, kind, op string
		ok              bool
	}{
		{"f47ac10b-58cc-4372-a567-0e02b2c3d479", "uuid", "eq", true},
		{"507f1f77bcf86cd799439011", "string", "eq", true},
		{"100", "int", "eq", true},
		{"100", "uuid", "", false},
		{"ab", "string", "", false},
		{"hello", "string", "contains", true},
		{"100", "float", "", false},
	}
	for _, tc := range cases {
		got, ok := classifyFind(tc.value, tc.kind)
		if got != tc.op || ok != tc.ok {
			t.Fatalf("classifyFind(%q,%q)=(%q,%v)", tc.value, tc.kind, got, ok)
		}
	}
	row := safeFindRow(map[string]any{"long": strings.Repeat("x", 200), "password": "secret", "other": 1, "third": 2, "fourth": 3, "fifth": 4, "sixth": 5, "seventh": 6}, "long")
	if len(row) != 6 || len(row["long"].(string)) > 160 {
		t.Fatalf("unsafe sample row: %#v", row)
	}
	if redacted := safeFindRow(map[string]any{"password": "secret"}, "password"); redacted["password"] != "[redacted]" {
		t.Fatalf("sensitive field was exposed: %#v", redacted)
	}
}

func TestFindTextColumnBounds(t *testing.T) {
	for _, test := range []struct {
		native      string
		mongo, want bool
	}{
		{"varchar(255)", false, true}, {"varchar(4096)", false, false}, {"character varying", false, false}, {"text", false, false}, {"string", true, true},
	} {
		if got := suitableFindText(schema.Column{NativeType: test.native}, test.mongo); got != test.want {
			t.Fatalf("suitableFindText(%q,%v)=%v", test.native, test.mongo, got)
		}
	}
}

func TestFindEverywhereStreamsNDJSONWithoutListeningPorts(t *testing.T) {
	store, err := storage.NewStore(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	record, err := store.Save("local", "postgres", "", "", "", "", "", false, storage.SaveParams{Environment: "local"})
	if err != nil {
		t.Fatal(err)
	}
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	a := &findTestAdapter{tables: []schema.Table{{Name: "items", Columns: []schema.Column{{Name: "name", Type: "string"}}}}}
	a.query = func(context.Context, string, adapter.QueryOptions) (adapter.QueryResult, error) {
		return adapter.QueryResult{TotalCount: 1, Rows: []map[string]any{{"name": "match"}}}, nil
	}
	s.cache.set(record.ID, a)
	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/find-everywhere", strings.NewReader(`{"value":"match","connectionIds":["`+record.ID+`"],"includeProduction":false}`))
	mux.ServeHTTP(response, request)
	if response.Code != 200 || !strings.Contains(response.Header().Get("Content-Type"), "application/x-ndjson") || !strings.Contains(response.Body.String(), `"table":"items"`) {
		t.Fatalf("find stream failed: %d %s", response.Code, response.Body.String())
	}
}

func TestFindTableLimitStopsValueQueriesAtFifty(t *testing.T) {
	store, err := storage.NewStore(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	record, err := store.Save("large", "postgres", "", "", "", "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	tables := make([]schema.Table, findTableCap+1)
	for i := range tables {
		tables[i] = schema.Table{Name: "t" + strconv.Itoa(i), Columns: []schema.Column{{Name: "id", Type: "int", IsPrimaryKey: true}}}
	}
	queries := 0
	a := &findTestAdapter{tables: tables}
	a.query = func(context.Context, string, adapter.QueryOptions) (adapter.QueryResult, error) {
		queries++
		return adapter.QueryResult{TotalCount: 1, Rows: []map[string]any{{"id": 1}}}, nil
	}
	s.cache.set(record.ID, a)
	result := s.searchConnection(context.Background(), record.ID, findRequest{Value: "1"})
	if queries != findTableCap || len(result.Matches) != findTableCap || result.Status != "complete" || result.Note != "table limit reached (50)" {
		t.Fatalf("table cap not applied: queries=%d result=%#v", queries, result)
	}
}

func TestFindProductionSkippedAndNonProductionSearchMapsResults(t *testing.T) {
	store, err := storage.NewStore(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	prod, err := store.Save("prod", "postgres", "", "", "", "", "", false, storage.SaveParams{Environment: "production"})
	if err != nil {
		t.Fatal(err)
	}
	local, err := store.Save("local", "postgres", "", "", "", "", "", false, storage.SaveParams{Environment: "local"})
	if err != nil {
		t.Fatal(err)
	}
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	prodResult := s.searchConnection(context.Background(), prod.ID, findRequest{Value: "foo"})
	if prodResult.Status != "skipped" || prodResult.Note != "skipped (production)" {
		t.Fatalf("production was not skipped: %#v", prodResult)
	}
	if disconnected := s.searchConnection(context.Background(), local.ID, findRequest{Value: "foo"}); disconnected.Note != "skipped (disconnected)" {
		t.Fatalf("disconnected source not skipped: %#v", disconnected)
	}
	a := &findTestAdapter{tables: []schema.Table{{Name: "items", Columns: []schema.Column{{Name: "id", Type: "int", IsPrimaryKey: true}, {Name: "title", Type: "string"}}}}}
	a.query = func(_ context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
		if table != "items" || opts.Limit != findRowsPerTable || len(opts.Filters) != 1 || opts.Filters[0].Operator != "contains" || opts.Filters[0].Value != "foo" {
			t.Fatalf("unexpected safe search query: %#v", opts)
		}
		return adapter.QueryResult{TotalCount: 9, Rows: []map[string]any{{"id": int64(1), "title": "foo"}}}, nil
	}
	s.cache.set(local.ID, a)
	result := s.searchConnection(context.Background(), local.ID, findRequest{Value: "foo"})
	if result.Status != "complete" || len(result.Matches) != 1 || result.Matches[0].Count != 9 || result.Matches[0].Rows[0]["title"] != "foo" {
		t.Fatalf("incorrect mapped result: %#v", result)
	}
	prodAdapter := &findTestAdapter{tables: a.tables, query: a.query}
	s.cache.set(prod.ID, prodAdapter)
	if included := s.searchConnection(context.Background(), prod.ID, findRequest{Value: "foo", IncludeProduction: true}); included.Status != "complete" || len(included.Matches) == 0 {
		t.Fatalf("explicit production opt-in did not search: %#v", included)
	}
}

func TestFindCancellationAndCaps(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := ctx.Err(); err == nil {
		t.Fatal("cancelled context has no error")
	}
	if findGlobalTimeout <= 0 || findConnectionTimeout > findGlobalTimeout || findTableCap != 50 || findRowsPerTable != 4 || findMaxConnections != 24 {
		t.Fatal("find limits changed without test update")
	}
	ctx, cancel = context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	<-ctx.Done()
	store, err := storage.NewStore(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	record, err := store.Save("cancel", "postgres", "", "", "", "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	a := &findTestAdapter{tables: []schema.Table{{Name: "items", Columns: []schema.Column{{Name: "name", Type: "string"}}}}}
	a.query = func(ctx context.Context, _ string, _ adapter.QueryOptions) (adapter.QueryResult, error) {
		<-ctx.Done()
		return adapter.QueryResult{}, ctx.Err()
	}
	s.cache.set(record.ID, a)
	cancelled, cancelSearch := context.WithCancel(context.Background())
	cancelSearch()
	result := s.searchConnection(cancelled, record.ID, findRequest{Value: "abc"})
	if result.Status != "partial" {
		t.Fatalf("cancelled work not reported partial: %#v", result)
	}
}

func TestFindCancellationRetainsMatchesAsPartial(t *testing.T) {
	store, err := storage.NewStore(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	record, err := store.Save("partial", "postgres", "", "", "", "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	s := NewServer(store, nil, nil, nil, nil, nil, nil, false)
	t.Cleanup(func() { _ = s.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a := &findTestAdapter{tables: []schema.Table{
		{Name: "first", Columns: []schema.Column{{Name: "id", Type: "int", IsPrimaryKey: true}}},
		{Name: "second", Columns: []schema.Column{{Name: "id", Type: "int", IsPrimaryKey: true}}},
	}}
	a.query = func(context.Context, string, adapter.QueryOptions) (adapter.QueryResult, error) {
		cancel()
		return adapter.QueryResult{TotalCount: 1, Rows: []map[string]any{{"id": 7}}}, nil
	}
	s.cache.set(record.ID, a)
	result := s.searchConnection(ctx, record.ID, findRequest{Value: "7"})
	if result.Status != "partial" || len(result.Matches) != 1 || result.Matches[0].Table != "first" {
		t.Fatalf("cancellation lost accumulated result: %#v", result)
	}
}
