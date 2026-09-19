package api_test

import (
	"bufio"
	"bytes"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/parquet-go/parquet-go"
	"github.com/xuri/excelize/v2"
)

func TestExport_CSV_Streaming(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "export_csv_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, age INTEGER, salary REAL);
		INSERT INTO users (name, age, salary) VALUES ('Alice', 30, 85000.50), ('Bob', 25, 62000.00), ('Charlie', 35, 98000.75);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Export CSV Conn",
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

	// 1. Export all rows as CSV
	exportReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/export?format=csv", connResp.ID), nil)
	exportRec := httptest.NewRecorder()
	mux.ServeHTTP(exportRec, exportReq)

	if exportRec.Code != http.StatusOK {
		t.Fatalf("export csv failed with status %d: %s", exportRec.Code, exportRec.Body.String())
	}
	if ct := exportRec.Header().Get("Content-Type"); !strings.Contains(ct, "text/csv") {
		t.Errorf("expected Content-Type text/csv, got %q", ct)
	}
	if cd := exportRec.Header().Get("Content-Disposition"); !strings.Contains(cd, "users.csv") {
		t.Errorf("expected Content-Disposition with users.csv, got %q", cd)
	}

	csvReader := csv.NewReader(exportRec.Body)
	records, err := csvReader.ReadAll()
	if err != nil {
		t.Fatalf("parse exported csv: %v", err)
	}
	if len(records) != 4 { // 1 header + 3 data rows
		t.Fatalf("expected 4 csv rows (1 header + 3 data), got %d", len(records))
	}
	expectedHeaders := []string{"id", "name", "age", "salary"}
	for i, h := range expectedHeaders {
		if records[0][i] != h {
			t.Errorf("header col %d: expected %q, got %q", i, h, records[0][i])
		}
	}

	// 2. Export with filter (Alice only)
	filterReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/export?format=csv&filter=name:eq:Alice", connResp.ID), nil)
	filterRec := httptest.NewRecorder()
	mux.ServeHTTP(filterRec, filterReq)

	if filterRec.Code != http.StatusOK {
		t.Fatalf("export filtered csv failed with status %d: %s", filterRec.Code, filterRec.Body.String())
	}
	records, err = csv.NewReader(filterRec.Body).ReadAll()
	if err != nil {
		t.Fatalf("parse filtered csv: %v", err)
	}
	if len(records) != 2 { // 1 header + 1 data row
		t.Fatalf("expected 2 csv rows (1 header + 1 data row for Alice), got %d", len(records))
	}
	if records[1][1] != "Alice" {
		t.Errorf("expected filtered row name Alice, got %q", records[1][1])
	}
}

func TestExport_JSON_Streaming(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "export_json_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, price REAL);
		INSERT INTO items (title, price) VALUES ('Book', 15.50), ('Pen', 2.00);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Export JSON Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	exportReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/items/export?format=json", connResp.ID), nil)
	exportRec := httptest.NewRecorder()
	mux.ServeHTTP(exportRec, exportReq)

	if exportRec.Code != http.StatusOK {
		t.Fatalf("export json failed with status %d: %s", exportRec.Code, exportRec.Body.String())
	}
	if ct := exportRec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}

	var items []map[string]any
	if err := json.NewDecoder(exportRec.Body).Decode(&items); err != nil {
		t.Fatalf("decode exported json: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0]["title"] != "Book" {
		t.Errorf("expected item 0 title 'Book', got %v", items[0]["title"])
	}
}

func TestExport_JSONL_Streaming(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "export_jsonl_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, price REAL);
		INSERT INTO items (title, price) VALUES ('Book', 15.50), ('Pen', 2.00);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Export JSONL Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	exportReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/items/export?format=jsonl", connResp.ID), nil)
	exportRec := httptest.NewRecorder()
	mux.ServeHTTP(exportRec, exportReq)

	if exportRec.Code != http.StatusOK {
		t.Fatalf("export jsonl failed with status %d: %s", exportRec.Code, exportRec.Body.String())
	}
	if ct := exportRec.Header().Get("Content-Type"); !strings.Contains(ct, "application/x-ndjson") {
		t.Errorf("expected Content-Type application/x-ndjson, got %q", ct)
	}
	if cd := exportRec.Header().Get("Content-Disposition"); !strings.Contains(cd, "items.jsonl") {
		t.Errorf("expected Content-Disposition with items.jsonl, got %q", cd)
	}

	scanner := bufio.NewScanner(exportRec.Body)
	var lines []string
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			lines = append(lines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan jsonl: %v", err)
	}
	if len(lines) != 2 {
		t.Fatalf("expected 2 jsonl lines, got %d", len(lines))
	}

	var firstRow map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &firstRow); err != nil {
		t.Fatalf("parse first jsonl line: %v", err)
	}
	if firstRow["title"] != "Book" {
		t.Errorf("expected first line title 'Book', got %v", firstRow["title"])
	}
}

