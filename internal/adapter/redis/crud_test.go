package redis

import (
	"context"
	"testing"

	"pebblebase/internal/adapter"
)

func TestAdapter_Mutate_Insert(t *testing.T) {
	adp, mr := setupTestRedis(t)
	ctx := context.Background()

	// 1. Missing key error
	err := adp.Mutate(ctx, "redis", adapter.MutationOp{
		Type:   "insert",
		Values: map[string]any{"value": "missing_key"},
	})
	if err == nil {
		t.Fatal("expected error when inserting without key")
	}

	// 2. Successful insert with TTL
	err = adp.Mutate(ctx, "redis", adapter.MutationOp{
		Type: "insert",
		Values: map[string]any{
			"key":   "k:ttl",
			"value": "v:ttl",
			"ttl":   60,
		},
	})
	if err != nil {
		t.Fatalf("unexpected insert error: %v", err)
	}
	if !mr.Exists("k:ttl") {
		t.Fatal("expected key k:ttl to exist")
	}
	if mr.TTL("k:ttl") <= 0 {
		t.Errorf("expected positive TTL, got %v", mr.TTL("k:ttl"))
	}
}

func TestAdapter_Mutate_Update(t *testing.T) {
	adp, mr := setupTestRedis(t)
	ctx := context.Background()

	_ = mr.Set("k:update", "initial")

	// 1. Missing key in where
	err := adp.Mutate(ctx, "redis", adapter.MutationOp{
		Type:   "update",
		Where:  map[string]any{},
		Values: map[string]any{"value": "updated"},
	})
	if err == nil {
		t.Fatal("expected error on update without where key")
	}

	// 2. Successful update value and TTL
	err = adp.Mutate(ctx, "redis", adapter.MutationOp{
		Type:   "update",
		Where:  map[string]any{"key": "k:update"},
		Values: map[string]any{"value": "updated_val", "ttl": 300},
	})
	if err != nil {
		t.Fatalf("unexpected update error: %v", err)
	}
	val, _ := mr.Get("k:update")
	if val != "updated_val" {
		t.Errorf("expected updated_val, got %s", val)
	}

	// 3. Persist key (ttl = -1)
	err = adp.Mutate(ctx, "redis", adapter.MutationOp{
		Type:   "update",
		Where:  map[string]any{"key": "k:update"},
		Values: map[string]any{"ttl": -1},
	})
	if err != nil {
		t.Fatalf("unexpected persist error: %v", err)
	}
	if mr.TTL("k:update") != 0 {
		t.Errorf("expected persist ttl=0, got %v", mr.TTL("k:update"))
	}
}

func TestAdapter_Mutate_Delete(t *testing.T) {
	adp, mr := setupTestRedis(t)
	ctx := context.Background()

	_ = mr.Set("k:del", "delete_me")

	// 1. Missing key in where
	err := adp.Mutate(ctx, "redis", adapter.MutationOp{
		Type:  "delete",
		Where: map[string]any{},
	})
	if err == nil {
		t.Fatal("expected error deleting without key")
	}

	// 2. Successful delete
	err = adp.Mutate(ctx, "redis", adapter.MutationOp{
		Type:  "delete",
		Where: map[string]any{"key": "k:del"},
	})
	if err != nil {
		t.Fatalf("unexpected delete error: %v", err)
	}
	if mr.Exists("k:del") {
		t.Fatal("expected k:del to be deleted")
	}
}

