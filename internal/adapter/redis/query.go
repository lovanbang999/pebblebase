package redis

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"pebblebase/internal/adapter"
)

// Query fetches Redis keys using non-blocking SCAN iteration, retrieving metadata
// (type, TTL, memory usage, value preview) in a pipelined batch.
func (a *Adapter) Query(ctx context.Context, table string, opts adapter.QueryOptions) (adapter.QueryResult, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := opts.Offset
	if offset < 0 {
		offset = 0
	}

	// Extract match pattern from filters
	pattern := "*"
	typeFilter := ""
	valueFilter := ""
	valueContains := false

	for _, f := range opts.Filters {
		col := strings.ToLower(strings.TrimSpace(f.Column))
		valStr := fmt.Sprintf("%v", f.Value)
		switch col {
		case "key":
			switch f.Operator {
			case "eq":
				pattern = valStr
			case "contains":
				pattern = "*" + strings.Trim(valStr, "*") + "*"
			default:
				if strings.Contains(valStr, "*") {
					pattern = valStr
				} else {
					pattern = "*" + valStr + "*"
				}
			}
		case "type":
			typeFilter = strings.ToLower(strings.TrimSpace(valStr))
		case "value":
			if f.Operator == "eq" || f.Operator == "contains" {
				valueFilter = valStr
				valueContains = f.Operator == "contains"
			}
		}
	}

	// Estimate total count using DBSIZE if scanning without key filter
	var totalCount int
	if pattern == "*" && typeFilter == "" {
		if dbsize, err := a.client.DBSize(queryCtx).Result(); err == nil {
			totalCount = int(dbsize)
		}
	}

	// Non-blocking scan across keyspace
	var matchedKeys []string
	var cursor uint64
	maxScanKeys := 10000 // Safeguard against scanning excessive keys in a single query

	for {
		keys, nextCursor, err := a.client.Scan(queryCtx, cursor, pattern, 250).Result()
		if err != nil {
			return adapter.QueryResult{}, fmt.Errorf("redis: scan failed: %w", err)
		}

		matchedKeys = append(matchedKeys, keys...)
		cursor = nextCursor

		if cursor == 0 || len(matchedKeys) >= maxScanKeys {
			break
		}
	}

	// If filtering by type, filter out non-matching keys
	if typeFilter != "" {
		filtered := make([]string, 0, len(matchedKeys))
		pipe := a.client.Pipeline()
		typeCmds := make([]*redis.StatusCmd, len(matchedKeys))
		for i, k := range matchedKeys {
			typeCmds[i] = pipe.Type(queryCtx, k)
		}
		_, _ = pipe.Exec(queryCtx)

		for i, cmd := range typeCmds {
			if strings.EqualFold(cmd.Val(), typeFilter) {
				filtered = append(filtered, matchedKeys[i])
			}
		}
		matchedKeys = filtered
	}
	if valueFilter != "" {
		filtered := make([]string, 0, len(matchedKeys))
		for start := 0; start < len(matchedKeys); start += 200 {
			end := start + 200
			if end > len(matchedKeys) {
				end = len(matchedKeys)
			}
			pipe := a.client.Pipeline()
			commands := make([]*redis.StringCmd, 0, end-start)
			for _, key := range matchedKeys[start:end] {
				if typ, err := a.client.Type(queryCtx, key).Result(); err == nil && typ == "string" {
					if size, err := a.client.StrLen(queryCtx, key).Result(); err == nil && size <= 4096 {
						commands = append(commands, pipe.Get(queryCtx, key))
					} else {
						commands = append(commands, nil)
					}
				} else {
					commands = append(commands, nil)
				}
			}
			_, _ = pipe.Exec(queryCtx)
			for offset, command := range commands {
				if command == nil {
					continue
				}
				text, err := command.Result()
				matched := strings.EqualFold(text, valueFilter)
				if valueContains {
					matched = strings.Contains(strings.ToLower(text), strings.ToLower(valueFilter))
				}
				if err == nil && matched {
					filtered = append(filtered, matchedKeys[start+offset])
				}
			}
		}
		matchedKeys = filtered
	}

	if totalCount == 0 || pattern != "*" || typeFilter != "" || valueFilter != "" {
		totalCount = len(matchedKeys)
	}

	// Sort keys if requested
	if opts.SortBy == "key" {
		if opts.SortDesc {
			sort.Slice(matchedKeys, func(i, j int) bool {
				return matchedKeys[i] > matchedKeys[j]
			})
		} else {
			sort.Strings(matchedKeys)
		}
	}

	// Apply pagination window
	if offset > len(matchedKeys) {
		return adapter.QueryResult{
			Rows:       []map[string]any{},
			TotalCount: totalCount,
		}, nil
	}

	end := offset + limit
	if end > len(matchedKeys) {
		end = len(matchedKeys)
	}
	pagedKeys := matchedKeys[offset:end]

	if len(pagedKeys) == 0 {
		return adapter.QueryResult{
			Rows:       []map[string]any{},
			TotalCount: totalCount,
		}, nil
	}

	// Fetch key details concurrently via pipeline
	pipe := a.client.Pipeline()
	typeCmds := make([]*redis.StatusCmd, len(pagedKeys))
	ttlCmds := make([]*redis.DurationCmd, len(pagedKeys))
	memCmds := make([]*redis.IntCmd, len(pagedKeys))
	getCmds := make([]*redis.StringCmd, len(pagedKeys))

	for i, k := range pagedKeys {
		typeCmds[i] = pipe.Type(queryCtx, k)
		ttlCmds[i] = pipe.TTL(queryCtx, k)
		memCmds[i] = pipe.MemoryUsage(queryCtx, k)
		getCmds[i] = pipe.Get(queryCtx, k)
	}

	_, _ = pipe.Exec(queryCtx)

	rows := make([]map[string]any, len(pagedKeys))
	for i, k := range pagedKeys {
		keyType := typeCmds[i].Val()
		if keyType == "" {
			keyType = "none"
		}

		ttlSec := int64(-1)
		if dur, err := ttlCmds[i].Result(); err == nil {
			switch dur {
			case -1 * time.Second:
				ttlSec = -1 // No expiration
			case -2 * time.Second:
				ttlSec = -2 // Key does not exist
			default:
				ttlSec = int64(dur.Seconds())
			}
		}

		memBytes := int64(0)
		if m, err := memCmds[i].Result(); err == nil {
			memBytes = m
		}

		var valuePreview string
		if keyType == "string" {
			if val, err := getCmds[i].Result(); err == nil {
				valuePreview = val
			}
		} else {
			valuePreview = fmt.Sprintf("[%s]", keyType)
		}

		rows[i] = map[string]any{
			"key":   k,
			"type":  keyType,
			"ttl":   ttlSec,
			"size":  memBytes,
			"value": valuePreview,
		}
	}

	return adapter.QueryResult{
		Rows:       rows,
		TotalCount: totalCount,
	}, nil
}
