package api_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	mongoadapter "pebblebase/internal/adapter/mongodb"
	mysqladapter "pebblebase/internal/adapter/mysql"
	pgadapter "pebblebase/internal/adapter/postgres"
	"pebblebase/internal/api"
	"pebblebase/internal/storage"

	_ "modernc.org/sqlite"
)

func setupTestServer(t *testing.T) (*http.ServeMux, *storage.Store) {
	t.Helper()
	dir := t.TempDir()

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}

	enc, err := storage.NewEncryptor(key)
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}

	store, err := storage.NewStore(dir, enc)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"OK"}`))
	})

	srv := api.NewServer(store, enc, nil, nil, false)
	srv.RegisterRoutes(mux)

	return mux, store
}

func testMySQLDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("PEBBLEBASE_TEST_MYSQL_DSN")
	if dsn == "" {
		dsn = "pebble:pebble@tcp(localhost:3306)/pebble_test?parseTime=true"
	}
	ctx := context.Background()
	a, err := mysqladapter.New(ctx, dsn)
	if err != nil {
		t.Skipf("MySQL DB not reachable (%v) — skipping integration test", err)
	}
	a.Close()
	return dsn
}

func testPostgresDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("PEBBLEBASE_TEST_DSN")
	if dsn == "" {
		dsn = "postgres://pebble:pebble@localhost:5432/pebble_test?sslmode=disable"
	}
	ctx := context.Background()
	a, err := pgadapter.New(ctx, dsn)
	if err != nil {
		t.Skipf("Postgres DB not reachable (%v) — skipping integration test", err)
	}
	a.Close()
	return dsn
}

func TestHealth(t *testing.T) {
	mux, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body["status"] != "OK" {
		t.Fatalf("expected status OK, got %q", body["status"])
	}
}

func TestConnection_Validation(t *testing.T) {
	mux, _ := setupTestServer(t)

	t.Run("invalid json body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader([]byte("invalid json")))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("missing type / invalid DSN input", func(t *testing.T) {
		payload := map[string]any{
			"name": "Broken",
			"type": "",
		}
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(b))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("unreachable db host", func(t *testing.T) {
		payload := map[string]any{
			"name":          "Unreachable",
			"type":          "postgres",
			"mode":          "form",
			"host":          "127.0.0.1",
			"port":          "54399",
			"user":          "nobody",
			"password":      "secret",
			"db_name":       "test",
			"save_password": true,
		}
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(b))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadGateway {
			t.Fatalf("expected 502, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestConnection_NoPasswordLeak(t *testing.T) {
	dsn := testPostgresDSN(t)
	mux, _ := setupTestServer(t)

	// Create connection using raw URL
	payload := map[string]any{
		"name":          "Prod DB",
		"type":          "postgres",
		"mode":          "url",
		"raw_url":       dsn,
		"save_password": true,
	}
	b, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(b))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var created map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("unmarshal created: %v", err)
	}

	if _, exists := created["encrypted_dsn"]; exists {
		t.Errorf("SECURITY: encrypted_dsn leaked in POST /api/connections response")
	}
	if _, exists := created["password"]; exists {
		t.Errorf("SECURITY: password leaked in POST /api/connections response")
	}

	// List connections
	reqList := httptest.NewRequest(http.MethodGet, "/api/connections", nil)
	recList := httptest.NewRecorder()
	mux.ServeHTTP(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recList.Code)
	}

	var list []map[string]any
	if err := json.Unmarshal(recList.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 connection, got %d", len(list))
	}
	if _, exists := list[0]["encrypted_dsn"]; exists {
		t.Errorf("SECURITY: encrypted_dsn leaked in GET /api/connections response")
	}
	if _, exists := list[0]["password"]; exists {
		t.Errorf("SECURITY: password leaked in GET /api/connections response")
	}
}

func TestEndToEndCRUD_Postgres(t *testing.T) {
	_ = testPostgresDSN(t)
	mux, _ := setupTestServer(t)

	// 1. Create connection using Form mode
	createPayload := map[string]any{
		"name":          "Local Postgres",
		"type":          "postgres",
		"mode":          "form",
		"host":          "localhost",
		"port":          "5432",
		"user":          "pebble",
		"password":      "pebble",
		"db_name":       "pebble_test",
		"save_password": true,
	}
	b, _ := json.Marshal(createPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(b))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("create connection failed: status %d: %s", rec.Code, rec.Body.String())
	}

	var connResp struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &connResp); err != nil {
		t.Fatalf("unmarshal conn: %v", err)
	}
	connID := connResp.ID
	if connID == "" {
		t.Fatal("empty connection ID")
	}

	// 2. Ping connection
	reqPing := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/ping", connID), nil)
	recPing := httptest.NewRecorder()
	mux.ServeHTTP(recPing, reqPing)
	if recPing.Code != http.StatusOK {
		t.Fatalf("ping failed: status %d: %s", recPing.Code, recPing.Body.String())
	}

	// 3. Introspect tables
	reqTables := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables", connID), nil)
	recTables := httptest.NewRecorder()
	mux.ServeHTTP(recTables, reqTables)
	if recTables.Code != http.StatusOK {
		t.Fatalf("list tables failed: status %d: %s", recTables.Code, recTables.Body.String())
	}

	var tables []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(recTables.Body.Bytes(), &tables); err != nil {
		t.Fatalf("unmarshal tables: %v", err)
	}
	foundUsers := false
	for _, tbl := range tables {
		if tbl.Name == "users" {
			foundUsers = true
			break
		}
	}
	if !foundUsers {
		t.Fatalf("expected 'users' table in tables list: %v", tables)
	}

	// 4. Query rows with pagination and sort
	reqRows := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/rows?limit=2&sort_by=id&sort_desc=false", connID), nil)
	recRows := httptest.NewRecorder()
	mux.ServeHTTP(recRows, reqRows)
	if recRows.Code != http.StatusOK {
		t.Fatalf("query rows failed: status %d: %s", recRows.Code, recRows.Body.String())
	}

	var result struct {
		Rows       []map[string]any `json:"rows"`
		TotalCount int64            `json:"total_count"`
	}
	if err := json.Unmarshal(recRows.Body.Bytes(), &result); err != nil {
		t.Fatalf("unmarshal rows: %v", err)
	}
	if len(result.Rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(result.Rows))
	}
	if result.TotalCount < 2 {
		t.Fatalf("expected total count >= 2, got %d", result.TotalCount)
	}

	// 5. Insert new row
	testEmail := "integration_test@example.com"
	insertPayload := map[string]any{
		"values": map[string]any{
			"name":  "Integration Test",
			"email": testEmail,
		},
	}
	bInsert, _ := json.Marshal(insertPayload)
	reqInsert := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/users/rows", connID), bytes.NewReader(bInsert))
	recInsert := httptest.NewRecorder()
	mux.ServeHTTP(recInsert, reqInsert)
	if recInsert.Code != http.StatusCreated {
		t.Fatalf("insert row failed: status %d: %s", recInsert.Code, recInsert.Body.String())
	}

	// 6. Query to confirm insert & test filter
	reqFilter := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/rows?filter=email:eq:%s", connID, testEmail), nil)
	recFilter := httptest.NewRecorder()
	mux.ServeHTTP(recFilter, reqFilter)
	if recFilter.Code != http.StatusOK {
		t.Fatalf("query filter failed: status %d: %s", recFilter.Code, recFilter.Body.String())
	}

	var filterResult struct {
		Rows       []map[string]any `json:"rows"`
		TotalCount int64            `json:"total_count"`
	}
	if err := json.Unmarshal(recFilter.Body.Bytes(), &filterResult); err != nil {
		t.Fatalf("unmarshal filter result: %v", err)
	}
	if len(filterResult.Rows) != 1 {
		t.Fatalf("expected 1 row matching filter, got %d", len(filterResult.Rows))
	}
	if filterResult.Rows[0]["name"] != "Integration Test" {
		t.Fatalf("expected name 'Integration Test', got %v", filterResult.Rows[0]["name"])
	}

	// 7. Update row
	updatePayload := map[string]any{
		"where":  map[string]any{"email": testEmail},
		"values": map[string]any{"name": "Integration Test Updated"},
	}
	bUpdate, _ := json.Marshal(updatePayload)
	reqUpdate := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/connections/%s/tables/users/rows", connID), bytes.NewReader(bUpdate))
	recUpdate := httptest.NewRecorder()
	mux.ServeHTTP(recUpdate, reqUpdate)
	if recUpdate.Code != http.StatusNoContent {
		t.Fatalf("update row failed: status %d: %s", recUpdate.Code, recUpdate.Body.String())
	}

	// 8. Delete row
	deletePayload := map[string]any{
		"where": map[string]any{"email": testEmail},
	}
	bDelete, _ := json.Marshal(deletePayload)
	reqDelete := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s/tables/users/rows", connID), bytes.NewReader(bDelete))
	recDelete := httptest.NewRecorder()
	mux.ServeHTTP(recDelete, reqDelete)
	if recDelete.Code != http.StatusNoContent {
		t.Fatalf("delete row failed: status %d: %s", recDelete.Code, recDelete.Body.String())
	}

	// Verify row is gone
	reqVerifyDel := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/rows?filter=email:eq:%s", connID, testEmail), nil)
	recVerifyDel := httptest.NewRecorder()
	mux.ServeHTTP(recVerifyDel, reqVerifyDel)
	var verifyResult struct {
		Rows []map[string]any `json:"rows"`
	}
	_ = json.Unmarshal(recVerifyDel.Body.Bytes(), &verifyResult)
	if len(verifyResult.Rows) != 0 {
		t.Fatalf("expected 0 rows after delete, got %d", len(verifyResult.Rows))
	}

	// 9. Delete connection
	reqDelConn := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s", connID), nil)
	recDelConn := httptest.NewRecorder()
	mux.ServeHTTP(recDelConn, reqDelConn)
	if recDelConn.Code != http.StatusNoContent {
		t.Fatalf("delete connection failed: status %d: %s", recDelConn.Code, recDelConn.Body.String())
	}
}

func TestEndToEndCRUD_MySQL(t *testing.T) {
	_ = testMySQLDSN(t)
	mux, _ := setupTestServer(t)

	// 1. Test connection endpoint first
	testConnPayload := map[string]any{
		"name":     "MySQL Local",
		"type":     "mysql",
		"mode":     "form",
		"host":     "localhost",
		"port":     "3306",
		"user":     "pebble",
		"password": "pebble",
		"db_name":  "pebble_test",
	}
	bTest, _ := json.Marshal(testConnPayload)
	reqTest := httptest.NewRequest(http.MethodPost, "/api/connections/test", bytes.NewReader(bTest))
	recTest := httptest.NewRecorder()
	mux.ServeHTTP(recTest, reqTest)
	if recTest.Code != http.StatusOK {
		t.Fatalf("test connection failed: status %d: %s", recTest.Code, recTest.Body.String())
	}

	// 2. Create connection
	createPayload := map[string]any{
		"name":          "MySQL Local",
		"type":          "mysql",
		"mode":          "form",
		"host":          "localhost",
		"port":          "3306",
		"user":          "pebble",
		"password":      "pebble",
		"db_name":       "pebble_test",
		"save_password": true,
	}
	bCreate, _ := json.Marshal(createPayload)
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(bCreate))
	recCreate := httptest.NewRecorder()
	mux.ServeHTTP(recCreate, reqCreate)
	if recCreate.Code != http.StatusCreated {
		t.Fatalf("create connection failed: status %d: %s", recCreate.Code, recCreate.Body.String())
	}

	var connResp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(recCreate.Body.Bytes(), &connResp); err != nil {
		t.Fatalf("unmarshal conn: %v", err)
	}
	connID := connResp.ID

	// 3. Introspect tables
	reqTables := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables", connID), nil)
	recTables := httptest.NewRecorder()
	mux.ServeHTTP(recTables, reqTables)
	if recTables.Code != http.StatusOK {
		t.Fatalf("list tables failed: status %d: %s", recTables.Code, recTables.Body.String())
	}

	var tables []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(recTables.Body.Bytes(), &tables); err != nil {
		t.Fatalf("unmarshal tables: %v", err)
	}
	foundUsers := false
	for _, tbl := range tables {
		if tbl.Name == "users" {
			foundUsers = true
			break
		}
	}
	if !foundUsers {
		t.Fatalf("expected 'users' table in MySQL tables: %v", tables)
	}

	// 4. Query rows
	reqRows := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/users/rows?limit=2&sort_by=id&sort_desc=false", connID), nil)
	recRows := httptest.NewRecorder()
	mux.ServeHTTP(recRows, reqRows)
	if recRows.Code != http.StatusOK {
		t.Fatalf("query rows failed: status %d: %s", recRows.Code, recRows.Body.String())
	}

	// 5. Insert, update, delete row
	testEmail := "mysql_api_test@example.com"
	insertPayload := map[string]any{
		"values": map[string]any{
			"name":  "MySQL API Test",
			"email": testEmail,
		},
	}
	bInsert, _ := json.Marshal(insertPayload)
	reqInsert := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/users/rows", connID), bytes.NewReader(bInsert))
	recInsert := httptest.NewRecorder()
	mux.ServeHTTP(recInsert, reqInsert)
	if recInsert.Code != http.StatusCreated {
		t.Fatalf("insert row failed: status %d: %s", recInsert.Code, recInsert.Body.String())
	}

	// Update row
	updatePayload := map[string]any{
		"where":  map[string]any{"email": testEmail},
		"values": map[string]any{"name": "MySQL API Test Updated"},
	}
	bUpdate, _ := json.Marshal(updatePayload)
	reqUpdate := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/connections/%s/tables/users/rows", connID), bytes.NewReader(bUpdate))
	recUpdate := httptest.NewRecorder()
	mux.ServeHTTP(recUpdate, reqUpdate)
	if recUpdate.Code != http.StatusNoContent {
		t.Fatalf("update row failed: status %d: %s", recUpdate.Code, recUpdate.Body.String())
	}

	// Delete row
	deletePayload := map[string]any{
		"where": map[string]any{"email": testEmail},
	}
	bDelete, _ := json.Marshal(deletePayload)
	reqDelete := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s/tables/users/rows", connID), bytes.NewReader(bDelete))
	recDelete := httptest.NewRecorder()
	mux.ServeHTTP(recDelete, reqDelete)
	if recDelete.Code != http.StatusNoContent {
		t.Fatalf("delete row failed: status %d: %s", recDelete.Code, recDelete.Body.String())
	}

	// Cleanup connection
	reqDelConn := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s", connID), nil)
	recDelConn := httptest.NewRecorder()
	mux.ServeHTTP(recDelConn, reqDelConn)
	if recDelConn.Code != http.StatusNoContent {
		t.Fatalf("delete connection failed: status %d: %s", recDelConn.Code, recDelConn.Body.String())
	}
}

func testMongoURI(t *testing.T) string {
	t.Helper()
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		uri = "mongodb://pebble:pebble@localhost:27017/pebble_test?authSource=admin"
	}
	ctx := context.Background()
	a, err := mongoadapter.New(ctx, uri)
	if err != nil {
		t.Skipf("MongoDB not reachable (%v) — skipping integration test", err)
	}
	a.Close()
	return uri
}

func TestEndToEndCRUD_MongoDB(t *testing.T) {
	_ = testMongoURI(t)
	mux, _ := setupTestServer(t)

	// 1. Test connection endpoint first
	testConnPayload := map[string]any{
		"name":     "MongoDB Local",
		"type":     "mongodb",
		"mode":     "form",
		"host":     "localhost",
		"port":     "27017",
		"user":     "pebble",
		"password": "pebble",
		"db_name":  "pebble_test",
	}
	bTest, _ := json.Marshal(testConnPayload)
	reqTest := httptest.NewRequest(http.MethodPost, "/api/connections/test", bytes.NewReader(bTest))
	recTest := httptest.NewRecorder()
	mux.ServeHTTP(recTest, reqTest)
	if recTest.Code != http.StatusOK {
		t.Fatalf("test connection failed: status %d: %s", recTest.Code, recTest.Body.String())
	}

	// 2. Create connection
	createPayload := map[string]any{
		"name":          "MongoDB Local",
		"type":          "mongodb",
		"mode":          "form",
		"host":          "localhost",
		"port":          "27017",
		"user":          "pebble",
		"password":      "pebble",
		"db_name":       "pebble_test",
		"save_password": true,
	}
	bCreate, _ := json.Marshal(createPayload)
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(bCreate))
	recCreate := httptest.NewRecorder()
	mux.ServeHTTP(recCreate, reqCreate)
	if recCreate.Code != http.StatusCreated {
		t.Fatalf("create connection failed: status %d: %s", recCreate.Code, recCreate.Body.String())
	}

	var connResp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(recCreate.Body.Bytes(), &connResp); err != nil {
		t.Fatalf("unmarshal conn: %v", err)
	}
	connID := connResp.ID

	// 3. Introspect tables
	reqTables := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables", connID), nil)
	recTables := httptest.NewRecorder()
	mux.ServeHTTP(recTables, reqTables)
	if recTables.Code != http.StatusOK {
		t.Fatalf("list tables failed: status %d: %s", recTables.Code, recTables.Body.String())
	}

	var tables []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(recTables.Body.Bytes(), &tables); err != nil {
		t.Fatalf("unmarshal tables: %v", err)
	}
	foundProducts := false
	for _, tbl := range tables {
		if tbl.Name == "products" {
			foundProducts = true
			break
		}
	}
	if !foundProducts {
		t.Fatalf("expected 'products' collection in tables, got %v", tables)
	}

	// 4. Query rows from products
	reqRows := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/products/rows?limit=10", connID), nil)
	recRows := httptest.NewRecorder()
	mux.ServeHTTP(recRows, reqRows)
	if recRows.Code != http.StatusOK {
		t.Fatalf("query rows failed: status %d: %s", recRows.Code, recRows.Body.String())
	}

	var queryResult struct {
		Rows       []map[string]any `json:"rows"`
		TotalCount int              `json:"total_count"`
	}
	if err := json.Unmarshal(recRows.Body.Bytes(), &queryResult); err != nil {
		t.Fatalf("unmarshal rows: %v", err)
	}
	if queryResult.TotalCount < 4 || len(queryResult.Rows) < 4 {
		t.Fatalf("expected at least 4 products, got count=%d, rows=%d", queryResult.TotalCount, len(queryResult.Rows))
	}

	// 5. Insert row into products
	testName := "MongoDB E2E Gadget"
	insertPayload := map[string]any{
		"values": map[string]any{
			"name":        testName,
			"price":       199.99,
			"in_stock":    true,
			"extra_specs": map[string]any{"version": 2, "waterproof": true},
		},
	}
	bInsert, _ := json.Marshal(insertPayload)
	reqInsert := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/products/rows", connID), bytes.NewReader(bInsert))
	recInsert := httptest.NewRecorder()
	mux.ServeHTTP(recInsert, reqInsert)
	if recInsert.Code != http.StatusCreated {
		t.Fatalf("insert row failed: status %d: %s", recInsert.Code, recInsert.Body.String())
	}

	// 6. Query for the inserted product to retrieve its generated _id
	reqFind := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/products/rows?filter=name:eq:%s", connID, "MongoDB+E2E+Gadget"), nil)
	recFind := httptest.NewRecorder()
	mux.ServeHTTP(recFind, reqFind)
	if recFind.Code != http.StatusOK {
		t.Fatalf("find inserted row failed: status %d: %s", recFind.Code, recFind.Body.String())
	}
	var findResult struct {
		Rows []map[string]any `json:"rows"`
	}
	if err := json.Unmarshal(recFind.Body.Bytes(), &findResult); err != nil || len(findResult.Rows) != 1 {
		t.Fatalf("find inserted row failed: rows=%v err=%v", findResult.Rows, err)
	}
	insertedID, ok := findResult.Rows[0]["_id"].(string)
	if !ok || len(insertedID) != 24 {
		t.Fatalf("expected 24-character hex _id, got %v", findResult.Rows[0]["_id"])
	}

	// 7. Update row by _id
	updatePayload := map[string]any{
		"where":  map[string]any{"_id": insertedID},
		"values": map[string]any{"price": 179.99, "color": "metallic silver"},
	}
	bUpdate, _ := json.Marshal(updatePayload)
	reqUpdate := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/connections/%s/tables/products/rows", connID), bytes.NewReader(bUpdate))
	recUpdate := httptest.NewRecorder()
	mux.ServeHTTP(recUpdate, reqUpdate)
	if recUpdate.Code != http.StatusNoContent {
		t.Fatalf("update row failed: status %d: %s", recUpdate.Code, recUpdate.Body.String())
	}

	// 8. Delete row by _id
	deletePayload := map[string]any{
		"where": map[string]any{"_id": insertedID},
	}
	bDelete, _ := json.Marshal(deletePayload)
	reqDelete := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s/tables/products/rows", connID), bytes.NewReader(bDelete))
	recDelete := httptest.NewRecorder()
	mux.ServeHTTP(recDelete, reqDelete)
	if recDelete.Code != http.StatusNoContent {
		t.Fatalf("delete row failed: status %d: %s", recDelete.Code, recDelete.Body.String())
	}

	// 9. Cleanup connection
	reqDelConn := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s", connID), nil)
	recDelConn := httptest.NewRecorder()
	mux.ServeHTTP(recDelConn, reqDelConn)
	if recDelConn.Code != http.StatusNoContent {
		t.Fatalf("delete connection failed: status %d: %s", recDelConn.Code, recDelConn.Body.String())
	}
}

func TestConnection_SQLite_EndToEnd(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "app_test.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("create test sqlite db: %v", err)
	}
	defer db.Close()

	initSQL := `
	CREATE TABLE categories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL
	);
	CREATE TABLE items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		category_id INTEGER,
		title TEXT NOT NULL,
		FOREIGN KEY (category_id) REFERENCES categories(id)
	);
	INSERT INTO categories (name) VALUES ('Electronics'), ('Books');
	`
	if _, err := db.Exec(initSQL); err != nil {
		t.Fatalf("init test sqlite tables: %v", err)
	}

	mux, _ := setupTestServer(t)

	// 1. Create SQLite connection via API
	payload := map[string]any{
		"name":     "Local App DB",
		"type":     "sqlite",
		"mode":     "form",
		"filepath": dbPath,
	}
	b, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(b))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var connRes map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &connRes); err != nil {
		t.Fatalf("unmarshal conn response: %v", err)
	}

	connID := connRes["id"].(string)
	if connID == "" {
		t.Fatal("expected non-empty connection id")
	}
	if connRes["filepath"] != dbPath {
		t.Errorf("expected filepath %q, got %v", dbPath, connRes["filepath"])
	}

	// 2. Introspect tables
	reqTables := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables", connID), nil)
	recTables := httptest.NewRecorder()
	mux.ServeHTTP(recTables, reqTables)

	if recTables.Code != http.StatusOK {
		t.Fatalf("introspect tables failed: status %d: %s", recTables.Code, recTables.Body.String())
	}

	var tables []map[string]any
	if err := json.Unmarshal(recTables.Body.Bytes(), &tables); err != nil {
		t.Fatalf("unmarshal tables: %v", err)
	}
	if len(tables) < 2 {
		t.Fatalf("expected at least 2 tables, got %d", len(tables))
	}

	// 3. Query categories rows
	reqRows := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/categories/rows", connID), nil)
	recRows := httptest.NewRecorder()
	mux.ServeHTTP(recRows, reqRows)

	if recRows.Code != http.StatusOK {
		t.Fatalf("query rows failed: status %d: %s", recRows.Code, recRows.Body.String())
	}

	var queryRes map[string]any
	if err := json.Unmarshal(recRows.Body.Bytes(), &queryRes); err != nil {
		t.Fatalf("unmarshal rows: %v", err)
	}
	totalCount := int(queryRes["total_count"].(float64))
	if totalCount != 2 {
		t.Errorf("expected total_count=2, got %d", totalCount)
	}

	// 4. Insert row into categories
	insertPayload := map[string]any{
		"values": map[string]any{
			"name": "Gardening",
		},
	}
	bInsert, _ := json.Marshal(insertPayload)
	reqInsert := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/categories/rows", connID), bytes.NewReader(bInsert))
	recInsert := httptest.NewRecorder()
	mux.ServeHTTP(recInsert, reqInsert)

	if recInsert.Code != http.StatusCreated {
		t.Fatalf("insert row failed: status %d: %s", recInsert.Code, recInsert.Body.String())
	}

	// 5. Cleanup
	reqDel := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s", connID), nil)
	recDel := httptest.NewRecorder()
	mux.ServeHTTP(recDel, reqDel)
	if recDel.Code != http.StatusNoContent {
		t.Fatalf("delete connection failed: status %d: %s", recDel.Code, recDel.Body.String())
	}
}

func TestConnection_ReadOnly_MutationsBlocked(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "readonly_test.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("create test sqlite db: %v", err)
	}
	defer db.Close()

	initSQL := `
	CREATE TABLE items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL
	);
	INSERT INTO items (name) VALUES ('Protected Item');
	`
	if _, err := db.Exec(initSQL); err != nil {
		t.Fatalf("init test tables: %v", err)
	}

	mux, _ := setupTestServer(t)

	// 1. Create connection with read_only: true
	payload := map[string]any{
		"name":      "Production Read-Only DB",
		"type":      "sqlite",
		"mode":      "form",
		"filepath":  dbPath,
		"read_only": true,
	}
	b, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(b))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var connRes map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &connRes); err != nil {
		t.Fatalf("unmarshal conn response: %v", err)
	}
	if connRes["read_only"] != true {
		t.Errorf("expected read_only: true, got %v", connRes["read_only"])
	}

	connID := connRes["id"].(string)

	// 2. Querying rows should succeed (GET is permitted)
	reqGet := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/connections/%s/tables/items/rows", connID), nil)
	recGet := httptest.NewRecorder()
	mux.ServeHTTP(recGet, reqGet)

	if recGet.Code != http.StatusOK {
		t.Fatalf("GET /rows failed on read-only connection: status %d: %s", recGet.Code, recGet.Body.String())
	}

	// 3. POST (insert) must return 403 Forbidden
	insertBody, _ := json.Marshal(map[string]any{
		"values": map[string]any{"name": "Should Fail"},
	})
	reqPost := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/tables/items/rows", connID), bytes.NewReader(insertBody))
	recPost := httptest.NewRecorder()
	mux.ServeHTTP(recPost, reqPost)

	if recPost.Code != http.StatusForbidden {
		t.Errorf("expected POST /rows to return 403 Forbidden, got %d: %s", recPost.Code, recPost.Body.String())
	}

	// 4. PATCH (update) must return 403 Forbidden
	updateBody, _ := json.Marshal(map[string]any{
		"where":  map[string]any{"id": 1},
		"values": map[string]any{"name": "Hacked Name"},
	})
	reqPatch := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/connections/%s/tables/items/rows", connID), bytes.NewReader(updateBody))
	recPatch := httptest.NewRecorder()
	mux.ServeHTTP(recPatch, reqPatch)

	if recPatch.Code != http.StatusForbidden {
		t.Errorf("expected PATCH /rows to return 403 Forbidden, got %d: %s", recPatch.Code, recPatch.Body.String())
	}

	// 5. DELETE must return 403 Forbidden
	deleteBody, _ := json.Marshal(map[string]any{
		"where": map[string]any{"id": 1},
	})
	reqDelete := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/connections/%s/tables/items/rows", connID), bytes.NewReader(deleteBody))
	recDelete := httptest.NewRecorder()
	mux.ServeHTTP(recDelete, reqDelete)

	if recDelete.Code != http.StatusForbidden {
		t.Errorf("expected DELETE /rows to return 403 Forbidden, got %d: %s", recDelete.Code, recDelete.Body.String())
	}
}

func TestConnection_RawQuery_SQLite(t *testing.T) {
	mux, _ := setupTestServer(t)

	// 1. Create a SQLite file with sample tables
	dbFile := filepath.Join(t.TempDir(), "query_test.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, age INTEGER);
		CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount REAL);
		INSERT INTO users (name, age) VALUES ('Alice', 30), ('Bob', 25);
		INSERT INTO orders (user_id, amount) VALUES (1, 99.50), (1, 150.00), (2, 45.20);
	`)
	db.Close()
	if err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}

	// 2. Register connection
	body, _ := json.Marshal(map[string]any{
		"name":          "SQLite Query Test",
		"type":          "sqlite",
		"filepath":      dbFile,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var connResp struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&connResp)
	connID := connResp.ID

	// 3. Run SELECT with JOIN
	queryBody, _ := json.Marshal(map[string]any{
		"query": "SELECT u.name, o.amount FROM users u JOIN orders o ON u.id = o.user_id WHERE u.name = 'Alice' ORDER BY o.amount ASC",
	})
	qReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/query", connID), bytes.NewReader(queryBody))
	qRec := httptest.NewRecorder()
	mux.ServeHTTP(qRec, qReq)

	if qRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", qRec.Code, qRec.Body.String())
	}

	var res struct {
		Columns         []string         `json:"columns"`
		Rows            []map[string]any `json:"rows"`
		ExecutionTimeMs float64          `json:"execution_time_ms"`
		RowsAffected    int64            `json:"rows_affected"`
		IsMutation      bool             `json:"is_mutation"`
	}
	if err := json.NewDecoder(qRec.Body).Decode(&res); err != nil {
		t.Fatalf("decode query response: %v", err)
	}

	if len(res.Columns) != 2 || res.Columns[0] != "name" || res.Columns[1] != "amount" {
		t.Errorf("unexpected columns: %v", res.Columns)
	}
	if len(res.Rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(res.Rows))
	}
	if res.Rows[0]["name"] != "Alice" {
		t.Errorf("expected Alice, got %v", res.Rows[0]["name"])
	}

	// 4. Run Mutation via Raw SQL (INSERT)
	insertBody, _ := json.Marshal(map[string]any{
		"query": "INSERT INTO users (name, age) VALUES ('Charlie', 22)",
	})
	iReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/query", connID), bytes.NewReader(insertBody))
	iRec := httptest.NewRecorder()
	mux.ServeHTTP(iRec, iReq)

	if iRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on raw INSERT, got %d: %s", iRec.Code, iRec.Body.String())
	}
	var insertRes struct {
		IsMutation   bool  `json:"is_mutation"`
		RowsAffected int64 `json:"rows_affected"`
	}
	_ = json.NewDecoder(iRec.Body).Decode(&insertRes)
	if !insertRes.IsMutation || insertRes.RowsAffected != 1 {
		t.Errorf("expected mutation with 1 row affected, got %v", insertRes)
	}

	// 5. Test Syntax Error returns 400
	badBody, _ := json.Marshal(map[string]any{
		"query": "SELEC * FORM invalid_syntax",
	})
	bReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/query", connID), bytes.NewReader(badBody))
	bRec := httptest.NewRecorder()
	mux.ServeHTTP(bRec, bReq)

	if bRec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for invalid syntax, got %d: %s", bRec.Code, bRec.Body.String())
	}
}

