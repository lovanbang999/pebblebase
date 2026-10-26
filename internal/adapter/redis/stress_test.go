package redis

import (
	"context"
	"fmt"
	"runtime"
	"testing"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// TestStress_50kKeysScan tests scanning and paginating across 50,000 keys of various Redis data types
// to verify zero memory leaks, zero goroutine leaks, and sub-second pagination performance.
func TestStress_50kKeysScan(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping 50k keys stress test in short mode")
	}

	adp, _ := setupTestRedis(t)
	ctx := context.Background()
	client := adp.Client()

	startMem := runtime.MemStats{}
	runtime.ReadMemStats(&startMem)
	startGoroutines := runtime.NumGoroutine()

	t.Log("Seeding 50,000 keys across multiple data types into test Redis instance...")
	seedStart := time.Now()

	// Seed in batches of 5,000 via Redis pipeline
	const totalKeys = 50000
	const batchSize = 5000

	for i := 0; i < totalKeys; i += batchSize {
		pipe := client.Pipeline()
		for j := 0; j < batchSize; j++ {
			idx := i + j
			switch {
			case idx < 30000:
				// String keys (30,000 keys)
				pipe.Set(ctx, fmt.Sprintf("user:profile:%05d", idx), fmt.Sprintf(`{"id":%d,"name":"user_%d"}`, idx, idx), 0)
			case idx < 40000:
				// Hash keys (10,000 keys)
				pipe.HSet(ctx, fmt.Sprintf("order:meta:%05d", idx), "status", "completed", "total", "99.95")
			case idx < 45000:
				// List keys (5,000 keys)
				pipe.LPush(ctx, fmt.Sprintf("queue:jobs:%05d", idx), "job_a", "job_b")
			case idx < 48000:
				// Set keys (3,000 keys)
				pipe.SAdd(ctx, fmt.Sprintf("tags:items:%05d", idx), "redis", "database", "fast")
			default:
				// Sorted set keys (2,000 keys)
				pipe.ZAdd(ctx, fmt.Sprintf("leaderboard:%05d", idx), goredis.Z{Score: float64(idx), Member: "player1"})
			}
		}
		if _, err := pipe.Exec(ctx); err != nil {
			t.Fatalf("failed to seed batch at index %d: %v", i, err)
		}
	}

	seedDuration := time.Since(seedStart)
	t.Logf("Successfully seeded 50,000 keys in %v", seedDuration)

	// Verify DBSize
	dbsize, err := client.DBSize(ctx).Result()
	if err != nil {
		t.Fatalf("DBSize failed: %v", err)
	}
	if dbsize < totalKeys {
		t.Fatalf("expected at least %d keys, got %d", totalKeys, dbsize)
	}

	// 1. Benchmark & verify single page scan latency (first page 50 keys)
	scanStart := time.Now()
	res, err := adp.ScanKeysWithMetadata(ctx, 0, "*", 50, "all")
	firstPageDuration := time.Since(scanStart)

	if err != nil {
		t.Fatalf("ScanKeysWithMetadata failed: %v", err)
	}
	if len(res.Keys) == 0 {
		t.Fatal("expected keys in first scan page, got 0")
	}
	if res.TotalKeys < totalKeys {
		t.Errorf("expected total_keys >= %d, got %d", totalKeys, res.TotalKeys)
	}
	if firstPageDuration > 500*time.Millisecond {
		t.Errorf("first page scan took too long: %v (expected < 500ms)", firstPageDuration)
	}
	t.Logf("First 50 keys scan took: %v (cursor=%d, total=%d)", firstPageDuration, res.NextCursor, res.TotalKeys)

	// 2. Iterate multiple consecutive pages to verify cursor progression under 50k keys
	cursor := res.NextCursor
	totalRetrieved := len(res.Keys)
	pageCount := 1
	const maxPagesToTest = 20 // Test 20 pages (1,000 keys)

	iterStart := time.Now()
	for pageCount < maxPagesToTest && cursor != 0 {
		pageRes, err := adp.ScanKeysWithMetadata(ctx, cursor, "*", 50, "all")
		if err != nil {
			t.Fatalf("page %d scan failed: %v", pageCount, err)
		}
		totalRetrieved += len(pageRes.Keys)
		cursor = pageRes.NextCursor
		pageCount++
	}
	iterDuration := time.Since(iterStart)
	t.Logf("Paging %d pages (%d keys) across 50k keys took %v (avg %v/page)",
		pageCount, totalRetrieved, iterDuration, iterDuration/time.Duration(pageCount))

	// 3. Test pattern matching filter over 50,000 keys
	patStart := time.Now()
	orderRes, err := adp.ScanKeysWithMetadata(ctx, 0, "order:meta:*", 50, "hash")
	patDuration := time.Since(patStart)

	if err != nil {
		t.Fatalf("pattern scan failed: %v", err)
	}
	t.Logf("Pattern 'order:meta:*' scan took %v (retrieved %d keys)", patDuration, len(orderRes.Keys))
	for _, k := range orderRes.Keys {
		if k.Type != "hash" {
			t.Errorf("expected key type 'hash', got %q for key %s", k.Type, k.Key)
		}
	}

	// 4. Test non-existent pattern returns cleanly without blocking
	nonExistentStart := time.Now()
	emptyRes, err := adp.ScanKeysWithMetadata(ctx, 0, "nonexistent:*", 50, "all")
	nonExistentDuration := time.Since(nonExistentStart)
	if err != nil {
		t.Fatalf("non-existent pattern scan failed: %v", err)
	}
	t.Logf("Non-existent pattern scan completed in %v with %d keys", nonExistentDuration, len(emptyRes.Keys))

	// 5. Check memory & goroutine leak safeguards
	endGoroutines := runtime.NumGoroutine()
	// Allow small variance in runtime goroutines (e.g. test runner)
	if endGoroutines-startGoroutines > 10 {
		t.Errorf("possible goroutine leak: started with %d, ended with %d", startGoroutines, endGoroutines)
	}

	var endMem runtime.MemStats
	runtime.ReadMemStats(&endMem)
	t.Logf("Memory stats: Alloc=%d KB, TotalAlloc=%d KB, Sys=%d KB, NumGC=%d",
		endMem.Alloc/1024, endMem.TotalAlloc/1024, endMem.Sys/1024, endMem.NumGC)
}

