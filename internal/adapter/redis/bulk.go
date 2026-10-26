package redis

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

const defaultChunkSize = 500

// StreamRows streams keys and values in chunks of up to 500 records.
func (a *Adapter) StreamRows(
	ctx context.Context,
	table string,
	opts adapter.QueryOptions,
	onChunk func(columns []string, rows []map[string]any) error,
) error {
	streamCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	pattern := "*"
	for _, f := range opts.Filters {
		if strings.EqualFold(f.Column, "key") {
			pattern = fmt.Sprintf("%v", f.Value)
			if !strings.Contains(pattern, "*") {
				pattern = "*" + pattern + "*"
			}
		}
	}

	columns := []string{"key", "type", "ttl", "size", "value"}
	var cursor uint64

	for {
		keys, nextCursor, err := a.client.Scan(streamCtx, cursor, pattern, defaultChunkSize).Result()
		if err != nil {
			return fmt.Errorf("redis: stream scan: %w", err)
		}

		if len(keys) > 0 {
			pipe := a.client.Pipeline()
			typeCmds := make([]any, len(keys))
			ttlCmds := make([]any, len(keys))
			memCmds := make([]any, len(keys))
			getCmds := make([]any, len(keys))

			for i, k := range keys {
				typeCmds[i] = pipe.Type(streamCtx, k)
				ttlCmds[i] = pipe.TTL(streamCtx, k)
				memCmds[i] = pipe.MemoryUsage(streamCtx, k)
				getCmds[i] = pipe.Get(streamCtx, k)
			}
			_, _ = pipe.Exec(streamCtx)

			rows := make([]map[string]any, len(keys))
			for i, k := range keys {
				t := "string"
				if tCmd, ok := typeCmds[i].(interface{ Val() string }); ok {
					t = tCmd.Val()
				}
				ttlSec := int64(-1)
				if ttlCmd, ok := ttlCmds[i].(interface{ Val() time.Duration }); ok {
					d := ttlCmd.Val()
					if d > 0 {
						ttlSec = int64(d.Seconds())
					}
				}
				memBytes := int64(0)
				if mCmd, ok := memCmds[i].(interface{ Val() int64 }); ok {
					memBytes = mCmd.Val()
				}
				var val string
				if gCmd, ok := getCmds[i].(interface{ Val() string }); ok && t == "string" {
					val = gCmd.Val()
				} else {
					val = fmt.Sprintf("[%s]", t)
				}

				rows[i] = map[string]any{
					"key":   k,
					"type":  t,
					"ttl":   ttlSec,
					"size":  memBytes,
					"value": val,
				}
			}

			if err := onChunk(columns, rows); err != nil {
				return err
			}
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return nil
}

// BulkInsert inserts keys in batches using Redis pipeline.
func (a *Adapter) BulkInsert(ctx context.Context, table string, columns []string, records [][]any) (int64, error) {
	if len(records) == 0 {
		return 0, nil
	}

	keyIdx := -1
	valIdx := -1
	for i, col := range columns {
		if strings.EqualFold(col, "key") {
			keyIdx = i
		} else if strings.EqualFold(col, "value") {
			valIdx = i
		}
	}

	if keyIdx == -1 {
		return 0, fmt.Errorf("redis: bulk insert requires a 'key' column")
	}

	insertCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	pipe := a.client.Pipeline()
	var inserted int64

	for _, row := range records {
		if keyIdx >= len(row) || row[keyIdx] == nil {
			continue
		}
		key := fmt.Sprintf("%v", row[keyIdx])
		if key == "" {
			continue
		}

		val := ""
		if valIdx >= 0 && valIdx < len(row) && row[valIdx] != nil {
			val = fmt.Sprintf("%v", row[valIdx])
		}

		pipe.Set(insertCtx, key, val, 0)
		inserted++
	}

	if _, err := pipe.Exec(insertCtx); err != nil {
		return 0, fmt.Errorf("redis: bulk insert pipeline: %w", err)
	}

	return inserted, nil
}