func TestExport_Excel_Streaming(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "export_excel_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, active BOOLEAN);
		INSERT INTO products (name, price, active) VALUES ('Keyboard', 89.99, 1), ('Mouse', 24.50, 0);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Export Excel Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	exportReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/products/export?format=xlsx", connResp.ID), nil)
	exportRec := httptest.NewRecorder()
	mux.ServeHTTP(exportRec, exportReq)

	if exportRec.Code != http.StatusOK {
		t.Fatalf("export excel failed with status %d: %s", exportRec.Code, exportRec.Body.String())
	}
	if ct := exportRec.Header().Get("Content-Type"); !strings.Contains(ct, "spreadsheetml.sheet") {
		t.Errorf("expected Content-Type spreadsheetml.sheet, got %q", ct)
	}
	if cd := exportRec.Header().Get("Content-Disposition"); !strings.Contains(cd, "products.xlsx") {
		t.Errorf("expected Content-Disposition with products.xlsx, got %q", cd)
	}

	// Verify using excelize.OpenReader
	excelFile, err := excelize.OpenReader(bytes.NewReader(exportRec.Body.Bytes()))
	if err != nil {
		t.Fatalf("open exported excel: %v", err)
	}
	defer excelFile.Close()

	rows, err := excelFile.GetRows("Sheet1")
	if err != nil {
		t.Fatalf("get rows from Sheet1: %v", err)
	}
	if len(rows) != 3 { // 1 header + 2 data rows
		t.Fatalf("expected 3 excel rows (1 header + 2 data), got %d", len(rows))
	}
	expectedHeaders := []string{"id", "name", "price", "active"}
	for i, h := range expectedHeaders {
		if rows[0][i] != h {
			t.Errorf("col %d header: expected %q, got %q", i, h, rows[0][i])
		}
	}
	if rows[1][1] != "Keyboard" {
		t.Errorf("expected row 1 name 'Keyboard', got %q", rows[1][1])
	}
}

func TestExport_Parquet_Streaming(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "export_parquet_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT);
		INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com');
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Export Parquet Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	exportReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/export?format=parquet", connResp.ID), nil)
	exportRec := httptest.NewRecorder()
	mux.ServeHTTP(exportRec, exportReq)

	if exportRec.Code != http.StatusOK {
		t.Fatalf("export parquet failed with status %d: %s", exportRec.Code, exportRec.Body.String())
	}
	if ct := exportRec.Header().Get("Content-Type"); !strings.Contains(ct, "parquet") {
		t.Errorf("expected Content-Type parquet, got %q", ct)
	}
	if cd := exportRec.Header().Get("Content-Disposition"); !strings.Contains(cd, "users.parquet") {
		t.Errorf("expected Content-Disposition with users.parquet, got %q", cd)
	}

	// Verify using parquet.NewReader
	pReader := parquet.NewReader(bytes.NewReader(exportRec.Body.Bytes()))
	if pReader.NumRows() != 2 {
		t.Fatalf("expected 2 parquet rows, got %d", pReader.NumRows())
	}
}

func TestExport_UnsupportedFormat(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "export_unsupported_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`CREATE TABLE t (id INTEGER PRIMARY KEY);`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Export Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	exportReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/t/export?format=unknown_fmt", connResp.ID), nil)
	exportRec := httptest.NewRecorder()
	mux.ServeHTTP(exportRec, exportReq)

	if exportRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unsupported format, got %d: %s", exportRec.Code, exportRec.Body.String())
	}
	if !strings.Contains(exportRec.Body.String(), "unsupported export format") {
		t.Errorf("expected unsupported export format error message, got %s", exportRec.Body.String())
	}
}

func TestImport_CSV_SuccessAndTypeCasting(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "import_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			price REAL,
			in_stock BOOLEAN,
			notes TEXT
		);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Import Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	// CSV with 3 rows, including booleans, floats, and empty nullable values
	csvData := "title,price,in_stock,notes\n" +
		"Keyboard,79.99,true,Mechanical\n" +
		"Mouse,29.50,1,\n" +
		"Monitor,199.00,false,4K Ultra HD\n"

	var formBuf bytes.Buffer
	mw := multipart.NewWriter(&formBuf)
	part, err := mw.CreateFormFile("file", "products.csv")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	_, _ = io.WriteString(part, csvData)
	mw.Close()

	importReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/products/import", connResp.ID), &formBuf)
	importReq.Header.Set("Content-Type", mw.FormDataContentType())
	importRec := httptest.NewRecorder()
	mux.ServeHTTP(importRec, importReq)

	if importRec.Code != http.StatusOK {
		t.Fatalf("import csv failed with status %d: %s", importRec.Code, importRec.Body.String())
	}

	var importResp struct {
		InsertedCount int64   `json:"inserted_count"`
		DurationMs    float64 `json:"duration_ms"`
	}
	_ = json.NewDecoder(importRec.Body).Decode(&importResp)
	if importResp.InsertedCount != 3 {
		t.Fatalf("expected inserted_count 3, got %d", importResp.InsertedCount)
	}

	// Verify database rows
	db, _ = sql.Open("sqlite", dbFile)
	defer db.Close()
	var count int
	_ = db.QueryRow("SELECT COUNT(*) FROM products").Scan(&count)
	if count != 3 {
		t.Fatalf("expected 3 rows in database, got %d", count)
	}
}

