package adapter

import (
	"fmt"
	"regexp"
	"strings"
)

// SplitStatements breaks a multi-statement SQL script into individual queries,
// safely respecting single-line comments (--), multi-line comments (/* */),
// and string literals ('...' and "...").
func SplitStatements(sqlText string) []string {
	var statements []string
	var current strings.Builder

	inSingleQuote := false
	inDoubleQuote := false
	inSingleLineComment := false
	inMultiLineComment := false

	runes := []rune(sqlText)
	n := len(runes)

	for i := 0; i < n; i++ {
		r := runes[i]
		var next rune
		if i+1 < n {
			next = runes[i+1]
		}

		// Handle comments
		if inSingleLineComment {
			current.WriteRune(r)
			if r == '\n' {
				inSingleLineComment = false
			}
			continue
		}

		if inMultiLineComment {
			current.WriteRune(r)
			if r == '*' && next == '/' {
				current.WriteRune(next)
				i++
				inMultiLineComment = false
			}
			continue
		}

		// Check for comment starts when not in string
		if !inSingleQuote && !inDoubleQuote {
			if r == '-' && next == '-' {
				inSingleLineComment = true
				current.WriteRune(r)
				current.WriteRune(next)
				i++
				continue
			}
			if r == '/' && next == '*' {
				inMultiLineComment = true
				current.WriteRune(r)
				current.WriteRune(next)
				i++
				continue
			}
		}

		// Handle string literals
		if r == '\'' && !inDoubleQuote {
			if inSingleQuote && next == '\'' {
				// Escaped quote ''
				current.WriteRune(r)
				current.WriteRune(next)
				i++
				continue
			}
			inSingleQuote = !inSingleQuote
			current.WriteRune(r)
			continue
		}

		if r == '"' && !inSingleQuote {
			inDoubleQuote = !inDoubleQuote
			current.WriteRune(r)
			continue
		}

		// Split on semicolon
		if r == ';' && !inSingleQuote && !inDoubleQuote {
			stmt := strings.TrimSpace(current.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			current.Reset()
			continue
		}

		current.WriteRune(r)
	}

	last := strings.TrimSpace(current.String())
	if last != "" {
		statements = append(statements, last)
	}

	return statements
}

var (
	createTableRe   = regexp.MustCompile(`(?i)^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s(]+)`)
	dropTableRe     = regexp.MustCompile(`(?i)^DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+([^\s;]+)`)
	createIndexRe   = regexp.MustCompile(`(?i)^CREATE(?:\s+UNIQUE)?\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s]+)\s+ON\s+([^\s(]+)`)
	dropIndexRe     = regexp.MustCompile(`(?i)^DROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+([^\s;]+)`)
	alterAddColRe   = regexp.MustCompile(`(?i)^ALTER\s+TABLE\s+([^\s]+)\s+ADD(?:\s+COLUMN)?\s+([^\s]+)(?:\s+([^,;]+))?`)
	alterDropColRe  = regexp.MustCompile(`(?i)^ALTER\s+TABLE\s+([^\s]+)\s+DROP(?:\s+COLUMN)?(?:\s+IF\s+EXISTS)?\s+([^\s;,]+)`)
	alterRenameColRe = regexp.MustCompile(`(?i)^ALTER\s+TABLE\s+([^\s]+)\s+RENAME(?:\s+COLUMN)?\s+([^\s]+)\s+TO\s+([^\s;,]+)`)
	alterRenameTblRe = regexp.MustCompile(`(?i)^ALTER\s+TABLE\s+([^\s]+)\s+RENAME\s+TO\s+([^\s;,]+)`)
)

func cleanIdent(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, `"'` + "`")
	return s
}

func stripLeadingComments(s string) string {
	for {
		s = strings.TrimSpace(s)
		if strings.HasPrefix(s, "--") {
			idx := strings.Index(s, "\n")
			if idx == -1 {
				return ""
			}
			s = s[idx+1:]
			continue
		}
		if strings.HasPrefix(s, "/*") {
			idx := strings.Index(s, "*/")
			if idx == -1 {
				return ""
			}
			s = s[idx+2:]
			continue
		}
		break
	}
	return strings.TrimSpace(s)
}

