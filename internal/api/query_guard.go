package api

import (
	"regexp"
	"strings"
)

var sqlTokenRegex = regexp.MustCompile(`[a-zA-Z0-9_]+`)

var mutatingSQLKeywords = map[string]bool{
	"INSERT":   true,
	"UPDATE":   true,
	"DELETE":   true,
	"DROP":     true,
	"ALTER":    true,
	"CREATE":   true,
	"TRUNCATE": true,
	"REPLACE":  true,
	"RENAME":   true,
	"GRANT":    true,
	"REVOKE":   true,
	"ATTACH":   true,
	"DETACH":   true,
	"CALL":     true,
	"EXEC":     true,
	"EXECUTE":  true,
	"DO":       true,
	"MERGE":    true,
	"VACUUM":   true,
	"COPY":     true,
	"LOCK":     true,
	"SET":      true,
	"FLUSH":    true,
	"KILL":     true,
}

var safeSQLStarters = map[string]bool{
	"SELECT":   true,
	"SHOW":     true,
	"DESCRIBE": true,
	"DESC":     true,
	"PRAGMA":   true,
	"EXPLAIN":  true,
	"WITH":     true,
}

// isMutatingQuery inspects SQL or Mongo commands to identify mutating statements.
// It returns true if the statement modifies data, alters schema, or calls mutating operations.
func isMutatingQuery(dbType, query string) bool {
	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return false
	}

	if dbType == "mongodb" {
		return isMutatingMongoQuery(cleanQuery)
	}

	return isMutatingSQLQuery(cleanQuery)
}

// isMutatingSQLQuery normalizes SQL statements (stripping comments and literals)
// and evaluates each statement against an allowlist of read-only operations.
func isMutatingSQLQuery(query string) bool {
	stripped := stripSQLCommentsAndStrings(query)
	stmts := strings.Split(stripped, ";")

	hasAtLeastOneStmt := false

	for _, stmt := range stmts {
		tokens := extractTokens(stmt)
		if len(tokens) == 0 {
			continue
		}

		hasAtLeastOneStmt = true
		first := tokens[0]

		// Explicit mutation starter
		if mutatingSQLKeywords[first] {
			return true
		}

		switch first {
		case "WITH":
			// CTEs may contain mutating operations (e.g. WITH del AS (DELETE ... RETURNING *))
			for _, t := range tokens[1:] {
				if mutatingSQLKeywords[t] {
					return true
				}
			}
		case "EXPLAIN":
			// In PostgreSQL: EXPLAIN ANALYZE <statement> executes mutating statements
			for _, t := range tokens[1:] {
				if mutatingSQLKeywords[t] {
					return true
				}
			}
		case "SELECT":
			// SELECT ... INTO <table_name> creates a new table
			for _, t := range tokens[1:] {
				if t == "INTO" {
					return true
				}
			}
		default:
			// Fail-closed: If first token is not in the safe allowlist, treat as mutating
			if !safeSQLStarters[first] {
				return true
			}
		}
	}

	return !hasAtLeastOneStmt && len(strings.TrimSpace(query)) > 0
}

func extractTokens(stmt string) []string {
	words := sqlTokenRegex.FindAllString(stmt, -1)
	if len(words) == 0 {
		return nil
	}
	tokens := make([]string, len(words))
	for i, w := range words {
		tokens[i] = strings.ToUpper(w)
	}
	return tokens
}

// stripSQLCommentsAndStrings removes SQL comments and replaces string/identifier literals
// so keywords within text or comments are not matched erroneously or used to bypass checks.
func stripSQLCommentsAndStrings(q string) string {
	var sb strings.Builder
	sb.Grow(len(q))
	n := len(q)
	i := 0

	for i < n {
		// Line comments: -- or #
		if (i+1 < n && q[i] == '-' && q[i+1] == '-') || q[i] == '#' {
			for i < n && q[i] != '\n' && q[i] != '\r' {
				i++
			}
			continue
		}

		// Block comments: /* ... */
		if i+1 < n && q[i] == '/' && q[i+1] == '*' {
			i += 2
			for i+1 < n && !(q[i] == '*' && q[i+1] == '/') {
				i++
			}
			if i+1 < n {
				i += 2 // skip */
			} else {
				i = n
			}
			sb.WriteByte(' ')
			continue
		}

		// Single-quoted string: '...'
		if q[i] == '\'' {
			i++
			for i < n {
				if q[i] == '\'' {
					if i+1 < n && q[i+1] == '\'' {
						i += 2 // escaped ''
						continue
					}
					i++ // closing '
					break
				}
				if q[i] == '\\' && i+1 < n {
					i += 2 // escaped char
					continue
				}
				i++
			}
			sb.WriteString(" '' ")
			continue
		}

		// Double-quoted identifier / string: "..."
		if q[i] == '"' {
			i++
			for i < n {
				if q[i] == '"' {
					if i+1 < n && q[i+1] == '"' {
						i += 2
						continue
					}
					i++
					break
				}
				if q[i] == '\\' && i+1 < n {
					i += 2
					continue
				}
				i++
			}
			sb.WriteString(" \"\" ")
			continue
		}

		// MySQL backtick identifiers: `...`
		if q[i] == '`' {
			i++
			for i < n {
				if q[i] == '`' {
					i++
					break
				}
				i++
			}
			sb.WriteString(" `` ")
			continue
		}

		// PostgreSQL dollar-quoted strings: $$...$$ or $tag$...$tag$
		if q[i] == '$' {
			tagEnd := -1
			for j := i + 1; j < n && j < i+30; j++ {
				if q[j] == '$' {
					tagEnd = j
					break
				}
				if !(q[j] >= 'a' && q[j] <= 'z' || q[j] >= 'A' && q[j] <= 'Z' || q[j] >= '0' && q[j] <= '9' || q[j] == '_') {
					break
				}
			}
			if tagEnd != -1 {
				tag := q[i : tagEnd+1]
				i = tagEnd + 1
				closeIdx := strings.Index(q[i:], tag)
				if closeIdx != -1 {
					i += closeIdx + len(tag)
				} else {
					i = n
				}
				sb.WriteString(" '' ")
				continue
			}
		}

		sb.WriteByte(q[i])
		i++
	}

	return sb.String()
}

// isMutatingMongoQuery checks MongoDB shell and JSON commands for mutating operations.
func isMutatingMongoQuery(query string) bool {
	upper := strings.ToUpper(query)
	mutatingMongoKeywords := []string{
		"INSERTONE", "INSERTMANY", "UPDATEONE", "UPDATEMANY",
		"DELETEONE", "DELETEMANY", "REPLACEONE",
		"FINDONEANDDELETE", "FINDONEANDREPLACE", "FINDONEANDUPDATE",
		"FINDANDMODIFY", "DROP", "DROPDATABASE", "CREATECOLLECTION",
		"RENAMECOLLECTION", "DROPINDEX", "DROPINDEXES",
		"CREATEINDEX", "CREATEINDEXES", "BULKWRITE", "REMOVE", "SAVE",
		"\"INSERT\"", "\"UPDATE\"", "\"DELETE\"", "\"DROP\"",
		"\"CREATE\"", "\"RENAMECOLLECTION\"", "\"DROPDATABASE\"",
	}
	for _, kw := range mutatingMongoKeywords {
		if strings.Contains(upper, kw) {
			return true
		}
	}
	return false
}
