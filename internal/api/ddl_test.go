package api_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetTableDDL_SQLite(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "ddl_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sku TEXT NOT NULL,
			price REAL DEFAULT 0.0,
			description TEXT
		);
		CREATE UNIQUE INDEX idx_products_sku ON products (sku);
		CREATE INDEX idx_products_price ON products (price);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite schema: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "DDL Test DB",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create connection: %s", rec.Body.String())
	}
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	// 1. Success case: Get DDL for products table
	ddlReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/products/ddl", connResp.ID), nil)
	ddlRec := httptest.NewRecorder()
	mux.ServeHTTP(ddlRec, ddlReq)

	if ddlRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", ddlRec.Code, ddlRec.Body.String())
	}

	var ddlResp struct {
		Table   string `json:"table"`
		Engine  string `json:"engine"`
		DDL     string `json:"ddl"`
		Indexes []struct {
			Name    string   `json:"name"`
			Columns []string `json:"columns"`
			Unique  bool     `json:"unique"`
			Primary bool     `json:"primary"`
		} `json:"indexes"`
	}
	if err := json.NewDecoder(ddlRec.Body).Decode(&ddlResp); err != nil {
		t.Fatalf("decode ddl response: %v", err)
	}

	if ddlResp.Table != "products" {
		t.Errorf("expected table 'products', got %q", ddlResp.Table)
	}
	if ddlResp.Engine != "sqlite" {
		t.Errorf("expected engine 'sqlite', got %q", ddlResp.Engine)
	}
	if !strings.Contains(ddlResp.DDL, "CREATE TABLE products") {
		t.Errorf("expected DDL to contain CREATE TABLE products, got: %s", ddlResp.DDL)
	}
	if !strings.Contains(ddlResp.DDL, "idx_products_sku") {
		t.Errorf("expected DDL to include idx_products_sku, got: %s", ddlResp.DDL)
	}
	if len(ddlResp.Indexes) < 2 {
		t.Errorf("expected at least 2 indexes, got %d", len(ddlResp.Indexes))
	}

	// 2. Error case: Non-existent table
	errReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/non_existent/ddl", connResp.ID), nil)
	errRec := httptest.NewRecorder()
	mux.ServeHTTP(errRec, errReq)
	if errRec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for missing table, got %d", errRec.Code)
	}

	// 3. Error case: Non-existent connection
	missingConnReq := httptest.NewRequest(http.MethodGet, "/api/connections/unknown_id/tables/products/ddl", nil)
	missingConnRec := httptest.NewRecorder()
	mux.ServeHTTP(missingConnRec, missingConnReq)
	if missingConnRec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for missing connection, got %d", missingConnRec.Code)
	}
}
