package api

import (
	"context"
	"errors"
	"net/http/httptest"
	"pebblebase/internal/adapter"
	"pebblebase/internal/consolesession"
	"pebblebase/internal/storage"
	"strings"
	"testing"
)

type sessionTestTransaction struct{ calls, rollbacks int }

func (t *sessionTestTransaction) ExecuteRaw(context.Context, string) (adapter.RawQueryResult, error) {
	t.calls++
	return adapter.RawQueryResult{}, nil
}
func (t *sessionTestTransaction) Commit(context.Context) error   { return nil }
func (t *sessionTestTransaction) Rollback(context.Context) error { t.rollbacks++; return nil }
func TestConsoleSessionHTTPExecuteAndClose(t *testing.T) {
	manager := consolesession.New(4, 16)
	defer manager.Close()
	tx := &sessionTestTransaction{}
	id, err := manager.Begin(context.Background(), "local-desktop", "tab", func(context.Context) (consolesession.Transaction, error) { return tx, nil })
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{consoleSessions: manager}
	req := httptest.NewRequest("POST", "/api/console-sessions/"+id+"/query", strings.NewReader(`{"query":"SELECT 1"}`))
	req.SetPathValue("session", id)
	w := httptest.NewRecorder()
	server.executeConsoleSession(w, req)
	if w.Code != 200 || tx.calls != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
	req = httptest.NewRequest("DELETE", "/api/console-sessions/"+id, nil)
	req.SetPathValue("session", id)
	w = httptest.NewRecorder()
	server.finishConsoleSession(w, req)
	if w.Code != 200 || tx.rollbacks != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestConsoleSessionHTTPErrorShapes(t *testing.T) {
	for _, err := range []error{consolesession.ErrUnavailable, consolesession.ErrCapacity, consolesession.ErrTabInUse, consolesession.ErrAborted, errors.New("password=secret SQL parameter")} {
		w := httptest.NewRecorder()
		sessionError(w, err)
		if strings.Contains(w.Body.String(), "secret") {
			t.Fatal("leaked credentials")
		}
		expected := 400
		switch err {
		case consolesession.ErrUnavailable:
			expected = 404
		case consolesession.ErrCapacity:
			expected = 429
		case consolesession.ErrTabInUse, consolesession.ErrAborted:
			expected = 409
		}
		if w.Code != expected {
			t.Fatal(w.Code, expected)
		}
	}
}
func TestConsoleSessionManualStatementBoundary(t *testing.T) {
	tx := &sessionTestTransaction{}
	wrapper := &ownedConsoleTransaction{Transaction: tx, check: func() bool { return true }}
	for _, query := range []string{"END", "ABORT", "XA COMMIT x", "COMMIT", "SET autocommit=1", "CREATE TABLE x(id int)", "SELECT 1; DELETE FROM x", "/*! COMMIT */"} {
		if _, err := wrapper.ExecuteRaw(context.Background(), query); err == nil {
			t.Fatalf("accepted %q", query)
		}
	}
	for _, query := range []string{"UPDATE x SET id=1;", "SELECT ';'"} {
		if _, err := wrapper.ExecuteRaw(context.Background(), query); err != nil {
			t.Fatal(err)
		}
	}
	wrapper.check = func() bool { return false }
	if _, err := wrapper.ExecuteRaw(context.Background(), "UPDATE x SET id=2"); err == nil {
		t.Fatal("read-only bypass")
	}
}

func TestConsoleSessionBeginGuards(t *testing.T) {
	enc, err := storage.NewEncryptor(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	store, err := storage.NewStore(t.TempDir(), enc)
	if err != nil {
		t.Fatal(err)
	}
	manager := consolesession.New(4, 16)
	defer manager.Close()
	server := &Server{store: store, consoleSessions: manager}
	for _, test := range []struct {
		engine string
		ro     bool
		status int
	}{{"postgres", true, 403}, {"mysql", true, 403}, {"mongodb", false, 400}, {"redis", false, 400}} {
		rec, err := store.Save("test", test.engine, "host", "1234", "user", "db", "unused", true, storage.SaveParams{ReadOnly: test.ro})
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest("POST", "/api/connections/"+rec.ID+"/console-sessions", strings.NewReader(`{"tab_id":"tab"}`))
		req.SetPathValue("id", rec.ID)
		w := httptest.NewRecorder()
		server.beginConsoleSession(w, req)
		if w.Code != test.status {
			t.Fatal(test.engine, w.Code, w.Body.String())
		}
	}
	rec, err := store.Save("test", "postgres", "host", "1234", "user", "db", "unused", true)
	if err != nil {
		t.Fatal(err)
	}
	_, err = manager.Begin(context.Background(), "local-desktop", "tab", func(context.Context) (consolesession.Transaction, error) { return &sessionTestTransaction{}, nil })
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/api/connections/"+rec.ID+"/console-sessions", strings.NewReader(`{"tab_id":"tab"}`))
	req.SetPathValue("id", rec.ID)
	w := httptest.NewRecorder()
	server.beginConsoleSession(w, req)
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
}
