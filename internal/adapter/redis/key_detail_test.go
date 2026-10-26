package redis

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"
)

func setupTestRedis(t *testing.T) (*Adapter, *miniredis.Miniredis) {
	mr := miniredis.RunT(t)
	dsn := fmt.Sprintf("redis://%s/0", mr.Addr())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	adp, err := New(ctx, dsn)
	if err != nil {
		t.Fatalf("failed to create redis adapter: %v", err)
	}
	t.Cleanup(func() {
		_ = adp.Close()
		mr.Close()
	})
	return adp, mr
}

func TestScanKeysWithMetadata(t *testing.T) {
	adp, _ := setupTestRedis(t)
	ctx := context.Background()
	rdb := adp.Client()

	// Seed keys
	_ = rdb.Set(ctx, "user:1", "alice", 0).Err()
	_ = rdb.Set(ctx, "user:2", "bob", 0).Err()
	_ = rdb.HSet(ctx, "cache:profile", "theme", "dark").Err()
	_ = rdb.LPush(ctx, "queue:tasks", "task1").Err()

	// Scan all keys
	res, err := adp.ScanKeysWithMetadata(ctx, 0, "*", 50, "all")
	if err != nil {
		t.Fatalf("unexpected error scanning keys: %v", err)
	}
	if len(res.Keys) != 4 {
		t.Errorf("expected 4 keys, got %d", len(res.Keys))
	}

	// Scan pattern "user:*"
	resPattern, err := adp.ScanKeysWithMetadata(ctx, 0, "user:*", 50, "all")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resPattern.Keys) != 2 {
		t.Errorf("expected 2 keys matching user:*, got %d", len(resPattern.Keys))
	}

	// Filter by type "hash"
	resHash, err := adp.ScanKeysWithMetadata(ctx, 0, "*", 50, "hash")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resHash.Keys) != 1 || resHash.Keys[0].Key != "cache:profile" {
		t.Errorf("expected 1 hash key 'cache:profile', got %v", resHash.Keys)
	}
}

func TestGetKeyDetail_AllTypes(t *testing.T) {
	adp, _ := setupTestRedis(t)
	ctx := context.Background()
	rdb := adp.Client()

	// 1. String
	_ = rdb.Set(ctx, "str:key", "hello world", 60*time.Second).Err()

	strDetail, err := adp.GetKeyDetail(ctx, "str:key")
	if err != nil {
		t.Fatalf("failed to get string detail: %v", err)
	}
	if strDetail.Type != "string" || strDetail.Value != "hello world" || strDetail.Length != 11 {
		t.Errorf("unexpected string detail: %+v", strDetail)
	}
	if strDetail.TTL <= 0 {
		t.Errorf("expected positive TTL, got %d", strDetail.TTL)
	}

	// 2. Hash
	_ = rdb.HSet(ctx, "hash:user", "name", "Alice", "role", "Admin").Err()
	hashDetail, err := adp.GetKeyDetail(ctx, "hash:user")
	if err != nil {
		t.Fatalf("failed to get hash detail: %v", err)
	}
	if hashDetail.Type != "hash" || hashDetail.Length != 2 {
		t.Errorf("unexpected hash length/type: %+v", hashDetail)
	}
	hmap, ok := hashDetail.Value.(map[string]string)
	if !ok || hmap["name"] != "Alice" || hmap["role"] != "Admin" {
		t.Errorf("unexpected hash map: %+v", hashDetail.Value)
	}

	// 3. List
	_ = rdb.LPush(ctx, "list:items", "item1", "item2").Err()
	listDetail, err := adp.GetKeyDetail(ctx, "list:items")
	if err != nil {
		t.Fatalf("failed to get list detail: %v", err)
	}
	if listDetail.Type != "list" || listDetail.Length != 2 {
		t.Errorf("unexpected list length/type: %+v", listDetail)
	}

	// 4. Set
	_ = rdb.SAdd(ctx, "set:tags", "go", "redis", "database").Err()
	setDetail, err := adp.GetKeyDetail(ctx, "set:tags")
	if err != nil {
		t.Fatalf("failed to get set detail: %v", err)
	}
	if setDetail.Type != "set" || setDetail.Length != 3 {
		t.Errorf("unexpected set length/type: %+v", setDetail)
	}

	// 5. ZSet
	_ = rdb.ZAdd(ctx, "zset:leaderboard", goredis.Z{Score: 100.5, Member: "alice"}, goredis.Z{Score: 200.0, Member: "bob"}).Err()
	zsetDetail, err := adp.GetKeyDetail(ctx, "zset:leaderboard")
	if err != nil {
		t.Fatalf("failed to get zset detail: %v", err)
	}
	if zsetDetail.Type != "zset" || zsetDetail.Length != 2 {
		t.Errorf("unexpected zset length/type: %+v", zsetDetail)
	}
	zmembers, ok := zsetDetail.Value.([]ZSetMember)
	if !ok || len(zmembers) != 2 {
		t.Errorf("unexpected zset members: %+v", zsetDetail.Value)
	}
}

