package redis

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// KeyMetadata holds essential attributes for a Redis key.
type KeyMetadata struct {
	Key         string `json:"key"`
	Type        string `json:"type"`
	TTL         int64  `json:"ttl"`          // -1 = no expiry, -2 = key does not exist, >0 = seconds remaining
	MemoryUsage int64  `json:"memory_usage"` // bytes (from MEMORY USAGE)
	Length      int64  `json:"length"`       // Item/element count or string length
}

// ZSetMember represents an item and its associated float score in a Sorted Set.
type ZSetMember struct {
	Member string  `json:"member"`
	Score  float64 `json:"score"`
}

// StreamEntry represents a single message in a Redis Stream.
type StreamEntry struct {
	ID     string         `json:"id"`
	Values map[string]any `json:"values"`
}

// KeyDetail contains both metadata and the type-specific payload.
type KeyDetail struct {
	KeyMetadata
	Value any `json:"value"`
}

// ScanResult contains paginated key metadata and the next cursor.
type ScanResult struct {
	Keys       []KeyMetadata `json:"keys"`
	NextCursor uint64        `json:"next_cursor"`
	TotalKeys  int64         `json:"total_keys"`
}

// ScanKeysWithMetadata performs non-blocking SCAN iteration, filtering by pattern and type,
// and pipelines metadata retrieval for matching keys.
func (a *Adapter) ScanKeysWithMetadata(ctx context.Context, cursor uint64, pattern string, count int64, typeFilter string) (ScanResult, error) {
	if count <= 0 {
		count = 50
	}
	if pattern == "" {
		pattern = "*"
	}
	typeFilter = strings.ToLower(strings.TrimSpace(typeFilter))

	scanCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Approximate total keys using DBSize
	var totalKeys int64
	if dbsize, err := a.client.DBSize(scanCtx).Result(); err == nil {
		totalKeys = dbsize
	}

	var scannedKeys []string
	nextCursor := cursor

	// Loop scan until we gather enough keys or cursor resets to 0
	for len(scannedKeys) < int(count) {
		keys, nCursor, err := a.client.Scan(scanCtx, nextCursor, pattern, count).Result()
		if err != nil {
			return ScanResult{}, fmt.Errorf("redis: scan error: %w", err)
		}

		scannedKeys = append(scannedKeys, keys...)
		nextCursor = nCursor
		if nextCursor == 0 {
			break
		}
	}

	// Cap to count so a single scan page never exceeds the requested batch size
	// (protects against huge pipeline overhead and ensures consistent page sizes)
	if len(scannedKeys) > int(count) {
		scannedKeys = scannedKeys[:count]
	}

	if len(scannedKeys) == 0 {
		return ScanResult{
			Keys:       []KeyMetadata{},
			NextCursor: nextCursor,
			TotalKeys:  totalKeys,
		}, nil
	}

	// Fetch types first to apply typeFilter if requested
	pipe := a.client.Pipeline()
	typeCmds := make([]*redis.StatusCmd, len(scannedKeys))
	for i, k := range scannedKeys {
		typeCmds[i] = pipe.Type(scanCtx, k)
	}
	_, _ = pipe.Exec(scanCtx)

	var filteredKeys []string
	var keyTypes []string
	for i, k := range scannedKeys {
		t := typeCmds[i].Val()
		if t == "" {
			t = "none"
		}
		if typeFilter != "" && typeFilter != "all" && !strings.EqualFold(t, typeFilter) {
			continue
		}
		filteredKeys = append(filteredKeys, k)
		keyTypes = append(keyTypes, t)
	}

	if len(filteredKeys) == 0 {
		return ScanResult{
			Keys:       []KeyMetadata{},
			NextCursor: nextCursor,
			TotalKeys:  totalKeys,
		}, nil
	}

	// Pipeline TTL and MemoryUsage
	pipe2 := a.client.Pipeline()
	ttlCmds := make([]*redis.DurationCmd, len(filteredKeys))
	memCmds := make([]*redis.IntCmd, len(filteredKeys))

	for i, k := range filteredKeys {
		ttlCmds[i] = pipe2.TTL(scanCtx, k)
		memCmds[i] = pipe2.MemoryUsage(scanCtx, k)
	}
	_, _ = pipe2.Exec(scanCtx)

	resultList := make([]KeyMetadata, len(filteredKeys))
	for i, k := range filteredKeys {
		ttlSec := int64(-1)
		if dur, err := ttlCmds[i].Result(); err == nil {
			switch dur {
			case -1 * time.Second:
				ttlSec = -1
			case -2 * time.Second:
				ttlSec = -2
			default:
				ttlSec = int64(dur.Seconds())
			}
		}

		memBytes := int64(0)
		if m, err := memCmds[i].Result(); err == nil {
			memBytes = m
		}

		resultList[i] = KeyMetadata{
			Key:         k,
			Type:        keyTypes[i],
			TTL:         ttlSec,
			MemoryUsage: memBytes,
		}
	}

	return ScanResult{
		Keys:       resultList,
		NextCursor: nextCursor,
		TotalKeys:  totalKeys,
	}, nil
}

