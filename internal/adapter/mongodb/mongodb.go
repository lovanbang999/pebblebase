// Package mongodb implements the unified adapter.Adapter interface for MongoDB.
package mongodb

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"pebblebase/internal/adapter"
)

// Ensure Adapter implements adapter.Adapter at compile time.
var _ adapter.Adapter = (*Adapter)(nil)

// Adapter implements adapter.Adapter for MongoDB.
type Adapter struct {
	client *mongo.Client
	db     *mongo.Database
	dbName string
}

// New connects to a MongoDB server using the given URI.
// It parses the URI to identify the target database, establishes a connection,
// and verifies it with a ping within a 5-second timeout.
func New(ctx context.Context, uri string) (*Adapter, error) {
	dbName, err := extractDatabaseName(uri)
	if err != nil {
		return nil, fmt.Errorf("mongodb: %w", err)
	}

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("mongodb: connect: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := client.Ping(pingCtx, readpref.Primary()); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("mongodb: ping: %w", err)
	}

	return &Adapter{
		client: client,
		db:     client.Database(dbName),
		dbName: dbName,
	}, nil
}

// Ping verifies the MongoDB connection is still alive.
func (a *Adapter) Ping(ctx context.Context) error {
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return a.client.Ping(pingCtx, readpref.Primary())
}

// Close closes the MongoDB connection.
func (a *Adapter) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return a.client.Disconnect(ctx)
}

// DatabaseName returns the name of the connected database.
func (a *Adapter) DatabaseName() string {
	return a.dbName
}

// extractDatabaseName parses a MongoDB URI to extract the database path component.
func extractDatabaseName(rawURI string) (string, error) {
	u, err := url.Parse(rawURI)
	if err != nil {
		return "", fmt.Errorf("invalid URI: %w", err)
	}
	dbName := strings.TrimPrefix(u.Path, "/")
	if idx := strings.Index(dbName, "/"); idx != -1 {
		dbName = dbName[:idx]
	}
	if dbName == "" {
		return "", fmt.Errorf("URI does not specify a database name")
	}
	return dbName, nil
}
