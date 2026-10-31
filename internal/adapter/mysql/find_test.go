package mysql

import (
	"strings"
	"testing"
)

func TestFindBinaryUUIDSQLQuotesIdentifiersAndBindsValues(t *testing.T) {
	countSQL, rowsSQL := buildFindBinaryUUIDSQL("odd`table", "tenant`uuid")
	for _, query := range []string{countSQL, rowsSQL} {
		if strings.Contains(query, "odd`table") || strings.Contains(query, "tenant`uuid") || !strings.Contains(query, "``") || strings.Contains(query, "search-value") {
			t.Fatalf("unsafe or unquoted search SQL: %s", query)
		}
		if strings.Count(query, "?") != 2 && query == countSQL {
			t.Fatalf("count value is not bound: %s", query)
		}
	}
	if !strings.HasSuffix(rowsSQL, "LIMIT ?") {
		t.Fatalf("row cap is not bound: %s", rowsSQL)
	}
}

func TestFindContainsSQLQuotesIdentifiersAndEscapesLiteralPattern(t *testing.T) {
	countSQL, rowsSQL, pattern := buildFindContainsSQL("user`data", "display`name", "A%_!")
	if strings.Contains(countSQL, "user`data") || strings.Contains(countSQL, "display`name") || !strings.Contains(countSQL, "LOWER(CAST(") || !strings.Contains(countSQL, "ESCAPE '!'") {
		t.Fatalf("unsafe or case-sensitive contains SQL: %s", countSQL)
	}
	if strings.Contains(countSQL, "A%_!") || strings.Count(countSQL, "?") != 1 || !strings.HasSuffix(rowsSQL, "LIMIT ?") {
		t.Fatalf("search value or limit not parameterized: %s / %s", countSQL, rowsSQL)
	}
	if pattern != "%a!%!_!!%" {
		t.Fatalf("wildcards were not escaped: %q", pattern)
	}
}
