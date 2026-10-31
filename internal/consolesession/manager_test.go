package consolesession

import (
	"context"
	"errors"
	"testing"
	"time"

	"pebblebase/internal/adapter"
)

type fakeTransaction struct{ commits, rollbacks, executions int }

func (f *fakeTransaction) ExecuteRaw(context.Context, string) (adapter.RawQueryResult, error) {
	f.executions++
	return adapter.RawQueryResult{}, nil
}
func (f *fakeTransaction) Commit(context.Context) error   { f.commits++; return nil }
func (f *fakeTransaction) Rollback(context.Context) error { f.rollbacks++; return nil }

func TestOwnershipLifecycleAndCaps(t *testing.T) {
	ctx := context.Background()
	m := New(1, 2)
	tx := &fakeTransaction{}
	factory := func(context.Context) (Transaction, error) { return tx, nil }
	id, err := m.Begin(ctx, "alice", "tab", factory)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m.Execute(ctx, id, "bob", "SELECT 1"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("ownership bypass")
	}
	if err = m.Finish(ctx, id, "bob", true); !errors.Is(err, ErrUnavailable) {
		t.Fatal("foreign commit")
	}
	if _, err = m.Begin(ctx, "alice", "other", factory); !errors.Is(err, ErrCapacity) {
		t.Fatal("user cap")
	}
	if _, err = m.Begin(ctx, "bob", "tab", factory); err != nil {
		t.Fatal(err)
	}
	if _, err = m.Begin(ctx, "charlie", "tab", factory); !errors.Is(err, ErrCapacity) {
		t.Fatal("total cap")
	}
	if _, err = m.Execute(ctx, id, "alice", "SELECT 1"); err != nil {
		t.Fatal(err)
	}
	if err = m.Finish(ctx, id, "alice", true); err != nil || tx.commits != 1 {
		t.Fatal("commit failed")
	}
	m.Close()
	if tx.rollbacks != 1 {
		t.Fatal("shutdown did not roll back remaining session")
	}
}

func TestIdleExpiryAndExplicitRollback(t *testing.T) {
	ctx := context.Background()
	m := New(2, 2)
	now := time.Now()
	m.now = func() time.Time { return now }
	tx := &fakeTransaction{}
	factory := func(context.Context) (Transaction, error) { return tx, nil }
	id, err := m.Begin(ctx, "alice", "tab", factory)
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(5 * time.Minute)
	m.Expire()
	if tx.rollbacks != 1 {
		t.Fatal("expiry did not roll back")
	}
	if _, err = m.Execute(ctx, id, "alice", "SELECT 1"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("expired session usable")
	}
	id, err = m.Begin(ctx, "alice", "tab", factory)
	if err != nil {
		t.Fatal(err)
	}
	if err = m.Finish(ctx, id, "alice", false); err != nil || tx.rollbacks != 2 {
		t.Fatal("explicit rollback failed")
	}
}

type failingTransaction struct {
	fakeTransaction
	panicExecute bool
}

func (f *failingTransaction) ExecuteRaw(context.Context, string) (adapter.RawQueryResult, error) {
	if f.panicExecute {
		panic("driver panic")
	}
	return adapter.RawQueryResult{}, errors.New("sensitive driver details")
}
func TestSessionFailurePolicyAndTabUniqueness(t *testing.T) {
	ctx := context.Background()
	m := New(4, 16)
	defer m.Close()
	tx := &failingTransaction{}
	factory := func(context.Context) (Transaction, error) { return tx, nil }
	id, err := m.Begin(ctx, "a", "tab", factory)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m.Begin(ctx, "a", "tab", factory); !errors.Is(err, ErrTabInUse) {
		t.Fatal("duplicate tab accepted")
	}
	if _, err = m.Execute(ctx, id, "a", "bad"); !errors.Is(err, ErrAborted) {
		t.Fatal("error not sanitized")
	}
	if _, err = m.Execute(ctx, id, "a", "SELECT 1"); !errors.Is(err, ErrAborted) {
		t.Fatal("aborted transaction reused")
	}
	if err = m.Finish(ctx, id, "a", true); !errors.Is(err, ErrAborted) {
		t.Fatal("aborted commit accepted")
	}
	if err = m.Finish(ctx, id, "a", false); err != nil || tx.rollbacks != 1 {
		t.Fatal("rollback required failed")
	}
}
func TestSessionCancellationAndPanicCleanup(t *testing.T) {
	for _, panics := range []bool{false, true} {
		t.Run(map[bool]string{false: "cancel", true: "panic"}[panics], func(t *testing.T) {
			m := New(1, 1)
			defer m.Close()
			tx := &failingTransaction{panicExecute: panics}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			id, err := m.Begin(ctx, "a", "tab", func(context.Context) (Transaction, error) { return tx, nil })
			if err != nil {
				t.Fatal(err)
			}
			if !panics {
				cancel()
			}
			func() {
				defer func() {
					if panics && recover() == nil {
						t.Error("expected panic")
					}
				}()
				_, _ = m.Execute(ctx, id, "a", "SELECT 1")
			}()
			if tx.rollbacks != 1 {
				t.Fatal("connection not cleaned up")
			}
			if _, err = m.Execute(context.Background(), id, "a", "SELECT 1"); !errors.Is(err, ErrUnavailable) {
				t.Fatal("session survived")
			}
		})
	}
}
func TestSessionShutdownStopsBegin(t *testing.T) {
	m := New(1, 1)
	m.Close()
	if _, err := m.Begin(context.Background(), "a", "tab", func(context.Context) (Transaction, error) { t.Fatal("factory called"); return nil, nil }); !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
}