func TestAdapter_BulkInsertAndStreamRows(t *testing.T) {
	adp, mr := setupTestRedis(t)
	ctx := context.Background()

	records := [][]any{
		{"bulk:1", "val1"},
		{"bulk:2", "val2"},
		{"bulk:3", "val3"},
	}
	cols := []string{"key", "value"}

	inserted, err := adp.BulkInsert(ctx, "redis", cols, records)
	if err != nil {
		t.Fatalf("BulkInsert failed: %v", err)
	}
	if inserted != 3 {
		t.Errorf("expected 3 inserted, got %d", inserted)
	}

	if !mr.Exists("bulk:1") || !mr.Exists("bulk:2") || !mr.Exists("bulk:3") {
		t.Fatal("expected all bulk keys to exist in redis")
	}

	// Stream rows
	var streamed []map[string]any
	err = adp.StreamRows(ctx, "redis", adapter.QueryOptions{}, func(columns []string, rows []map[string]any) error {
		streamed = append(streamed, rows...)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamRows failed: %v", err)
	}
	if len(streamed) != 3 {
		t.Errorf("expected 3 streamed rows, got %d", len(streamed))
	}
}

func TestAdapter_CollectionItemMutations(t *testing.T) {
	adp, _ := setupTestRedis(t)
	ctx := context.Background()

	// 1. Hash items
	if err := adp.HSetField(ctx, "h:test", "f1", "v1"); err != nil {
		t.Fatalf("HSetField failed: %v", err)
	}
	if err := adp.HSetField(ctx, "h:test", "f1", "v1_mod"); err != nil {
		t.Fatalf("HSetField update failed: %v", err)
	}
	detail, err := adp.GetKeyDetail(ctx, "h:test")
	if err != nil {
		t.Fatalf("GetKeyDetail failed: %v", err)
	}
	hmap := detail.Value.(map[string]string)
	if hmap["f1"] != "v1_mod" {
		t.Errorf("expected v1_mod, got %s", hmap["f1"])
	}
	if err := adp.HDelField(ctx, "h:test", "f1"); err != nil {
		t.Fatalf("HDelField failed: %v", err)
	}

	// 2. List items
	if err := adp.ListPush(ctx, "l:test", "elem_r", false); err != nil {
		t.Fatalf("ListPush right failed: %v", err)
	}
	if err := adp.ListPush(ctx, "l:test", "elem_l", true); err != nil {
		t.Fatalf("ListPush left failed: %v", err)
	}
	if err := adp.ListSet(ctx, "l:test", 0, "elem_l_updated"); err != nil {
		t.Fatalf("ListSet failed: %v", err)
	}
	if err := adp.ListRemove(ctx, "l:test", "elem_r", 0); err != nil {
		t.Fatalf("ListRemove failed: %v", err)
	}

	// 3. Set items
	if err := adp.SetAdd(ctx, "s:test", "item1"); err != nil {
		t.Fatalf("SetAdd failed: %v", err)
	}
	if err := adp.SetRemove(ctx, "s:test", "item1"); err != nil {
		t.Fatalf("SetRemove failed: %v", err)
	}

	// 4. ZSet items
	if err := adp.ZSetAdd(ctx, "z:test", "member1", 10.5); err != nil {
		t.Fatalf("ZSetAdd failed: %v", err)
	}
	if err := adp.ZSetAdd(ctx, "z:test", "member1", 20.0); err != nil {
		t.Fatalf("ZSetAdd score update failed: %v", err)
	}
	if err := adp.ZSetRemove(ctx, "z:test", "member1"); err != nil {
		t.Fatalf("ZSetRemove failed: %v", err)
	}
}

func TestAdapter_RawCommands_ParserAndExec(t *testing.T) {
	adp, _ := setupTestRedis(t)
	ctx := context.Background()

	// 1. Quoted string command
	res, err := adp.ExecuteRaw(ctx, `SET "user:session token" "abc 123 \"quoted\""`)
	if err != nil {
		t.Fatalf("ExecuteRaw SET with quotes failed: %v", err)
	}
	if !res.IsMutation {
		t.Error("expected SET to be classified as mutation")
	}

	// 2. Unclosed quote syntax error
	_, err = adp.ExecuteRaw(ctx, `SET "unclosed quote string`)
	if err == nil {
		t.Fatal("expected error on unclosed quote")
	}

	// 3. Empty command
	emptyRes, err := adp.ExecuteRaw(ctx, "   \n\t  ")
	if err != nil || len(emptyRes.Rows) != 0 {
		t.Fatalf("expected empty result for whitespace command, got err=%v", err)
	}

	// 4. Server inspection command
	dbsizeRes, err := adp.ExecuteRaw(ctx, "DBSIZE")
	if err != nil {
		t.Fatalf("ExecuteRaw DBSIZE failed: %v", err)
	}
	if len(dbsizeRes.Rows) == 0 {
		t.Fatal("expected DBSIZE row")
	}
}
