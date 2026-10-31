package mysql

import (
	"context"
	"database/sql"
	"errors"
	"testing"
)

type pinnedFake struct {
	rawExecutor
	executions  int
	panicCommit bool
}

func (f *pinnedFake) ExecContext(context.Context, string, ...any) (sql.Result, error) {
	f.executions++
	return nil, nil
}
func (f *pinnedFake) Commit() error {
	if f.panicCommit {
		panic("commit panic")
	}
	return errors.New("commit failure")
}
func (f *pinnedFake) Rollback() error { return nil }

type closeFake struct{ closes int }

func (f *closeFake) Close() error { f.closes++; return nil }
func TestConsolePinnedTransactionRelease(t *testing.T) {
	for _, panics := range []bool{false, true} {
		tx := &pinnedFake{panicCommit: panics}
		conn := &closeFake{}
		ctx, cancel := context.WithCancel(context.Background())
		session := &consoleTransaction{tx: tx, conn: conn, cancel: cancel}
		for range 2 {
			if _, err := session.ExecuteRaw(context.Background(), "UPDATE x SET id=1"); err != nil {
				t.Fatal(err)
			}
		}
		func() {
			defer func() {
				if panics && recover() == nil {
					t.Error("expected panic")
				}
			}()
			_ = session.Commit(context.Background())
		}()
		_ = session.Rollback(context.Background())
		if tx.executions != 2 || conn.closes != 1 || ctx.Err() == nil {
			t.Fatal("transaction not pinned or released exactly once")
		}
	}
}