func TestKeyLifecycleAndMutations(t *testing.T) {
	adp, mr := setupTestRedis(t)
	ctx := context.Background()

	// String mutation & TTL
	if err := adp.SetStringValue(ctx, "temp:k", "val123", 120); err != nil {
		t.Fatalf("set string failed: %v", err)
	}
	if mr.TTL("temp:k") <= 0 {
		t.Errorf("expected positive TTL on temp:k")
	}

	// Persist key (remove TTL)
	if err := adp.SetKeyTTL(ctx, "temp:k", -1); err != nil {
		t.Fatalf("persist key failed: %v", err)
	}
	if mr.TTL("temp:k") != 0 {
		t.Errorf("expected 0 ttl (persist), got %v", mr.TTL("temp:k"))
	}

	// Rename key
	if err := adp.RenameKey(ctx, "temp:k", "new:k"); err != nil {
		t.Fatalf("rename key failed: %v", err)
	}
	if mr.Exists("temp:k") || !mr.Exists("new:k") {
		t.Errorf("rename did not update keys correctly")
	}

	// Delete key
	if err := adp.DeleteKey(ctx, "new:k"); err != nil {
		t.Fatalf("delete key failed: %v", err)
	}
	if mr.Exists("new:k") {
		t.Errorf("key still exists after delete")
	}

	// Hash mutations
	if err := adp.HSetField(ctx, "h1", "field1", "val1"); err != nil {
		t.Fatalf("hset failed: %v", err)
	}
	if err := adp.HDelField(ctx, "h1", "field1"); err != nil {
		t.Fatalf("hdel failed: %v", err)
	}

	// List mutations
	if err := adp.ListPush(ctx, "l1", "elem1", false); err != nil {
		t.Fatalf("lpush failed: %v", err)
	}
	if err := adp.ListSet(ctx, "l1", 0, "elem1_updated"); err != nil {
		t.Fatalf("lset failed: %v", err)
	}
	if err := adp.ListRemove(ctx, "l1", "elem1_updated", 0); err != nil {
		t.Fatalf("lrem failed: %v", err)
	}

	// Set mutations
	if err := adp.SetAdd(ctx, "s1", "m1"); err != nil {
		t.Fatalf("sadd failed: %v", err)
	}
	if err := adp.SetRemove(ctx, "s1", "m1"); err != nil {
		t.Fatalf("srem failed: %v", err)
	}

	// ZSet mutations
	if err := adp.ZSetAdd(ctx, "z1", "zm1", 42.0); err != nil {
		t.Fatalf("zadd failed: %v", err)
	}
	if err := adp.ZSetRemove(ctx, "z1", "zm1"); err != nil {
		t.Fatalf("zrem failed: %v", err)
	}
}
