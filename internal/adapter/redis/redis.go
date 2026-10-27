package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"pebblebase/internal/adapter"
)

// Ensure Adapter implements adapter.Adapter and optional interfaces at compile time.
var (
	_ adapter.Adapter        = (*Adapter)(nil)
	_ adapter.RawRunner      = (*Adapter)(nil)
	_ adapter.StreamExporter = (*Adapter)(nil)
	_ adapter.BulkImporter   = (*Adapter)(nil)
	_ adapter.QueryExplainer = (*Adapter)(nil)
)

// Adapter implements adapter.Adapter for Redis (supporting Standalone, Cluster, and Sentinel).
type Adapter struct {
	client  redis.UniversalClient
	opts    *redis.UniversalOptions
	dbIndex int
	rawDSN  string
}

// New connects to Redis using the provided DSN and initializes a connection pool.
// It verifies the connection with an initial Ping using a 5-second timeout.
func New(ctx context.Context, dsn string) (*Adapter, error) {
	opts, dbIndex, err := parseRedisDSN(dsn)
	if err != nil {
		return nil, fmt.Errorf("redis: %w", err)
	}

	client := redis.NewUniversalClient(opts)

	// Validate connectivity with timeout
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("redis: ping: %w", err)
	}

	return &Adapter{
		client:  client,
		opts:    opts,
		dbIndex: dbIndex,
		rawDSN:  dsn,
	}, nil
}

// Ping verifies the Redis connection is still alive within a 5-second timeout.
func (a *Adapter) Ping(ctx context.Context) error {
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return a.client.Ping(pingCtx).Err()
}

// Close gracefully releases all connections in the Redis pool.
func (a *Adapter) Close() error {
	return a.client.Close()
}

// Client returns the underlying redis.UniversalClient.
func (a *Adapter) Client() redis.UniversalClient {
	return a.client
}

// Database returns the active Redis database index.
func (a *Adapter) Database() int {
	return a.dbIndex
}

// DatabaseName returns the logical name of the database, e.g., "db0".
func (a *Adapter) DatabaseName() string {
	return fmt.Sprintf("db%d", a.dbIndex)
}
