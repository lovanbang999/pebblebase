// Package seeder generates realistic SQL fixtures respecting database schema foreign-key dependencies.
package seeder

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"pebblebase/internal/schema"
	"strings"
	"time"
)

var (
	firstNames = []string{
		"Alex", "Jordan", "Taylor", "Morgan", "Sam", "Chris", "Casey", "Riley",
		"Jamie", "Avery", "Cameron", "Dakota", "Reese", "Quinn", "Skyler", "Kendall",
	}
	lastNames = []string{
		"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
		"Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
	}
	cities = []string{
		"New York", "San Francisco", "London", "Tokyo", "Berlin", "Paris",
		"Sydney", "Singapore", "Toronto", "Austin", "Dublin", "Amsterdam",
	}
	countries = []string{
		"US", "GB", "DE", "FR", "JP", "CA", "AU", "SG", "VN", "NL",
	}
	statuses = []string{
		"active", "pending", "completed", "processing", "cancelled",
	}
	roles = []string{
		"admin", "member", "editor", "viewer", "guest",
	}
	categories = []string{
		"Electronics", "Apparel", "Books", "Home & Garden", "Health & Beauty", "Sports & Outdoors",
	}
)

// GenerateUUID produces an RFC 4122 v4 UUID string without external dependencies.
func GenerateUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant RFC 4122
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// GenerateRandomHex produces random hex characters.
func GenerateRandomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ResolveDependencies computes the topological ordering of tables so that all
// foreign key target (parent) tables appear before their referencing (child) tables.
func ResolveDependencies(allTables []schema.Table, targetTableName string) ([]schema.Table, error) {
	tablesByName := make(map[string]schema.Table, len(allTables))
	for _, t := range allTables {
		tablesByName[strings.ToLower(t.Name)] = t
	}

	targetTbl, exists := tablesByName[strings.ToLower(targetTableName)]
	if !exists {
		return nil, fmt.Errorf("target table %q not found in schema", targetTableName)
	}

	// Build map of outbound foreign key dependencies per table.
	// A depends on B if A has a relation where FromTable == A and ToTable == B (and A != B).
	depGraph := make(map[string][]string)
	for _, t := range allTables {
		tblKey := strings.ToLower(t.Name)
		for _, rel := range t.Relations {
			if strings.EqualFold(rel.FromTable, t.Name) && !strings.EqualFold(rel.ToTable, t.Name) {
				toKey := strings.ToLower(rel.ToTable)
				if _, ok := tablesByName[toKey]; ok {
					depGraph[tblKey] = append(depGraph[tblKey], toKey)
				}
			}
		}
	}

	var orderedNames []string
	visited := make(map[string]bool)
	visiting := make(map[string]bool)

	var visit func(name string)
	visit = func(name string) {
		if visited[name] {
			return
		}
		if visiting[name] {
			// Cycle detected; gracefully break cycle to avoid infinite recursion
			return
		}
		visiting[name] = true
		for _, dep := range depGraph[name] {
			visit(dep)
		}
		visiting[name] = false
		visited[name] = true
		orderedNames = append(orderedNames, name)
	}

	visit(strings.ToLower(targetTbl.Name))

	var result []schema.Table
	for _, name := range orderedNames {
		if t, ok := tablesByName[name]; ok {
			result = append(result, t)
		}
	}

	return result, nil
}

