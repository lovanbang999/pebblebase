package redis

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"pebblebase/internal/adapter"
)

// ExecuteRaw executes an arbitrary raw Redis command (e.g. GET key, HGETALL hash, INFO memory).
// Results are formatted into a tabular RawQueryResult suitable for the QueryConsole and DataGrid.
func (a *Adapter) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	start := time.Now()

	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return adapter.RawQueryResult{
			Columns:         []string{"result"},
			Rows:            []map[string]any{},
			ExecutionTimeMs: adapter.ElapsedMs(start),
		}, nil
	}

	args, err := parseCommandArgs(trimmed)
	if err != nil {
		return adapter.RawQueryResult{}, fmt.Errorf("redis: parse command error: %w", err)
	}
	if len(args) == 0 {
		return adapter.RawQueryResult{
			Columns:         []string{"result"},
			Rows:            []map[string]any{},
			ExecutionTimeMs: adapter.ElapsedMs(start),
		}, nil
	}

	cmdName := strings.ToUpper(args[0])
	isMutation := isMutationCommand(cmdName)

	rawCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmdArgs := make([]any, len(args))
	for i, arg := range args {
		cmdArgs[i] = arg
	}

	val, err := a.client.Do(rawCtx, cmdArgs...).Result()
	elapsed := adapter.ElapsedMs(start)
	if err != nil {
		return adapter.RawQueryResult{
			ExecutionTimeMs: elapsed,
			IsMutation:      isMutation,
		}, err
	}

	columns, rows, rowsAffected := formatRedisResult(cmdName, val)

	return adapter.RawQueryResult{
		Columns:         columns,
		Rows:            rows,
		ExecutionTimeMs: elapsed,
		RowsAffected:    rowsAffected,
		IsMutation:      isMutation,
	}, nil
}

// isMutationCommand returns true if the command mutates keys or data in Redis.
func isMutationCommand(cmd string) bool {
	switch cmd {
	case "SET", "SETEX", "SETNX", "MSET", "MSETNX", "GETSET",
		"INCR", "DECR", "INCRBY", "DECRBY", "INCRBYFLOAT", "APPEND",
		"DEL", "UNLINK", "EXPIRE", "PEXPIRE", "EXPIREAT", "PERSIST",
		"HSET", "HSETNX", "HDEL", "HINCRBY", "HINCRBYFLOAT",
		"LPUSH", "LPUSHX", "RPUSH", "RPUSHX", "LPOP", "RPOP", "LSET", "LTRIM", "LREM",
		"SADD", "SREM", "SPOP", "SMOVE",
		"ZADD", "ZREM", "ZINCRBY", "ZREMRANGEBYRANK", "ZREMRANGEBYSCORE",
		"XADD", "XDEL", "XTRIM",
		"FLUSHDB", "FLUSHALL", "RENAME", "RENAMENX":
		return true
	default:
		return false
	}
}

// parseCommandArgs parses a space-separated command string while respecting quoted strings.
func parseCommandArgs(command string) ([]string, error) {
	var args []string
	var current strings.Builder
	inQuotes := false
	quoteChar := byte(0)
	escaped := false
	started := false

	for i := 0; i < len(command); i++ {
		b := command[i]

		if escaped {
			current.WriteByte(b)
			escaped = false
			continue
		}

		if b == '\\' {
			started = true
			escaped = true
			continue
		}

		if inQuotes {
			if b == quoteChar {
				inQuotes = false
				quoteChar = 0
			} else {
				current.WriteByte(b)
			}
			continue
		}

		if b == '"' || b == '\'' {
			inQuotes = true
			started = true
			quoteChar = b
			continue
		}

		if b == ' ' || b == '\t' || b == '\n' || b == '\r' {
			if started || current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
				started = false
			}
			continue
		}

		current.WriteByte(b)
	}

	if escaped {
		return nil, fmt.Errorf("dangling escape in command")
	}
	if inQuotes {
		return nil, fmt.Errorf("unclosed quote in command")
	}

	if started || current.Len() > 0 {
		args = append(args, current.String())
	}

	return args, nil
}

// formatRedisResult transforms various Redis return types into tabular columns and rows.
func formatRedisResult(cmd string, val any) ([]string, []map[string]any, int64) {
	if val == nil {
		return []string{"result"}, []map[string]any{{"result": "(nil)"}}, 0
	}

	switch v := val.(type) {
	case string:
		// Check if it is an INFO response
		if cmd == "INFO" || strings.Contains(v, "#") && strings.Contains(v, ":") {
			lines := strings.Split(v, "\n")
			rows := make([]map[string]any, 0, len(lines))
			currentSection := "general"

			for _, l := range lines {
				l = strings.TrimSpace(l)
				if l == "" {
					continue
				}
				if strings.HasPrefix(l, "#") {
					currentSection = strings.TrimSpace(strings.TrimPrefix(l, "#"))
					continue
				}
				parts := strings.SplitN(l, ":", 2)
				if len(parts) == 2 {
					rows = append(rows, map[string]any{
						"section":  currentSection,
						"property": strings.TrimSpace(parts[0]),
						"value":    strings.TrimSpace(parts[1]),
					})
				}
			}
			return []string{"section", "property", "value"}, rows, int64(len(rows))
		}

		return []string{"result"}, []map[string]any{{"result": v}}, 1

	case int64:
		return []string{"result"}, []map[string]any{{"result": v}}, v

	case int:
		return []string{"result"}, []map[string]any{{"result": v}}, int64(v)

	case bool:
		return []string{"result"}, []map[string]any{{"result": v}}, 1

	case []any:
		// If command is HGETALL, it returns alternating field and value pairs: [f1, v1, f2, v2]
		if cmd == "HGETALL" && len(v)%2 == 0 {
			rows := make([]map[string]any, 0, len(v)/2)
			for i := 0; i < len(v); i += 2 {
				rows = append(rows, map[string]any{
					"field": fmt.Sprintf("%v", v[i]),
					"value": fmt.Sprintf("%v", v[i+1]),
				})
			}
			return []string{"field", "value"}, rows, int64(len(rows))
		}

		rows := make([]map[string]any, len(v))
		for i, item := range v {
			rows[i] = map[string]any{
				"index": i + 1,
				"value": item,
			}
		}
		return []string{"index", "value"}, rows, int64(len(rows))

	case map[string]string:
		rows := make([]map[string]any, 0, len(v))
		for k, item := range v {
			rows = append(rows, map[string]any{
				"field": k,
				"value": item,
			})
		}
		return []string{"field", "value"}, rows, int64(len(rows))

	case map[any]any:
		rows := make([]map[string]any, 0, len(v))
		for k, item := range v {
			rows = append(rows, map[string]any{
				"field": fmt.Sprintf("%v", k),
				"value": fmt.Sprintf("%v", item),
			})
		}
		return []string{"field", "value"}, rows, int64(len(rows))

	default:
		s := fmt.Sprintf("%v", v)
		if n, err := strconv.ParseInt(s, 10, 64); err == nil {
			return []string{"result"}, []map[string]any{{"result": s}}, n
		}
		return []string{"result"}, []map[string]any{{"result": s}}, 1
	}
}