// AnalyzeStatements parses a slice of DDL statements to derive a human-readable
// execution plan and best-effort inverse DDL (RollbackSQL).
func AnalyzeStatements(statements []string) (plan []string, rollbackSQL string) {
	plan = make([]string, 0, len(statements))
	var rollbacks []string
	hasInvertible := false

	for _, rawStmt := range statements {
		stmt := stripLeadingComments(rawStmt)
		if stmt == "" {
			continue
		}

		if m := createTableRe.FindStringSubmatch(stmt); len(m) > 1 {
			tbl := cleanIdent(m[1])
			plan = append(plan, fmt.Sprintf("Create table %q", tbl))
			rollbacks = append(rollbacks, fmt.Sprintf("DROP TABLE IF EXISTS %s;", quoteIdent(tbl)))
			hasInvertible = true
			continue
		}

		if m := dropTableRe.FindStringSubmatch(stmt); len(m) > 1 {
			tbl := cleanIdent(m[1])
			plan = append(plan, fmt.Sprintf("Drop table %q", tbl))
			rollbacks = append(rollbacks, fmt.Sprintf("-- Cannot auto-rollback DROP TABLE %q", tbl))
			continue
		}

		if m := createIndexRe.FindStringSubmatch(stmt); len(m) > 2 {
			idx := cleanIdent(m[1])
			tbl := cleanIdent(m[2])
			plan = append(plan, fmt.Sprintf("Create index %q on table %q", idx, tbl))
			rollbacks = append(rollbacks, fmt.Sprintf("DROP INDEX IF EXISTS %s;", quoteIdent(idx)))
			hasInvertible = true
			continue
		}

		if m := dropIndexRe.FindStringSubmatch(stmt); len(m) > 1 {
			idx := cleanIdent(m[1])
			plan = append(plan, fmt.Sprintf("Drop index %q", idx))
			rollbacks = append(rollbacks, fmt.Sprintf("-- Cannot auto-rollback DROP INDEX %q", idx))
			continue
		}

		if m := alterAddColRe.FindStringSubmatch(stmt); len(m) > 2 {
			tbl := cleanIdent(m[1])
			col := cleanIdent(m[2])
			colType := ""
			if len(m) > 3 && strings.TrimSpace(m[3]) != "" {
				colType = fmt.Sprintf(" (%s)", strings.TrimSpace(m[3]))
			}
			plan = append(plan, fmt.Sprintf("Add column %q%s to table %q", col, colType, tbl))
			rollbacks = append(rollbacks, fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s;", quoteIdent(tbl), quoteIdent(col)))
			hasInvertible = true
			continue
		}

		if m := alterDropColRe.FindStringSubmatch(stmt); len(m) > 2 {
			tbl := cleanIdent(m[1])
			col := cleanIdent(m[2])
			plan = append(plan, fmt.Sprintf("Drop column %q from table %q", col, tbl))
			rollbacks = append(rollbacks, fmt.Sprintf("-- Cannot auto-rollback DROP COLUMN %q from %q", col, tbl))
			continue
		}

		if m := alterRenameColRe.FindStringSubmatch(stmt); len(m) > 3 {
			tbl := cleanIdent(m[1])
			oldCol := cleanIdent(m[2])
			newCol := cleanIdent(m[3])
			plan = append(plan, fmt.Sprintf("Rename column %q to %q in table %q", oldCol, newCol, tbl))
			rollbacks = append(rollbacks, fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s;", quoteIdent(tbl), quoteIdent(newCol), quoteIdent(oldCol)))
			hasInvertible = true
			continue
		}

		if m := alterRenameTblRe.FindStringSubmatch(stmt); len(m) > 2 {
			oldTbl := cleanIdent(m[1])
			newTbl := cleanIdent(m[2])
			plan = append(plan, fmt.Sprintf("Rename table %q to %q", oldTbl, newTbl))
			rollbacks = append(rollbacks, fmt.Sprintf("ALTER TABLE %s RENAME TO %s;", quoteIdent(newTbl), quoteIdent(oldTbl)))
			hasInvertible = true
			continue
		}

		// Fallback for custom or unparsed DDL
		summary := stmt
		if len(summary) > 60 {
			summary = summary[:57] + "..."
		}
		plan = append(plan, fmt.Sprintf("Execute statement: %s", summary))
		rollbacks = append(rollbacks, fmt.Sprintf("-- Cannot auto-infer rollback for: %s", summary))
	}

	if hasInvertible {
		// Reverse rollbacks for proper LIFO execution
		reversed := make([]string, 0, len(rollbacks))
		for i := len(rollbacks) - 1; i >= 0; i-- {
			reversed = append(reversed, rollbacks[i])
		}
		rollbackSQL = strings.Join(reversed, "\n")
	}

	return plan, rollbackSQL
}

func quoteIdent(name string) string {
	if strings.ContainsAny(name, ` "'`+"`") {
		return name
	}
	return `"` + name + `"`
}