// GetKeyDetail retrieves metadata and full/preview data for the specified key.
func (a *Adapter) GetKeyDetail(ctx context.Context, key string) (*KeyDetail, error) {
	detailCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Pipeline initial type, TTL, and memory
	pipe := a.client.Pipeline()
	typeCmd := pipe.Type(detailCtx, key)
	ttlCmd := pipe.TTL(detailCtx, key)
	memCmd := pipe.MemoryUsage(detailCtx, key)
	_, _ = pipe.Exec(detailCtx)

	keyType := typeCmd.Val()
	if keyType == "" || keyType == "none" {
		return nil, fmt.Errorf("redis: key %q does not exist", key)
	}

	ttlSec := int64(-1)
	if dur, err := ttlCmd.Result(); err == nil {
		switch dur {
		case -1 * time.Second:
			ttlSec = -1
		case -2 * time.Second:
			ttlSec = -2
		default:
			ttlSec = int64(dur.Seconds())
		}
	}

	memBytes := int64(0)
	if m, err := memCmd.Result(); err == nil {
		memBytes = m
	}

	meta := KeyMetadata{
		Key:         key,
		Type:        keyType,
		TTL:         ttlSec,
		MemoryUsage: memBytes,
	}

	detail := &KeyDetail{
		KeyMetadata: meta,
	}

	// Fetch type-specific data
	switch keyType {
	case "string":
		val, err := a.client.Get(detailCtx, key).Result()
		if err != nil && err != redis.Nil {
			return nil, fmt.Errorf("redis: get string failed: %w", err)
		}
		detail.Value = val
		detail.Length = int64(len(val))

	case "hash":
		hlen, err := a.client.HLen(detailCtx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: hlen failed: %w", err)
		}
		detail.Length = hlen

		data, err := a.client.HGetAll(detailCtx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: hgetall failed: %w", err)
		}
		detail.Value = data

	case "list":
		llen, err := a.client.LLen(detailCtx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: llen failed: %w", err)
		}
		detail.Length = llen

		// Fetch up to 500 items for view
		items, err := a.client.LRange(detailCtx, key, 0, 499).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: lrange failed: %w", err)
		}
		detail.Value = items

	case "set":
		scard, err := a.client.SCard(detailCtx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: scard failed: %w", err)
		}
		detail.Length = scard

		members, err := a.client.SMembers(detailCtx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: smembers failed: %w", err)
		}
		detail.Value = members

	case "zset":
		zcard, err := a.client.ZCard(detailCtx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: zcard failed: %w", err)
		}
		detail.Length = zcard

		zlist, err := a.client.ZRangeWithScores(detailCtx, key, 0, 499).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: zrange failed: %w", err)
		}
		res := make([]ZSetMember, len(zlist))
		for i, z := range zlist {
			memberStr := fmt.Sprintf("%v", z.Member)
			res[i] = ZSetMember{
				Member: memberStr,
				Score:  z.Score,
			}
		}
		detail.Value = res

	case "stream":
		xlen, err := a.client.XLen(detailCtx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: xlen failed: %w", err)
		}
		detail.Length = xlen

		// Fetch last 50 entries
		entries, err := a.client.XRevRangeN(detailCtx, key, "+", "-", 50).Result()
		if err != nil {
			return nil, fmt.Errorf("redis: xrevrange failed: %w", err)
		}
		streamRes := make([]StreamEntry, len(entries))
		for i, e := range entries {
			streamRes[i] = StreamEntry{
				ID:     e.ID,
				Values: e.Values,
			}
		}
		detail.Value = streamRes

	default:
		detail.Value = nil
	}

	return detail, nil
}

// SetKeyTTL updates the TTL for a key. If ttlSec <= 0, key is persisted (TTL removed).
func (a *Adapter) SetKeyTTL(ctx context.Context, key string, ttlSec int64) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if ttlSec <= 0 {
		return a.client.Persist(opCtx, key).Err()
	}
	return a.client.Expire(opCtx, key, time.Duration(ttlSec)*time.Second).Err()
}

// RenameKey renames an existing Redis key.
func (a *Adapter) RenameKey(ctx context.Context, oldKey, newKey string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.Rename(opCtx, oldKey, newKey).Err()
}

// DeleteKey removes a key.
func (a *Adapter) DeleteKey(ctx context.Context, key string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.Del(opCtx, key).Err()
}

// SetStringValue updates or creates a string key with optional TTL.
func (a *Adapter) SetStringValue(ctx context.Context, key, val string, ttlSec int64) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var exp time.Duration
	if ttlSec > 0 {
		exp = time.Duration(ttlSec) * time.Second
	}
	return a.client.Set(opCtx, key, val, exp).Err()
}

// HSetField sets a field/value pair in a hash.
func (a *Adapter) HSetField(ctx context.Context, key, field, value string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.HSet(opCtx, key, field, value).Err()
}

// HDelField removes a field from a hash.
func (a *Adapter) HDelField(ctx context.Context, key, field string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.HDel(opCtx, key, field).Err()
}

// ListPush pushes an element into a list (left or right).
func (a *Adapter) ListPush(ctx context.Context, key, value string, left bool) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if left {
		return a.client.LPush(opCtx, key, value).Err()
	}
	return a.client.RPush(opCtx, key, value).Err()
}

// ListSet updates a list element by index.
func (a *Adapter) ListSet(ctx context.Context, key string, index int64, value string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.LSet(opCtx, key, index, value).Err()
}

// ListRemove removes matching elements from a list.
func (a *Adapter) ListRemove(ctx context.Context, key, value string, count int64) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.LRem(opCtx, key, count, value).Err()
}

// SetAdd adds a member to a set.
func (a *Adapter) SetAdd(ctx context.Context, key, member string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.SAdd(opCtx, key, member).Err()
}

// SetRemove removes a member from a set.
func (a *Adapter) SetRemove(ctx context.Context, key, member string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.SRem(opCtx, key, member).Err()
}

// ZSetAdd adds or updates a member with score in a sorted set.
func (a *Adapter) ZSetAdd(ctx context.Context, key, member string, score float64) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.ZAdd(opCtx, key, redis.Z{
		Score:  score,
		Member: member,
	}).Err()
}

// ZSetRemove removes a member from a sorted set.
func (a *Adapter) ZSetRemove(ctx context.Context, key, member string) error {
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return a.client.ZRem(opCtx, key, member).Err()
}
