package postgres

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"testing"
)

type pinnedFake struct {
	pgx.Tx
	executions, commits, rollbacks int
	panicCommit                    bool
}

func (f *pinnedFake) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	f.executions++
	return pgconn.NewCommandTag("UPDATE 1"), nil
}
func (f *pinnedFake) Commit(context.Context) error {
	f.commits++
	if f.panicCommit {
		panic("commit panic")
	}
	return errors.New("commit failure")
}
func (f *pinnedFake) Rollback(context.Context) error { f.rollbacks++; return nil }

type releaseFake struct{ releases int }

func (f *releaseFake) Release() { f.releases++ }
func TestConsolePinnedTransactionRelease(t *testing.T) {
	for _, panics := range []bool{false, true} {
		tx := &pinnedFake{panicCommit: panics}
		conn := &releaseFake{}
		session := &consoleTransaction{tx: tx, conn: conn}
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
		if tx.executions != 2 || conn.releases != 1 {
			t.Fatal("transaction not pinned or released exactly once")
		}
	}
}
