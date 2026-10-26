package redis

import (
	"context"
	"fmt"
	"time"

	"pebblebase/internal/adapter"
)

// Aggregate performs metrics or distribution calculations across Redis keys.
func (a *Adapter) Aggregate(ctx context.Context, table string, opts adapter.AggregateOptions) (adapter.AggregateResult, error) {
	aggCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	dbsize, _ := a.client.DBSize(aggCtx).Result()

	if opts.Function == "distribution" && opts.Column == "type" {
		typeCounts := make(map[string]int)

		// Sample up to 1000 keys to compute distribution without lag
		keys, _, err := a.client.Scan(aggCtx, 0, "*", 1000).Result()
		if err == nil && len(keys) > 0 {
			pipe := a.client.Pipeline()
			cmds := make([]any, len(keys))
			for i, k := range keys {
				cmds[i] = pipe.Type(aggCtx, k)
			}
			_, _ = pipe.Exec(aggCtx)

			for _, rawCmd := range cmds {
				if tCmd, ok := rawCmd.(interface{ Val() string }); ok {
					t := tCmd.Val()
					if t != "" {
						typeCounts[t]++
					}
				}
			}
		}

		labels := make([]string, 0, len(typeCounts))
		values := make([]any, 0, len(typeCounts))
		for k, v := range typeCounts {
			labels = append(labels, k)
			values = append(values, v)
		}

		return adapter.AggregateResult{
			Labels: labels,
			Values: values,
			Stats: map[string]any{
				"total_keys": dbsize,
				"sampled":    len(keys),
			},
		}, nil
	}

	// Default count / stats
	return adapter.AggregateResult{
		Labels: []string{"Total Keys"},
		Values: []any{dbsize},
		Stats: map[string]any{
			"total_count": dbsize,
			"database":    fmt.Sprintf("db%d", a.dbIndex),
		},
	}, nil
}
