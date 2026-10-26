package redis

import (
	"context"
	"time"

	"pebblebase/internal/schema"
)

// Introspect returns the virtual schema representation for Redis.
// In Redis, data is modeled as a primary "keys" virtual table containing:
//   - key (string, primary key)
//   - type (string, data structure type: string, hash, list, set, zset, stream)
//   - ttl (int, time to live in seconds, -1 = persist, -2 = expired/missing)
//   - size (int, memory footprint in bytes)
//   - value (string, string value or serialized preview)
func (a *Adapter) Introspect(ctx context.Context) ([]schema.Table, error) {
	introspectCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Verify connection is responsive
	if err := a.client.Ping(introspectCtx).Err(); err != nil {
		return nil, err
	}

	keysTable := schema.Table{
		Name: "keys",
		Columns: []schema.Column{
			{
				Name:         "key",
				Type:         "string",
				Nullable:     false,
				IsPrimaryKey: true,
			},
			{
				Name:         "type",
				Type:         "string",
				Nullable:     false,
				IsPrimaryKey: false,
			},
			{
				Name:         "ttl",
				Type:         "int",
				Nullable:     false,
				IsPrimaryKey: false,
			},
			{
				Name:         "size",
				Type:         "int",
				Nullable:     false,
				IsPrimaryKey: false,
			},
			{
				Name:         "value",
				Type:         "string",
				Nullable:     true,
				IsPrimaryKey: false,
			},
		},
		Relations: []schema.Relation{},
	}

	return []schema.Table{keysTable}, nil
}
