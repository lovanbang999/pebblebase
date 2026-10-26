package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"pebblebase/internal/storage"
)

func createRedisConnection(t *testing.T, store *storage.Store, mr *miniredis.Miniredis) string {
	t.Helper()
	rawURL := fmt.Sprintf("redis://%s/0", mr.Addr())
	rec, err := store.Save("Test Redis", "redis", mr.Host(), mr.Port(), "", "0", rawURL, true)
	if err != nil {
		t.Fatalf("save redis connection: %v", err)
	}
	return rec.ID
}

func TestRedisAPI_ScanAndDetail(t *testing.T) {
	mux, store := setupTestServer(t)
	mr := miniredis.RunT(t)
	defer mr.Close()

	connID := createRedisConnection(t, store, mr)

	// Seed miniredis data
	_ = mr.Set("session:abc", "tok123")
	mr.HSet("config:app", "env", "prod")

	// 1. Test Scan
	req := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/redis/scan?count=10", connID), nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("scan status %d: %s", rec.Code, rec.Body.String())
	}

	var scanRes struct {
		Keys []struct {
			Key  string `json:"key"`
			Type string `json:"type"`
		} `json:"keys"`
		NextCursor uint64 `json:"next_cursor"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &scanRes); err != nil {
		t.Fatalf("unmarshal scan response: %v", err)
	}
	if len(scanRes.Keys) != 2 {
		t.Errorf("expected 2 keys, got %d", len(scanRes.Keys))
	}

	// 2. Test Key Detail
	reqDetail := httptest.NewRequest("GET", fmt.Sprintf("/api/connections/%s/redis/key?name=session:abc", connID), nil)
	recDetail := httptest.NewRecorder()
	mux.ServeHTTP(recDetail, reqDetail)

	if recDetail.Code != http.StatusOK {
		t.Fatalf("detail status %d: %s", recDetail.Code, recDetail.Body.String())
	}

	var detailRes struct {
		Key   string `json:"key"`
		Type  string `json:"type"`
		Value string `json:"value"`
	}
	if err := json.Unmarshal(recDetail.Body.Bytes(), &detailRes); err != nil {
		t.Fatalf("unmarshal detail response: %v", err)
	}
	if detailRes.Type != "string" || detailRes.Value != "tok123" {
		t.Errorf("unexpected detail payload: %+v", detailRes)
	}
}

func TestRedisAPI_MutationsAndItems(t *testing.T) {
	mux, store := setupTestServer(t)
	mr := miniredis.RunT(t)
	defer mr.Close()

	connID := createRedisConnection(t, store, mr)

	_ = mr.Set("item:1", "original")

	// 1. Update String value & TTL
	newVal := "updated_value"
	var ttlSec int64 = 300
	updateBody, _ := json.Marshal(map[string]any{
		"key":   "item:1",
		"value": newVal,
		"ttl":   ttlSec,
	})
	reqPut := httptest.NewRequest("PUT", fmt.Sprintf("/api/connections/%s/redis/key", connID), bytes.NewReader(updateBody))
	recPut := httptest.NewRecorder()
	mux.ServeHTTP(recPut, reqPut)

	if recPut.Code != http.StatusOK {
		t.Fatalf("put status %d: %s", recPut.Code, recPut.Body.String())
	}
	if mr.TTL("item:1") <= 0 {
		t.Errorf("expected positive TTL on item:1")
	}

	// 2. Hash Item Mutation (Add field)
	hashItemBody, _ := json.Marshal(map[string]any{
		"key":    "h:user:1",
		"type":   "hash",
		"action": "add",
		"field":  "email",
		"value":  "test@example.com",
	})
	reqHash := httptest.NewRequest("POST", fmt.Sprintf("/api/connections/%s/redis/key/item", connID), bytes.NewReader(hashItemBody))
	recHash := httptest.NewRecorder()
	mux.ServeHTTP(recHash, reqHash)

	if recHash.Code != http.StatusOK {
		t.Fatalf("hash add status %d: %s", recHash.Code, recHash.Body.String())
	}
	if mr.HGet("h:user:1", "email") != "test@example.com" {
		t.Errorf("expected hash field to be set")
	}

	// 3. Delete Key
	reqDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/connections/%s/redis/key?name=item:1", connID), nil)
	recDel := httptest.NewRecorder()
	mux.ServeHTTP(recDel, reqDel)

	if recDel.Code != http.StatusOK {
		t.Fatalf("delete key status %d: %s", recDel.Code, recDel.Body.String())
	}
	if mr.Exists("item:1") {
		t.Errorf("expected item:1 to be deleted")
	}
}
