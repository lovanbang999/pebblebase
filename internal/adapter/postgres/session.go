package postgres

import (
	"context"
	"github.com/jackc/pgx/v5"

	"pebblebase/internal/adapter"
	"pebblebase/internal/consolesession"
	"sync"
)

type consoleTransaction struct {
	tx   pgx.Tx
	conn interface{ Release() }
	once sync.Once
}

func (a *PostgresAdapter) BeginConsoleSession(ctx context.Context) (consolesession.Transaction, error) {
	conn, err := a.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	transferred := false
	defer func() {
		if !transferred {
			conn.Release()
		}
	}()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, err
	}
	transferred = true
	return &consoleTransaction{tx: tx, conn: conn}, nil
}
func (t *consoleTransaction) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return executeRaw(ctx, t.tx, query)
}
func (t *consoleTransaction) Commit(ctx context.Context) error {
	defer t.once.Do(t.conn.Release)
	return t.tx.Commit(ctx)
}
func (t *consoleTransaction) Rollback(ctx context.Context) error {
	defer t.once.Do(t.conn.Release)
	return t.tx.Rollback(ctx)
}
