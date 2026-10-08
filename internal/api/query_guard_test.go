package api

import (
	"testing"
)

func TestIsMutatingQuery_SQL(t *testing.T) {
	tests := []struct {
		name     string
		query    string
		mutating bool
	}{
		// Standard reads (safe)
		{
			name:     "simple select",
			query:    "SELECT * FROM users WHERE id = 1",
			mutating: false,
		},
		{
			name:     "select with string literal containing mutation keyword",
			query:    "SELECT * FROM audit_logs WHERE action = 'DELETE' AND note = 'DROP TABLE'",
			mutating: false,
		},
		{
			name:     "show tables",
			query:    "SHOW TABLES;",
			mutating: false,
		},
		{
			name:     "describe table",
			query:    "DESCRIBE users;",
			mutating: false,
		},
		{
			name:     "sqlite pragma",
			query:    "PRAGMA table_info(users);",
			mutating: false,
		},
		{
			name:     "read-only CTE",
			query:    "WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT * FROM active_users;",
			mutating: false,
		},
		{
			name:     "explain query",
			query:    "EXPLAIN SELECT * FROM orders WHERE total > 100",
			mutating: false,
		},
		{
			name:     "leading whitespace and semicolons with select",
			query:    "   \n;  ; SELECT 1 + 1; ",
			mutating: false,
		},

		// Standard mutations
		{
			name:     "direct drop",
			query:    "DROP TABLE users;",
			mutating: true,
		},
		{
			name:     "direct delete",
			query:    "DELETE FROM users WHERE id = 1;",
			mutating: true,
		},
		{
			name:     "direct update",
			query:    "UPDATE users SET role = 'admin' WHERE id = 1;",
			mutating: true,
		},
		{
			name:     "direct insert",
			query:    "INSERT INTO users (username) VALUES ('hacker');",
			mutating: true,
		},
		{
			name:     "alter table",
			query:    "ALTER TABLE users ADD COLUMN is_admin INT;",
			mutating: true,
		},
		{
			name:     "truncate table",
			query:    "TRUNCATE TABLE logs;",
			mutating: true,
		},

		// Vulnerability bypass attempts (VULN-01)
		{
			name:     "block comment bypass",
			query:    "/* read-only */ DROP TABLE users;",
			mutating: true,
		},
		{
			name:     "sql line comment bypass",
			query:    "-- benign comment\nDELETE FROM users;",
			mutating: true,
		},
		{
			name:     "mysql hash comment bypass",
			query:    "# mysql comment\nTRUNCATE TABLE users;",
			mutating: true,
		},
		{
			name:     "CTE mutation bypass",
			query:    "WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted;",
			mutating: true,
		},
		{
			name:     "multi-statement with trailing drop",
			query:    "SELECT * FROM users; DROP TABLE users;",
			mutating: true,
		},
		{
			name:     "stored procedure call",
			query:    "CALL delete_all_records();",
			mutating: true,
		},
		{
			name:     "do block in postgres",
			query:    "DO $$ BEGIN DELETE FROM users; END $$;",
			mutating: true,
		},
		{
			name:     "select into table creation",
			query:    "SELECT * INTO users_backup FROM users;",
			mutating: true,
		},
		{
			name:     "explain analyze mutating query",
			query:    "EXPLAIN ANALYZE DELETE FROM users;",
			mutating: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isMutatingQuery("postgres", tt.query)
			if got != tt.mutating {
				t.Errorf("isMutatingQuery(%q) = %v, expected %v", tt.query, got, tt.mutating)
			}
		})
	}
}

func TestIsMutatingQuery_MongoDB(t *testing.T) {
	tests := []struct {
		name     string
		query    string
		mutating bool
	}{
		{
			name:     "mongo find (safe)",
			query:    "db.users.find({active: true})",
			mutating: false,
		},
		{
			name:     "mongo find json (safe)",
			query:    `{"find": "users", "filter": {}}`,
			mutating: false,
		},
		{
			name:     "mongo insertOne",
			query:    "db.users.insertOne({name: 'admin'})",
			mutating: true,
		},
		{
			name:     "mongo deleteMany",
			query:    "db.users.deleteMany({})",
			mutating: true,
		},
		{
			name:     "mongo drop collection",
			query:    "db.users.drop()",
			mutating: true,
		},
		{
			name:     "mongo json delete command",
			query:    `{"delete": "users", "deletes": [{}]}`,
			mutating: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isMutatingQuery("mongodb", tt.query)
			if got != tt.mutating {
				t.Errorf("isMutatingQuery(mongodb, %q) = %v, expected %v", tt.query, got, tt.mutating)
			}
		})
	}
}
