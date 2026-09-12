package connection_test

import (
	"strings"
	"testing"

	"pebblebase/internal/connection"
)

func TestToDSN_Postgres_Form(t *testing.T) {
	cases := []struct {
		name    string
		input   connection.ConnectionInput
		want    string // substring that must appear in the DSN
		wantErr bool
	}{
		{
			name: "all fields",
			input: connection.ConnectionInput{
				Type: "postgres", Mode: "form",
				Host: "localhost", Port: "5432",
				User: "alice", Password: "secret", DBName: "mydb",
			},
			want: "postgres://alice:secret@localhost:5432/mydb",
		},
		{
			name: "default port applied",
			input: connection.ConnectionInput{
				Type: "postgres", Mode: "form",
				Host: "db.example.com", User: "bob", DBName: "prod",
			},
			want: "5432",
		},
		{
			name: "sslmode present",
			input: connection.ConnectionInput{
				Type: "postgres", Mode: "form",
				Host: "localhost", User: "u", DBName: "d",
			},
			want: "sslmode=prefer",
		},
		{
			name:    "missing host",
			input:   connection.ConnectionInput{Type: "postgres", Mode: "form", User: "u", DBName: "d"},
			wantErr: true,
		},
		{
			name:    "missing database",
			input:   connection.ConnectionInput{Type: "postgres", Mode: "form", Host: "h", User: "u"},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.input.ToDSN()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("ToDSN() expected error, got nil (dsn=%q)", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("ToDSN() unexpected error: %v", err)
			}
			if !strings.Contains(got, tc.want) {
				t.Errorf("ToDSN() = %q, want substring %q", got, tc.want)
			}
		})
	}
}

func TestToDSN_MySQL_Form(t *testing.T) {
	input := connection.ConnectionInput{
		Type: "mysql", Mode: "form",
		Host: "localhost", Port: "3306",
		User: "root", Password: "pass", DBName: "shop",
	}
	got, err := input.ToDSN()
	if err != nil {
		t.Fatalf("ToDSN() error: %v", err)
	}
	for _, sub := range []string{"root:pass", "tcp(localhost:3306)", "shop", "utf8mb4", "parseTime=true"} {
		if !strings.Contains(got, sub) {
			t.Errorf("ToDSN() = %q, missing expected substring %q", got, sub)
		}
	}
}

func TestToDSN_MongoDB_Form(t *testing.T) {
	input := connection.ConnectionInput{
		Type: "mongodb", Mode: "form",
		Host: "localhost", User: "admin", Password: "secret", DBName: "logs",
	}
	got, err := input.ToDSN()
	if err != nil {
		t.Fatalf("ToDSN() error: %v", err)
	}
	for _, sub := range []string{"mongodb://", "localhost:27017", "logs"} {
		if !strings.Contains(got, sub) {
			t.Errorf("ToDSN() = %q, missing expected substring %q", got, sub)
		}
	}
}

func TestToDSN_RawURL(t *testing.T) {
	raw := "postgres://user:pass@remote:5432/prod?sslmode=require"
	input := connection.ConnectionInput{
		Type: "postgres", Mode: "url",
		RawURL: raw,
	}
	got, err := input.ToDSN()
	if err != nil {
		t.Fatalf("ToDSN() error: %v", err)
	}
	if got != raw {
		t.Errorf("ToDSN() = %q, want %q", got, raw)
	}
}

func TestToDSN_RawURL_Empty(t *testing.T) {
	input := connection.ConnectionInput{Type: "postgres", Mode: "url", RawURL: ""}
	_, err := input.ToDSN()
	if err == nil {
		t.Fatal("ToDSN() expected error for empty RawURL, got nil")
	}
}
