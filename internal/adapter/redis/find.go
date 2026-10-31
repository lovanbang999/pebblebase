package redis

import (
	"context"
	"strings"

	"pebblebase/internal/adapter"
)

// FindValues scans a bounded prefix of the keyspace and matches key names or
// small string values. It never reads collection values or writes to Redis.
func (a *Adapter) FindValues(ctx context.Context, value string, keyCap, sampleCap int) ([]adapter.ValueMatch, error) {
	if keyCap <= 0 || keyCap > 1000 {
		keyCap = 1000
	}
	if sampleCap <= 0 || sampleCap > 4 {
		sampleCap = 4
	}
	needle := strings.ToLower(value)
	byKey, byValue := []map[string]any{}, []map[string]any{}
	keyCount, valueCount := 0, 0
	seen := map[string]bool{}
	var cursor uint64
	examined := 0
	for examined < keyCap {
		keys, next, err := a.client.Scan(ctx, cursor, "*", 100).Result()
		if err != nil {
			return nil, err
		}
		for _, key := range keys {
			if examined >= keyCap {
				break
			}
			examined++
			if seen[key] {
				continue
			}
			seen[key] = true
			if strings.Contains(strings.ToLower(key), needle) {
				keyCount++
				if len(byKey) < sampleCap {
					byKey = append(byKey, map[string]any{"key": key})
				}
			}
			typ, err := a.client.Type(ctx, key).Result()
			if err != nil || typ != "string" {
				continue
			}
			length, err := a.client.StrLen(ctx, key).Result()
			if err != nil || length > 4096 {
				continue
			}
			text, err := a.client.Get(ctx, key).Result()
			if err == nil && strings.Contains(strings.ToLower(text), needle) {
				valueCount++
				if len(byValue) < sampleCap {
					byValue = append(byValue, map[string]any{"key": key, "value": text})
				}
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	out := []adapter.ValueMatch{}
	truncated := examined >= keyCap && cursor != 0
	if keyCount > 0 {
		out = append(out, adapter.ValueMatch{Table: "Keys", Count: keyCount, Column: "key", Rows: byKey, Truncated: truncated})
	}
	if valueCount > 0 {
		out = append(out, adapter.ValueMatch{Table: "String values", Count: valueCount, Column: "value", Rows: byValue, Truncated: truncated})
	}
	return out, nil
}