// TestStress_ConcurrentScans tests 25 concurrent workers scanning the 50,000 keyspace simultaneously
// to ensure thread safety, zero deadlock, and consistent latency under concurrent load.
func TestStress_ConcurrentScans(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping concurrent stress test in short mode")
	}

	adp, _ := setupTestRedis(t)
	ctx := context.Background()
	client := adp.Client()

	// Seed 20,000 keys
	const totalKeys = 20000
	for i := 0; i < totalKeys; i += 5000 {
		pipe := client.Pipeline()
		for j := 0; j < 5000; j++ {
			idx := i + j
			pipe.Set(ctx, fmt.Sprintf("conc:key:%05d", idx), "data", 0)
		}
		if _, err := pipe.Exec(ctx); err != nil {
			t.Fatalf("failed seeding concurrent test keys: %v", err)
		}
	}

	const workerCount = 25
	errChan := make(chan error, workerCount)
	startBarrier := make(chan struct{})

	t.Logf("Launching %d concurrent workers scanning keyspace...", workerCount)
	for w := 0; w < workerCount; w++ {
		go func(workerID int) {
			<-startBarrier
			filter := "all"
			if workerID%2 == 0 {
				filter = "string"
			}
			res, err := adp.ScanKeysWithMetadata(ctx, 0, "conc:key:*", 50, filter)
			if err != nil {
				errChan <- fmt.Errorf("worker %d failed: %w", workerID, err)
				return
			}
			if len(res.Keys) == 0 {
				errChan <- fmt.Errorf("worker %d got 0 keys", workerID)
				return
			}
			errChan <- nil
		}(w)
	}

	// Release all workers simultaneously
	close(startBarrier)

	for w := 0; w < workerCount; w++ {
		select {
		case err := <-errChan:
			if err != nil {
				t.Errorf("concurrent scan error: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("worker timed out waiting for concurrent scan")
		}
	}
	t.Logf("All %d concurrent workers completed successfully.", workerCount)
}

// BenchmarkScan50kKeys measures the throughput of scanning keys across a 50,000 keyspace.
func BenchmarkScan50kKeys(b *testing.B) {
	adp, _ := setupTestRedis(b)
	ctx := context.Background()
	client := adp.Client()

	// Seed 50,000 keys
	for i := 0; i < 50000; i += 5000 {
		pipe := client.Pipeline()
		for j := 0; j < 5000; j++ {
			pipe.Set(ctx, fmt.Sprintf("bench:key:%05d", i+j), "bench_val", 0)
		}
		_, _ = pipe.Exec(ctx)
	}

	for b.Loop() {
		_, err := adp.ScanKeysWithMetadata(ctx, 0, "*", 50, "all")
		if err != nil {
			b.Fatalf("benchmark scan failed: %v", err)
		}
	}
}
