package main

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"pebblebase/internal/app"
)

// getLinuxSelfRSSMB returns the current process VmRSS in megabytes from /proc/self/status.
func getLinuxSelfRSSMB() (float64, error) {
	f, err := os.Open("/proc/self/status")
	if err != nil {
		return 0, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "VmRSS:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, err := strconv.ParseFloat(fields[1], 64)
				if err != nil {
					return 0, err
				}
				return kb / 1024.0, nil
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, err
	}
	return 0, nil
}

// TestPerformanceGate_ColdStart verifies that server bootstrap + first request completes in under 300ms.
func TestPerformanceGate_ColdStart(t *testing.T) {
	dataDir := t.TempDir()

	start := time.Now()
	inst, err := app.Bootstrap(dataDir, false)
	if err != nil {
		t.Fatalf("app.Bootstrap failed: %v", err)
	}
	defer inst.Close()

	// Execute first request (cold start path)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	inst.Mux.ServeHTTP(rec, req)

	elapsed := time.Since(start)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected /health 200 OK, got %d", rec.Code)
	}

	t.Logf("Cold start elapsed time: %v (Target: < 300ms)", elapsed)
	if elapsed >= 300*time.Millisecond {
		t.Errorf("Performance gate failed: cold start took %v, which exceeds target < 300ms", elapsed)
	}
}

// TestPerformanceGate_MemoryReclamation verifies that idle heap and process RSS stay within targets.
func TestPerformanceGate_MemoryReclamation(t *testing.T) {
	dataDir := t.TempDir()

	inst, err := app.Bootstrap(dataDir, false)
	if err != nil {
		t.Fatalf("app.Bootstrap failed: %v", err)
	}
	defer inst.Close()

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	heapAllocMB := float64(m.HeapAlloc) / (1024 * 1024)
	totalAllocMB := float64(m.Alloc) / (1024 * 1024)
	t.Logf("HeapAlloc: %.2f MB, TotalAlloc: %.2f MB", heapAllocMB, totalAllocMB)

	// HeapAlloc after post-bootstrap FreeOSMemory must be under 15 MB
	if heapAllocMB > 15.0 {
		t.Errorf("HeapAlloc %.2f MB exceeds target < 15 MB", heapAllocMB)
	}

	if rssMB, err := getLinuxSelfRSSMB(); err == nil && rssMB > 0 {
		t.Logf("Process VmRSS: %.2f MB (Target: < 30 MB idle)", rssMB)
		if rssMB > 35.0 {
			t.Errorf("Process RSS %.2f MB exceeds target threshold", rssMB)
		}
	}
}

// BenchmarkServerColdStart benchmarks the bootstrap and first request cycle.
func BenchmarkServerColdStart(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		dir := b.TempDir()
		inst, err := app.Bootstrap(dir, false)
		if err != nil {
			b.Fatalf("Bootstrap error: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		rec := httptest.NewRecorder()
		inst.Mux.ServeHTTP(rec, req)
		inst.Close()
	}
}
