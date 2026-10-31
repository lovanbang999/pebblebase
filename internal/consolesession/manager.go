// Package consolesession owns the lifetime of pinned console transactions.
package consolesession

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"sync"
	"time"

	"pebblebase/internal/adapter"
)

var ErrUnavailable = errors.New("console session unavailable")
var ErrAborted = errors.New("transaction aborted: rollback required")
var ErrTabInUse = errors.New("console tab already has a session")
var ErrCapacity = errors.New("console session capacity reached")

// Transaction must release its pinned connection when Commit or Rollback returns.
type Transaction interface {
	ExecuteRaw(context.Context, string) (adapter.RawQueryResult, error)
	Commit(context.Context) error
	Rollback(context.Context) error
}

type session struct {
	owner, tab  string
	transaction Transaction
	touched     time.Time
	aborted     bool
}

// Manager serializes operations with cleanup so an expired session cannot execute.
type Manager struct {
	mu             sync.Mutex
	sessions       map[string]*session
	perUser, total int
	idle           time.Duration
	now            func() time.Time
	closed         bool
}

func New(perUser, total int) *Manager {
	return &Manager{sessions: make(map[string]*session), perUser: perUser, total: total, idle: 5 * time.Minute, now: time.Now}
}

// Begin reserves capacity before acquiring a transaction. The factory must honor ctx.
func (m *Manager) Begin(ctx context.Context, owner, tab string, factory func(context.Context) (Transaction, error)) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed || owner == "" || tab == "" {
		return "", ErrUnavailable
	}
	count := 0
	for _, s := range m.sessions {
		if s.owner == owner {
			count++
			if s.tab == tab {
				return "", ErrTabInUse
			}
		}
	}
	if count >= m.perUser || len(m.sessions) >= m.total {
		return "", ErrCapacity
	}
	var token [32]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", err
	}
	tx, err := factory(ctx)
	if err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		m.rollback(&session{transaction: tx})
		return "", err
	}
	id := hex.EncodeToString(token[:])
	log.Printf("console_session event=begin active=%d", len(m.sessions)+1)
	m.sessions[id] = &session{owner: owner, tab: tab, transaction: tx, touched: m.now()}
	return id, nil
}

func (m *Manager) owned(id, owner string) (*session, error) {
	s := m.sessions[id]
	if s == nil || s.owner != owner {
		return nil, ErrUnavailable
	}
	if m.now().Sub(s.touched) >= m.idle {
		delete(m.sessions, id)
		m.rollback(s)
		return nil, ErrUnavailable
	}
	return s, nil
}

func (m *Manager) Execute(ctx context.Context, id, owner, query string) (adapter.RawQueryResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, err := m.owned(id, owner)
	if err != nil {
		return adapter.RawQueryResult{}, err
	}
	if s.aborted {
		return adapter.RawQueryResult{}, ErrAborted
	}
	defer func() {
		if p := recover(); p != nil {
			delete(m.sessions, id)
			m.rollback(s)
			panic(p)
		}
	}()
	s.touched = m.now()
	result, err := s.transaction.ExecuteRaw(ctx, query)
	s.touched = m.now()
	if err != nil || ctx.Err() != nil {
		s.aborted = true
		if ctx.Err() != nil {
			delete(m.sessions, id)
			m.rollback(s)
		}
		return adapter.RawQueryResult{}, ErrAborted
	}
	return result, err
}

// Finish removes the session even when the database reports a commit failure.
func (m *Manager) Finish(ctx context.Context, id, owner string, commit bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, err := m.owned(id, owner)
	if err != nil {
		return err
	}
	if commit && s.aborted {
		return ErrAborted
	}
	delete(m.sessions, id)
	log.Printf("console_session event=finish commit=%t active=%d", commit, len(m.sessions))
	defer func() {
		if p := recover(); p != nil {
			m.rollback(s)
			panic(p)
		}
	}()
	if commit {
		err = s.transaction.Commit(ctx)
		if err != nil {
			m.rollback(s)
		}
		return err
	}
	return s.transaction.Rollback(ctx)
}

func (m *Manager) rollback(s *session) {
	defer func() {
		if recover() != nil {
			log.Printf("console_session event=rollback_panic")
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	log.Printf("console_session event=rollback")
	_ = s.transaction.Rollback(ctx)
}

func (m *Manager) Expire() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.sessions {
		if m.now().Sub(s.touched) >= m.idle {
			delete(m.sessions, id)
			m.rollback(s)
		}
	}
}

func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	for id, s := range m.sessions {
		delete(m.sessions, id)
		m.rollback(s)
	}
}

// Run periodically rolls back idle transactions until shutdown.
func (m *Manager) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	defer m.Close()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.Expire()
		}
	}
}