func TestConnection_RawQuery_ReadOnly_Blocked(t *testing.T) {
	mux, _ := setupTestServer(t)

	dbFile := filepath.Join(t.TempDir(), "readonly_query.db")
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, _ = db.Exec("CREATE TABLE records (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO records VALUES (1, 'Safe');")
	db.Close()

	// Register connection with read_only = true
	body, _ := json.Marshal(map[string]any{
		"name":          "ReadOnly DB",
		"type":          "sqlite",
		"filepath":      dbFile,
		"read_only":     true,
		"save_password": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	var connResp struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&connResp)
	connID := connResp.ID

	// SELECT query must be allowed (200 OK)
	qBody, _ := json.Marshal(map[string]any{
		"query": "SELECT * FROM records",
	})
	qReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/query", connID), bytes.NewReader(qBody))
	qRec := httptest.NewRecorder()
	mux.ServeHTTP(qRec, qReq)

	if qRec.Code != http.StatusOK {
		t.Errorf("expected 200 OK for SELECT in read-only mode, got %d: %s", qRec.Code, qRec.Body.String())
	}

	// DROP TABLE mutation must be blocked (403 Forbidden)
	dropBody, _ := json.Marshal(map[string]any{
		"query": "DROP TABLE records",
	})
	dReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/query", connID), bytes.NewReader(dropBody))
	dRec := httptest.NewRecorder()
	mux.ServeHTTP(dRec, dReq)

	if dRec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for DROP TABLE in read-only mode, got %d: %s", dRec.Code, dRec.Body.String())
	}

	// DELETE mutation must be blocked (403 Forbidden)
	delBody, _ := json.Marshal(map[string]any{
		"query": "DELETE FROM records WHERE id = 1",
	})
	delReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/connections/%s/query", connID), bytes.NewReader(delBody))
	delRec := httptest.NewRecorder()
	mux.ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for DELETE in read-only mode, got %d: %s", delRec.Code, delRec.Body.String())
	}
}