// GenerateSeedSQL creates realistic INSERT statements for the required tables in dependency order.
func GenerateSeedSQL(tablesInOrder []schema.Table, targetTableName string, count int, engine string) (string, []string, error) {
	if count <= 0 {
		count = 10
	}
	if count > 500 {
		count = 500
	}

	var tablesSeeded []string
	for _, t := range tablesInOrder {
		tablesSeeded = append(tablesSeeded, t.Name)
	}

	// generatedVals tracks generated values: map[tableName]map[colName][]string
	generatedVals := make(map[string]map[string][]string)
	baseTime := time.Now().UTC().Add(-24 * time.Hour)

	var sqlBuilder strings.Builder
	sqlBuilder.WriteString("BEGIN;\n\n")

	for _, tbl := range tablesInOrder {
		tblLower := strings.ToLower(tbl.Name)
		generatedVals[tblLower] = make(map[string][]string)

		// Filter out auto-generated or calculated columns if any, keep standard insertable columns
		var insertCols []schema.Column
		for _, col := range tbl.Columns {
			insertCols = append(insertCols, col)
		}
		if len(insertCols) == 0 {
			continue
		}

		// Fast lookup of foreign key relations for this table: map[colName]Relation
		fkMap := make(map[string]schema.Relation)
		for _, rel := range tbl.Relations {
			if strings.EqualFold(rel.FromTable, tbl.Name) {
				fkMap[strings.ToLower(rel.FromColumn)] = rel
			}
		}

		// Determine row count for this table: ancestor tables generate min(count, 15) if count is very large,
		// but at least min(count, 10). For consistency, use count up to 50, or count.
		tableRowCount := count

		type rowValues []string
		var allRows []rowValues

		for i := 0; i < tableRowCount; i++ {
			var row rowValues
			for _, col := range insertCols {
				colLower := strings.ToLower(col.Name)
				var valStr string

				// 1. Check if column is a Foreign Key
				if rel, isFK := fkMap[colLower]; isFK {
					toTblLower := strings.ToLower(rel.ToTable)
					toColLower := strings.ToLower(rel.ToColumn)

					if toTblLower == tblLower {
						// Self-referencing FK (e.g. manager_id -> id)
						if i == 0 || (col.Nullable && (i%3 == 0)) {
							valStr = "NULL"
						} else {
							prevVals := generatedVals[tblLower][toColLower]
							if len(prevVals) > 0 {
								valStr = prevVals[0]
							} else {
								valStr = "NULL"
							}
						}
					} else {
						// Outbound FK to parent table
						parentVals := generatedVals[toTblLower][toColLower]
						if len(parentVals) > 0 {
							valStr = parentVals[i%len(parentVals)]
						} else {
							// Fallback if parent has no recorded values
							valStr = formatFallbackValue(col, i)
						}
					}
				} else if col.IsPrimaryKey {
					// 2. Primary Key generation
					valStr = formatPrimaryKey(col, i)
				} else {
					// 3. Realistic data generation by column semantics and type
					valStr = formatRealisticValue(col, i, tbl.Name, baseTime)
				}

				// Record generated raw value for FK lookups
				generatedVals[tblLower][colLower] = append(generatedVals[tblLower][colLower], valStr)

				// SQL format value
				formattedVal := escapeSQLValue(valStr, col.Type)
				row = append(row, formattedVal)
			}
			allRows = append(allRows, row)
		}

		// Build INSERT INTO statement
		sqlBuilder.WriteString("-- ------------------------------------------------------------\n")
		sqlBuilder.WriteString(fmt.Sprintf("-- Seed data for table: %s (%d rows)\n", tbl.Name, len(allRows)))
		sqlBuilder.WriteString("-- ------------------------------------------------------------\n")

		var colNames []string
		for _, col := range insertCols {
			colNames = append(colNames, quoteIdentifier(col.Name, engine))
		}

		sqlBuilder.WriteString(fmt.Sprintf("INSERT INTO %s (%s) VALUES\n",
			quoteIdentifier(tbl.Name, engine),
			strings.Join(colNames, ", "),
		))

		for rIdx, rVals := range allRows {
			suffix := ",\n"
			if rIdx == len(allRows)-1 {
				suffix = ";\n\n"
			}
			sqlBuilder.WriteString(fmt.Sprintf("  (%s)%s", strings.Join(rVals, ", "), suffix))
		}
	}

	sqlBuilder.WriteString("COMMIT;\n")

	return sqlBuilder.String(), tablesSeeded, nil
}

func formatPrimaryKey(col schema.Column, idx int) string {
	colLower := strings.ToLower(col.Name)
	if col.Type == "uuid" || strings.Contains(colLower, "uuid") {
		return GenerateUUID()
	}
	if col.Type == "int" {
		return fmt.Sprintf("%d", idx+1)
	}
	if col.Type == "string" {
		return fmt.Sprintf("%s_%d", colLower, idx+1)
	}
	return fmt.Sprintf("%d", idx+1)
}