func TestImport_CSV_WithCustomMappings(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "import_map_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE staff (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			full_name TEXT NOT NULL,
			hourly_rate REAL
		);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Import Mappings Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	// CSV headers do not match table columns directly
	csvData := "worker_name,pay_rate,internal_id\n" +
		"David,35.50,X101\n" +
		"Emma,42.00,X102\n"

	mappingsJSON := `{"worker_name": "full_name", "pay_rate": "hourly_rate", "internal_id": "-"}`

	var formBuf bytes.Buffer
	mw := multipart.NewWriter(&formBuf)
	_ = mw.WriteField("mappings", mappingsJSON)
	part, _ := mw.CreateFormFile("file", "staff.csv")
	_, _ = io.WriteString(part, csvData)
	mw.Close()

	importReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/staff/import", connResp.ID), &formBuf)
	importReq.Header.Set("Content-Type", mw.FormDataContentType())
	importRec := httptest.NewRecorder()
	mux.ServeHTTP(importRec, importReq)

	if importRec.Code != http.StatusOK {
		t.Fatalf("import with mappings failed with status %d: %s", importRec.Code, importRec.Body.String())
	}

	var importResp struct {
		InsertedCount int64 `json:"inserted_count"`
	}
	_ = json.NewDecoder(importRec.Body).Decode(&importResp)
	if importResp.InsertedCount != 2 {
		t.Fatalf("expected 2 inserted rows, got %d", importResp.InsertedCount)
	}

	db, _ = sql.Open("sqlite", dbFile)
	defer db.Close()
	var fullName string
	var rate float64
	err = db.QueryRow("SELECT full_name, hourly_rate FROM staff WHERE full_name = 'David'").Scan(&fullName, &rate)
	if err != nil {
		t.Fatalf("query staff: %v", err)
	}
	if fullName != "David" || rate != 35.50 {
		t.Errorf("unexpected staff row: %s, %f", fullName, rate)
	}
}

func TestImport_CSV_ReadOnlyForbidden(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "readonly_import_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT);`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	// Register with read_only: true
	body, _ := json.Marshal(map[string]any{
		"name":          "Read Only SQLite",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
		"read_only":     true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	var formBuf bytes.Buffer
	mw := multipart.NewWriter(&formBuf)
	part, _ := mw.CreateFormFile("file", "logs.csv")
	_, _ = io.WriteString(part, "message\nlog line 1\n")
	mw.Close()

	importReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/logs/import", connResp.ID), &formBuf)
	importReq.Header.Set("Content-Type", mw.FormDataContentType())
	importRec := httptest.NewRecorder()
	mux.ServeHTTP(importRec, importReq)

	if importRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for read-only import, got %d: %s", importRec.Code, importRec.Body.String())
	}
}

func TestImport_CSV_AtomicRollback(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "rollback_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE codes (code TEXT PRIMARY KEY, value INTEGER);
		INSERT INTO codes (code, value) VALUES ('EXISTING', 100);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"name":          "Rollback Conn",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var connResp struct{ ID string `json:"id"` }
	_ = json.NewDecoder(rec.Body).Decode(&connResp)

	// CSV has 'EXISTING' which violates primary key uniqueness
	csvData := "code,value\n" +
		"NEW1,10\n" +
		"EXISTING,999\n" +
		"NEW2,20\n"

	var formBuf bytes.Buffer
	mw := multipart.NewWriter(&formBuf)
	part, _ := mw.CreateFormFile("file", "codes.csv")
	_, _ = io.WriteString(part, csvData)
	mw.Close()

	importReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/codes/import", connResp.ID), &formBuf)
	importReq.Header.Set("Content-Type", mw.FormDataContentType())
	importRec := httptest.NewRecorder()
	mux.ServeHTTP(importRec, importReq)

	if importRec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 error on duplicate key violation, got %d: %s", importRec.Code, importRec.Body.String())
	}

	// Verify atomic rollback: NEW1 must NOT exist in the database!
	db, _ = sql.Open("sqlite", dbFile)
	defer db.Close()
	var count int
	_ = db.QueryRow("SELECT COUNT(*) FROM codes").Scan(&count)
	if count != 1 {
		t.Fatalf("atomic rollback failed: expected exactly 1 initial row, got %d", count)
	}
}
