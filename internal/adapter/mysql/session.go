package mysql

import (
	"context"

	"pebblebase/internal/adapter"
	"pebblebase/internal/consolesession"
	"sync"
)

type consoleTransaction struct {
	tx interface {
		rawExecutor
		Commit() error
		Rollback() error
	}
	conn   interface{ Close() error }
	cancel context.CancelFunc
	once   sync.Once
}

func (a *MySQLAdapter) BeginConsoleSession(ctx context.Context) (consolesession.Transaction, error) {
	conn, err := a.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	// The transaction outlives the begin HTTP request. Its owner explicitly cancels it.
	lifetime, cancel := context.WithCancel(context.Background())
	stopBeginCancellation := context.AfterFunc(ctx, cancel)
	defer stopBeginCancellation()
	transferred := false
	defer func() {
		if !transferred {
			cancel()
			_ = conn.Close()
		}
	}()
	tx, err := conn.BeginTx(lifetime, nil)
	if err != nil {
		return nil, err
	}
	if err = ctx.Err(); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	transferred = true
	return &consoleTransaction{tx: tx, conn: conn, cancel: cancel}, nil
}
func (t *consoleTransaction) release() { t.once.Do(func() { t.cancel(); _ = t.conn.Close() }) }
func (t *consoleTransaction) ExecuteRaw(ctx context.Context, query string) (adapter.RawQueryResult, error) {
	return executeRaw(ctx, t.tx, query)
}
func (t *consoleTransaction) Commit(ctx context.Context) error {
	defer t.release()
	return t.tx.Commit()
}
func (t *consoleTransaction) Rollback(context.Context) error {
	defer t.release()
	return t.tx.Rollback()
}