func formatRealisticValue(col schema.Column, idx int, tableName string, baseTime time.Time) string {
	name := strings.ToLower(col.Name)

	// UUID
	if col.Type == "uuid" || strings.Contains(name, "uuid") {
		return GenerateUUID()
	}

	// Email
	if strings.Contains(name, "email") {
		f := strings.ToLower(firstNames[idx%len(firstNames)])
		l := strings.ToLower(lastNames[idx%len(lastNames)])
		return fmt.Sprintf("%s.%s%d@example.com", f, l, idx+1)
	}

	// First name
	if strings.Contains(name, "first_name") || strings.Contains(name, "firstname") {
		return firstNames[idx%len(firstNames)]
	}

	// Last name
	if strings.Contains(name, "last_name") || strings.Contains(name, "lastname") {
		return lastNames[idx%len(lastNames)]
	}

	// Username / Handle
	if strings.Contains(name, "username") || strings.Contains(name, "login") || strings.Contains(name, "user_name") {
		return fmt.Sprintf("%s%d", strings.ToLower(firstNames[idx%len(firstNames)]), idx+1)
	}

	// Full name
	if strings.Contains(name, "name") {
		return fmt.Sprintf("%s %s", firstNames[idx%len(firstNames)], lastNames[idx%len(lastNames)])
	}

	// Timestamps
	if col.Type == "datetime" || strings.HasSuffix(name, "_at") || strings.Contains(name, "date") || strings.Contains(name, "time") {
		t := baseTime.Add(time.Duration(idx*15) * time.Minute)
		return t.Format("2006-01-02 15:04:05")
	}

	// Phone
	if strings.Contains(name, "phone") || strings.Contains(name, "mobile") || strings.Contains(name, "tel") {
		return fmt.Sprintf("+1555%07d", 1000000+idx*17)
	}

	// Address / Location
	if strings.Contains(name, "address") {
		return fmt.Sprintf("%d Market Street, Suite %d", 100+idx*12, idx+1)
	}
	if strings.Contains(name, "city") {
		return cities[idx%len(cities)]
	}
	if strings.Contains(name, "country") {
		return countries[idx%len(countries)]
	}
	if strings.Contains(name, "zip") || strings.Contains(name, "postal") {
		return fmt.Sprintf("%05d", 10001+idx)
	}
	if strings.Contains(name, "state") || strings.Contains(name, "province") {
		return "CA"
	}

	// Status / Role / Category
	if strings.Contains(name, "status") {
		return statuses[idx%len(statuses)]
	}
	if strings.Contains(name, "role") {
		return roles[idx%len(roles)]
	}
	if strings.Contains(name, "category") {
		return categories[idx%len(categories)]
	}

	// Financial / Monetary / Numbers
	if strings.Contains(name, "price") || strings.Contains(name, "amount") || strings.Contains(name, "total") ||
		strings.Contains(name, "cost") || strings.Contains(name, "balance") || strings.Contains(name, "salary") {
		val := 15.0 + float64((idx*23)%150) + 0.99
		return fmt.Sprintf("%.2f", val)
	}

	if strings.Contains(name, "quantity") || strings.Contains(name, "qty") || strings.Contains(name, "stock") || strings.Contains(name, "count") {
		return fmt.Sprintf("%d", 1+(idx%15))
	}
	if strings.Contains(name, "age") {
		return fmt.Sprintf("%d", 20+(idx%50))
	}

	// Content / Descriptions
	if strings.Contains(name, "title") || strings.Contains(name, "headline") || strings.Contains(name, "subject") {
		return fmt.Sprintf("%s Item #%d", categories[idx%len(categories)], idx+1)
	}
	if strings.Contains(name, "description") || strings.Contains(name, "bio") || strings.Contains(name, "summary") ||
		strings.Contains(name, "content") || strings.Contains(name, "notes") || strings.Contains(name, "comment") {
		return fmt.Sprintf("Sample %s notes for %s record #%d.", name, tableName, idx+1)
	}

	// URLs & Media
	if strings.Contains(name, "avatar") || strings.Contains(name, "photo") || strings.Contains(name, "image") || strings.Contains(name, "icon") {
		return fmt.Sprintf("https://images.unsplash.com/photo-%d?w=150", 1500000000+idx*100)
	}
	if strings.Contains(name, "url") || strings.Contains(name, "website") || strings.Contains(name, "link") {
		return fmt.Sprintf("https://example.com/%s/%d", name, idx+1)
	}
	if strings.Contains(name, "sku") || strings.Contains(name, "code") {
		return fmt.Sprintf("SKU-%04d-%02d", 1000+idx, (idx*13)%100)
	}

	// Generic type fallback
	switch col.Type {
	case "bool":
		if idx%2 == 0 {
			return "true"
		}
		return "false"
	case "int":
		return fmt.Sprintf("%d", (idx+1)*10)
	case "float":
		return fmt.Sprintf("%.2f", float64(idx+1)*1.5)
	case "json":
		return fmt.Sprintf(`{"seeded": true, "index": %d, "tag": "fixture"}`, idx+1)
	case "binary":
		return "\\x01020304"
	default:
		return fmt.Sprintf("%s_%d", name, idx+1)
	}
}

func formatFallbackValue(col schema.Column, idx int) string {
	if col.Type == "uuid" {
		return GenerateUUID()
	}
	if col.Type == "int" {
		return fmt.Sprintf("%d", idx+1)
	}
	return fmt.Sprintf("ref_%s_%d", col.Name, idx+1)
}

func quoteIdentifier(ident string, engine string) string {
	if strings.EqualFold(engine, "mysql") {
		return fmt.Sprintf("`%s`", ident)
	}
	return fmt.Sprintf(`"%s"`, ident)
}

func escapeSQLValue(val string, colType string) string {
	if val == "NULL" {
		return "NULL"
	}

	switch colType {
	case "int":
		return val
	case "float":
		return val
	case "bool":
		if strings.EqualFold(val, "true") || val == "1" {
			return "TRUE"
		}
		return "FALSE"
	default:
		// Strings, datetimes, UUIDs, JSON, etc.
		escaped := strings.ReplaceAll(val, "'", "''")
		return fmt.Sprintf("'%s'", escaped)
	}
}
