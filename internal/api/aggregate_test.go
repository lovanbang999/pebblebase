package api_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"pebblebase/internal/adapter"

	_ "modernc.org/sqlite"
)

func TestAPIAggregateAndStats(t *testing.T) {
	mux, store := setupTestServer(t)

	// Create a test SQLite database
	dbPath := filepath.Join(t.TempDir(), "analytics.db")
	f, err := os.Create(dbPath)
	if err != nil {
		t.Fatalf("create test db: %v", err)
	}
	f.Close()

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			category TEXT,
			price REAL,
			created_at TEXT
		);
		INSERT INTO products (category, price, created_at) VALUES 
			('electronics', 199.99, '2026-09-01 10:00:00'),
			('electronics', 299.99, '2026-09-01 12:00:00'),
			('clothing', 49.99, '2026-09-02 15:00:00'),
			('books', 15.00, '2026-09-03 09:00:00'),
			('clothing', NULL, '2026-09-03 14:00:00');
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed test db: %v", err)
	}

	// Register connection in store
	rec, err := store.Save("Test Analytics DB", "sqlite", "", "", "", "", dbPath, true)
	if err != nil {
		t.Fatalf("store.Save: %v", err)
	}
	connID := rec.ID

	// 1. Test Distribution Aggregate
	t.Run("Distribution", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/tables/products/aggregate?column=category&function=distribution&limit=10", connID), nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res adapter.AggregateResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal AggregateResult: %v", err)
		}

		if len(res.Labels) != 3 {
			t.Errorf("expected 3 categories, got %d (%v)", len(res.Labels), res.Labels)
		}
	})

	// 2. Test Stats Aggregate
	t.Run("Stats", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/tables/products/aggregate?column=price&function=stats", connID), nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res adapter.AggregateResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal AggregateResult: %v", err)
		}

		if res.Stats["total_rows"] != float64(5) { // JSON unmarshals numbers as float64
			t.Errorf("expected total_rows=5, got %v", res.Stats["total_rows"])
		}
		if res.Stats["null_count"] != float64(1) {
			t.Errorf("expected null_count=1, got %v", res.Stats["null_count"])
		}
	})

	// 3. Test Time-Series Aggregate
	t.Run("TimeSeries", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/tables/products/aggregate?column=created_at&function=timeseries&group_by=day", connID), nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res adapter.AggregateResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal AggregateResult: %v", err)
		}

		if len(res.Labels) != 3 {
			t.Errorf("expected 3 day buckets, got %d (%v)", len(res.Labels), res.Labels)
		}
	})

	// 4. Test Table Stats
	t.Run("TableStats", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/tables/products/stats", connID), nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res adapter.TableStats
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal TableStats: %v", err)
		}

		if res.TotalRows != 5 {
			t.Errorf("expected total_rows=5, got %d", res.TotalRows)
		}
	})

	// 5. Test Missing Column Error
	t.Run("MissingColumn", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/tables/products/aggregate", connID), nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request, got %d", rec.Code)
		}
	})
}
