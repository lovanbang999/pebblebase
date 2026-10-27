package api

import (
	"context"
	"sync"
	"testing"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
)

// mockTestAdapter implements adapter.Adapter for cache testing.
type mockTestAdapter struct {
	id      string
	closed  bool
	mu      sync.Mutex
	onClose func()
}

func (m *mockTestAdapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	return nil, nil
}

func (m *mockTestAdapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	return adapter.QueryResult{}, nil
}

func (m *mockTestAdapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	return nil
}

func (m *mockTestAdapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return adapter.RawQueryResult{}, nil
}

func (m *mockTestAdapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
	return adapter.AggregateResult{}, nil
}

func (m *mockTestAdapter) Ping(ctx context.Context) error {
	return nil
}

func (m *mockTestAdapter) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	if m.onClose != nil {
		m.onClose()
	}
	return nil
}

func (m *mockTestAdapter) isClosed() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.closed
}

func TestAdapterCache_BasicGetSetDelete(t *testing.T) {
	cache := newAdapterCache(5, 10*time.Minute)
	defer cache.closeAll()

	adp1 := &mockTestAdapter{id: "conn-1"}
	cache.set("conn-1", adp1)

	got, ok := cache.get("conn-1")
	if !ok || got != adp1 {
		t.Fatalf("expected to get adp1 from cache, got: %v, ok: %v", got, ok)
	}

	cache.delete("conn-1")
	if !adp1.isClosed() {
		t.Fatalf("expected adp1 to be closed after cache.delete")
	}

	got2, ok2 := cache.get("conn-1")
	if ok2 || got2 != nil {
		t.Fatalf("expected nil and false after deletion, got: %v, ok: %v", got2, ok2)
	}
}

func TestAdapterCache_LRUEviction(t *testing.T) {
	// Create cache with capacity 2
	cache := newAdapterCache(2, 10*time.Minute)
	defer cache.closeAll()

	adp1 := &mockTestAdapter{id: "conn-1"}
	adp2 := &mockTestAdapter{id: "conn-2"}
	adp3 := &mockTestAdapter{id: "conn-3"}

	cache.set("conn-1", adp1)
	time.Sleep(10 * time.Millisecond)
	cache.set("conn-2", adp2)
	time.Sleep(10 * time.Millisecond)

	// Access conn-1 so conn-2 becomes the least recently used
	if _, ok := cache.get("conn-1"); !ok {
		t.Fatalf("failed to get conn-1")
	}
	time.Sleep(10 * time.Millisecond)

	// Insert conn-3 -> should evict conn-2
	cache.set("conn-3", adp3)

	if !adp2.isClosed() {
		t.Fatalf("expected conn-2 to be closed on LRU eviction")
	}
	if adp1.isClosed() {
		t.Fatalf("expected conn-1 to remain alive")
	}
	if adp3.isClosed() {
		t.Fatalf("expected conn-3 to remain alive")
	}

	if _, ok := cache.get("conn-2"); ok {
		t.Fatalf("expected conn-2 to be evicted from cache")
	}
	if _, ok := cache.get("conn-1"); !ok {
		t.Fatalf("expected conn-1 to still be in cache")
	}
	if _, ok := cache.get("conn-3"); !ok {
		t.Fatalf("expected conn-3 to still be in cache")
	}
}

func TestAdapterCache_TTLExpiration(t *testing.T) {
	// Create cache with 50ms TTL
	cache := newAdapterCache(5, 50*time.Millisecond)
	defer cache.closeAll()

	adp := &mockTestAdapter{id: "conn-short"}
	cache.set("conn-short", adp)

	// Immediate get succeeds
	if got, ok := cache.get("conn-short"); !ok || got == nil {
		t.Fatalf("expected immediate get to succeed")
	}

	// Wait for TTL to elapse
	time.Sleep(70 * time.Millisecond)

	// Get should detect expiration, close adapter, and return false
	gotAfter, okAfter := cache.get("conn-short")
	if okAfter || gotAfter != nil {
		t.Fatalf("expected expired entry to be purged, got: %v, ok: %v", gotAfter, okAfter)
	}
	if !adp.isClosed() {
		t.Fatalf("expected adapter to be closed after TTL expiration")
	}
}

func TestAdapterCache_ReapExpired(t *testing.T) {
	cache := newAdapterCache(5, 40*time.Millisecond)
	defer cache.closeAll()

	adp := &mockTestAdapter{id: "conn-reap"}
	cache.set("conn-reap", adp)

	time.Sleep(60 * time.Millisecond)
	cache.reapExpired()

	if !adp.isClosed() {
		t.Fatalf("expected adapter to be closed by reapExpired")
	}

	cache.mu.Lock()
	count := len(cache.entries)
	cache.mu.Unlock()

	if count != 0 {
		t.Fatalf("expected entries to be empty after reapExpired, got count=%d", count)
	}
}

func TestAdapterCache_CloseAll(t *testing.T) {
	cache := newAdapterCache(5, 10*time.Minute)

	adp1 := &mockTestAdapter{id: "conn-1"}
	adp2 := &mockTestAdapter{id: "conn-2"}

	cache.set("conn-1", adp1)
	cache.set("conn-2", adp2)

	cache.closeAll()

	if !adp1.isClosed() {
		t.Fatalf("expected adp1 to be closed on closeAll")
	}
	if !adp2.isClosed() {
		t.Fatalf("expected adp2 to be closed on closeAll")
	}

	cache.mu.Lock()
	count := len(cache.entries)
	cache.mu.Unlock()

	if count != 0 {
		t.Fatalf("expected cache entries to be cleared after closeAll, got count=%d", count)
	}
}

func TestAdapterCache_ConcurrentAccess(t *testing.T) {
	cache := newAdapterCache(10, 100*time.Millisecond)
	defer cache.closeAll()

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			id := "conn-concurrent"
			adp := &mockTestAdapter{id: id}
			cache.set(id, adp)
			_, _ = cache.get(id)
			if idx%3 == 0 {
				cache.delete(id)
			}
		}(i)
	}
	wg.Wait()
}
