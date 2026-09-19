// Package diff provides schema comparison and migration generation between two database connections.
package diff

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
	"pebblebase/internal/storage"
)

// DiffStatus represents the state of a table, column, or index difference.
type DiffStatus string

const (
	StatusAdded     DiffStatus = "added"
	StatusRemoved   DiffStatus = "removed"
	StatusModified  DiffStatus = "modified"
	StatusUnchanged DiffStatus = "unchanged"
)

// ConnectionInfo encapsulates metadata about a connection in a diff.
type ConnectionInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Engine string `json:"engine"`
}

// ColumnDiff describes differences for a single column between source and target.
type ColumnDiff struct {
	Name       string         `json:"name"`
	Status     DiffStatus     `json:"status"`
	FromColumn *schema.Column `json:"from_column,omitempty"`
	ToColumn   *schema.Column `json:"to_column,omitempty"`
	Changes    []string       `json:"changes,omitempty"`
}

// IndexDiff describes differences for an index between source and target.
type IndexDiff struct {
	Name      string             `json:"name"`
	Status    DiffStatus         `json:"status"`
	FromIndex *adapter.IndexInfo `json:"from_index,omitempty"`
	ToIndex   *adapter.IndexInfo `json:"to_index,omitempty"`
	Changes   []string           `json:"changes,omitempty"`
}

// TableDiff describes differences for a table, its columns, and its indexes.
type TableDiff struct {
	Name    string       `json:"name"`
	Status  DiffStatus   `json:"status"`
	Columns []ColumnDiff `json:"columns"`
	Indexes []IndexDiff  `json:"indexes"`
}

// DiffSummary provides aggregate counts across all tables, columns, and indexes.
type DiffSummary struct {
	TablesAdded     int `json:"tables_added"`
	TablesRemoved   int `json:"tables_removed"`
	TablesModified  int `json:"tables_modified"`
	TablesUnchanged int `json:"tables_unchanged"`
	ColumnsAdded    int `json:"columns_added"`
	ColumnsRemoved  int `json:"columns_removed"`
	ColumnsModified int `json:"columns_modified"`
	IndexesAdded    int `json:"indexes_added"`
	IndexesRemoved  int `json:"indexes_removed"`
	IndexesModified int `json:"indexes_modified"`
}

// SchemaDiffResult is the comprehensive result comparing a Source (From) and Target (To) connection.
type SchemaDiffResult struct {
	FromConnection ConnectionInfo `json:"from_connection"`
	ToConnection   ConnectionInfo `json:"to_connection"`
	Tables         []TableDiff    `json:"tables"`
	Summary        DiffSummary    `json:"summary"`
	MigrationSQL   string         `json:"migration_sql"`
}

// Compare introspects both database adapters and compares their schemas.
func Compare(
	ctx context.Context,
	fromAdapter adapter.Adapter,
	toAdapter adapter.Adapter,
	fromConn storage.Record,
	toConn storage.Record,
) (*SchemaDiffResult, error) {
	fromTables, err := fromAdapter.Introspect(ctx)
	if err != nil {
		return nil, fmt.Errorf("introspect source connection %q: %w", fromConn.Name, err)
	}

	toTables, err := toAdapter.Introspect(ctx)
	if err != nil {
		return nil, fmt.Errorf("introspect target connection %q: %w", toConn.Name, err)
	}

	// Fetch indexes if DDLProvider is implemented
	fromIndexes := make(map[string][]adapter.IndexInfo)
	if ddl, ok := fromAdapter.(adapter.DDLProvider); ok {
		for _, tbl := range fromTables {
			if idxs, err := ddl.GetTableIndexes(ctx, tbl.Name); err == nil {
				fromIndexes[strings.ToLower(tbl.Name)] = idxs
			}
		}
	}

	toIndexes := make(map[string][]adapter.IndexInfo)
	if ddl, ok := toAdapter.(adapter.DDLProvider); ok {
		for _, tbl := range toTables {
			if idxs, err := ddl.GetTableIndexes(ctx, tbl.Name); err == nil {
				toIndexes[strings.ToLower(tbl.Name)] = idxs
			}
		}
	}

	fromTableMap := make(map[string]schema.Table)
	for _, tbl := range fromTables {
		fromTableMap[strings.ToLower(tbl.Name)] = tbl
	}

	toTableMap := make(map[string]schema.Table)
	for _, tbl := range toTables {
		toTableMap[strings.ToLower(tbl.Name)] = tbl
	}

	// Collect unique table names preserve original casing
	tableNameMap := make(map[string]string) // lower -> original
	for _, tbl := range fromTables {
		tableNameMap[strings.ToLower(tbl.Name)] = tbl.Name
	}
	for _, tbl := range toTables {
		lower := strings.ToLower(tbl.Name)
		if _, exists := tableNameMap[lower]; !exists {
			tableNameMap[lower] = tbl.Name
		}
	}

	var allTableKeys []string
	for k := range tableNameMap {
		allTableKeys = append(allTableKeys, k)
	}
	sort.Strings(allTableKeys)

	var tableDiffs []TableDiff
	var summary DiffSummary

	for _, lowerName := range allTableKeys {
		origName := tableNameMap[lowerName]
		fromTbl, inFrom := fromTableMap[lowerName]
		toTbl, inTo := toTableMap[lowerName]

		fIdxs := fromIndexes[lowerName]
		tIdxs := toIndexes[lowerName]

		if inFrom && !inTo {
			// Table is in Source but missing from Target -> Added in Source
			td := TableDiff{
				Name:   origName,
				Status: StatusAdded,
			}
			for _, col := range fromTbl.Columns {
				c := col
				td.Columns = append(td.Columns, ColumnDiff{
					Name:       col.Name,
					Status:     StatusAdded,
					FromColumn: &c,
				})
				summary.ColumnsAdded++
			}
			for _, idx := range fIdxs {
				i := idx
				td.Indexes = append(td.Indexes, IndexDiff{
					Name:      idx.Name,
					Status:    StatusAdded,
					FromIndex: &i,
				})
				summary.IndexesAdded++
			}
			summary.TablesAdded++
			tableDiffs = append(tableDiffs, td)
		} else if !inFrom && inTo {
			// Table is in Target but missing from Source -> Removed from Source
			td := TableDiff{
				Name:   origName,
				Status: StatusRemoved,
			}
			for _, col := range toTbl.Columns {
				c := col
				td.Columns = append(td.Columns, ColumnDiff{
					Name:     col.Name,
					Status:   StatusRemoved,
					ToColumn: &c,
				})
				summary.ColumnsRemoved++
			}
			for _, idx := range tIdxs {
				i := idx
				td.Indexes = append(td.Indexes, IndexDiff{
					Name:    idx.Name,
					Status:  StatusRemoved,
					ToIndex: &i,
				})
				summary.IndexesRemoved++
			}
			summary.TablesRemoved++
			tableDiffs = append(tableDiffs, td)
		} else {
			// Table exists in both Source and Target -> Check Columns & Indexes
			colDiffs, colAdded, colRemoved, colMod := compareColumns(fromTbl.Columns, toTbl.Columns)
			idxDiffs, idxAdded, idxRemoved, idxMod := compareIndexes(fIdxs, tIdxs)

			summary.ColumnsAdded += colAdded
			summary.ColumnsRemoved += colRemoved
			summary.ColumnsModified += colMod
			summary.IndexesAdded += idxAdded
			summary.IndexesRemoved += idxRemoved
			summary.IndexesModified += idxMod

			td := TableDiff{
				Name:    origName,
				Columns: colDiffs,
				Indexes: idxDiffs,
			}

			if colAdded > 0 || colRemoved > 0 || colMod > 0 || idxAdded > 0 || idxRemoved > 0 || idxMod > 0 {
				td.Status = StatusModified
				summary.TablesModified++
			} else {
				td.Status = StatusUnchanged
				summary.TablesUnchanged++
			}

			tableDiffs = append(tableDiffs, td)
		}
	}

	result := &SchemaDiffResult{
		FromConnection: ConnectionInfo{
			ID:     fromConn.ID,
			Name:   fromConn.Name,
			Engine: string(fromConn.Type),
		},
		ToConnection: ConnectionInfo{
			ID:     toConn.ID,
			Name:   toConn.Name,
			Engine: string(toConn.Type),
		},
		Tables:  tableDiffs,
		Summary: summary,
	}

	result.MigrationSQL = GenerateMigrationSQL(result, string(toConn.Type))
	return result, nil
}

func compareColumns(fromCols, toCols []schema.Column) ([]ColumnDiff, int, int, int) {
	fromMap := make(map[string]schema.Column)
	for _, c := range fromCols {
		fromMap[strings.ToLower(c.Name)] = c
	}
	toMap := make(map[string]schema.Column)
	for _, c := range toCols {
		toMap[strings.ToLower(c.Name)] = c
	}

	nameMap := make(map[string]string)
	for _, c := range fromCols {
		nameMap[strings.ToLower(c.Name)] = c.Name
	}
	for _, c := range toCols {
		lower := strings.ToLower(c.Name)
		if _, ok := nameMap[lower]; !ok {
			nameMap[lower] = c.Name
		}
	}

	var allColKeys []string
	for k := range nameMap {
		allColKeys = append(allColKeys, k)
	}
	sort.Strings(allColKeys)

	var diffs []ColumnDiff
	var added, removed, modified int

	for _, k := range allColKeys {
		origName := nameMap[k]
		fCol, inFrom := fromMap[k]
		tCol, inTo := toMap[k]

		if inFrom && !inTo {
			c := fCol
			diffs = append(diffs, ColumnDiff{
				Name:       origName,
				Status:     StatusAdded,
				FromColumn: &c,
			})
			added++
		} else if !inFrom && inTo {
			c := tCol
			diffs = append(diffs, ColumnDiff{
				Name:     origName,
				Status:   StatusRemoved,
				ToColumn: &c,
			})
			removed++
		} else {
			var changes []string
			if !strings.EqualFold(fCol.Type, tCol.Type) {
				changes = append(changes, fmt.Sprintf("type: %s -> %s", tCol.Type, fCol.Type))
			}
			if fCol.Nullable != tCol.Nullable {
				changes = append(changes, fmt.Sprintf("nullable: %v -> %v", tCol.Nullable, fCol.Nullable))
			}
			if fCol.IsPrimaryKey != tCol.IsPrimaryKey {
				changes = append(changes, fmt.Sprintf("primary_key: %v -> %v", tCol.IsPrimaryKey, fCol.IsPrimaryKey))
			}

			status := StatusUnchanged
			if len(changes) > 0 {
				status = StatusModified
				modified++
			}
			fc := fCol
			tc := tCol
			diffs = append(diffs, ColumnDiff{
				Name:       origName,
				Status:     status,
				FromColumn: &fc,
				ToColumn:   &tc,
				Changes:    changes,
			})
		}
	}

	return diffs, added, removed, modified
}

func compareIndexes(fromIdxs, toIdxs []adapter.IndexInfo) ([]IndexDiff, int, int, int) {
	fromMap := make(map[string]adapter.IndexInfo)
	for _, idx := range fromIdxs {
		fromMap[strings.ToLower(idx.Name)] = idx
	}
	toMap := make(map[string]adapter.IndexInfo)
	for _, idx := range toIdxs {
		toMap[strings.ToLower(idx.Name)] = idx
	}

	nameMap := make(map[string]string)
	for _, idx := range fromIdxs {
		nameMap[strings.ToLower(idx.Name)] = idx.Name
	}
	for _, idx := range toIdxs {
		lower := strings.ToLower(idx.Name)
		if _, ok := nameMap[lower]; !ok {
			nameMap[lower] = idx.Name
		}
	}

	var allIdxKeys []string
	for k := range nameMap {
		allIdxKeys = append(allIdxKeys, k)
	}
	sort.Strings(allIdxKeys)

	var diffs []IndexDiff
	var added, removed, modified int

	for _, k := range allIdxKeys {
		origName := nameMap[k]
		fIdx, inFrom := fromMap[k]
		tIdx, inTo := toMap[k]

		if inFrom && !inTo {
			i := fIdx
			diffs = append(diffs, IndexDiff{
				Name:      origName,
				Status:    StatusAdded,
				FromIndex: &i,
			})
			added++
		} else if !inFrom && inTo {
			i := tIdx
			diffs = append(diffs, IndexDiff{
				Name:    origName,
				Status:  StatusRemoved,
				ToIndex: &i,
			})
			removed++
		} else {
			var changes []string
			if fIdx.Unique != tIdx.Unique {
				changes = append(changes, fmt.Sprintf("unique: %v -> %v", tIdx.Unique, fIdx.Unique))
			}
			fCols := strings.Join(fIdx.Columns, ",")
			tCols := strings.Join(tIdx.Columns, ",")
			if !strings.EqualFold(fCols, tCols) {
				changes = append(changes, fmt.Sprintf("columns: (%s) -> (%s)", tCols, fCols))
			}

			status := StatusUnchanged
			if len(changes) > 0 {
				status = StatusModified
				modified++
			}
			fi := fIdx
			ti := tIdx
			diffs = append(diffs, IndexDiff{
				Name:      origName,
				Status:    status,
				FromIndex: &fi,
				ToIndex:   &ti,
				Changes:   changes,
			})
		}
	}

	return diffs, added, removed, modified
}

// GenerateMigrationSQL generates SQL DDL to sync Target to match Source.
func GenerateMigrationSQL(diff *SchemaDiffResult, targetEngine string) string {
	var sb strings.Builder

	sb.WriteString("-- ============================================================\n")
	sb.WriteString(fmt.Sprintf("-- PebbleBase Schema Migration: %s -> %s\n", diff.FromConnection.Name, diff.ToConnection.Name))
	sb.WriteString(fmt.Sprintf("-- Target Engine: %s\n", targetEngine))
	sb.WriteString(fmt.Sprintf("-- Summary: %d tables added, %d modified, %d removed\n",
		diff.Summary.TablesAdded, diff.Summary.TablesModified, diff.Summary.TablesRemoved))
	sb.WriteString("-- ============================================================\n\n")

	sb.WriteString("BEGIN;\n\n")

	hasStatements := false

	for _, tbl := range diff.Tables {
		switch tbl.Status {
		case StatusAdded:
			// Target is missing this table -> Generate CREATE TABLE
			hasStatements = true
			sb.WriteString(fmt.Sprintf("-- Table: %s (New in Source)\n", tbl.Name))
			sb.WriteString(generateCreateTable(tbl, targetEngine))
			sb.WriteString("\n\n")

		case StatusModified:
			// Table exists in both, but has column or index differences
			var stmts []string

			// 1. Added columns
			for _, col := range tbl.Columns {
				if col.Status == StatusAdded && col.FromColumn != nil {
					stmts = append(stmts, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s;",
						quoteIdent(tbl.Name, targetEngine),
						quoteIdent(col.Name, targetEngine),
						sqlDataType(col.FromColumn.Type, targetEngine, col.FromColumn.Nullable),
					))
				}
			}

			// 2. Modified columns
			for _, col := range tbl.Columns {
				if col.Status == StatusModified && col.FromColumn != nil {
					typeStr := sqlDataType(col.FromColumn.Type, targetEngine, col.FromColumn.Nullable)
					if strings.EqualFold(targetEngine, "postgres") {
						stmts = append(stmts, fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s;",
							quoteIdent(tbl.Name, targetEngine),
							quoteIdent(col.Name, targetEngine),
							sqlDataTypeName(col.FromColumn.Type, targetEngine),
						))
						if !col.FromColumn.Nullable {
							stmts = append(stmts, fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s SET NOT NULL;",
								quoteIdent(tbl.Name, targetEngine),
								quoteIdent(col.Name, targetEngine),
							))
						} else {
							stmts = append(stmts, fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s DROP NOT NULL;",
								quoteIdent(tbl.Name, targetEngine),
								quoteIdent(col.Name, targetEngine),
							))
						}
					} else if strings.EqualFold(targetEngine, "mysql") {
						stmts = append(stmts, fmt.Sprintf("ALTER TABLE %s MODIFY COLUMN %s %s;",
							quoteIdent(tbl.Name, targetEngine),
							quoteIdent(col.Name, targetEngine),
							typeStr,
						))
					} else {
						// SQLite
						stmts = append(stmts, fmt.Sprintf("-- Notice: SQLite does not support ALTER COLUMN directly. Column %s.%s (%s)",
							tbl.Name, col.Name, strings.Join(col.Changes, ", ")))
					}
				}
			}

			// 3. Removed columns
			for _, col := range tbl.Columns {
				if col.Status == StatusRemoved {
					stmts = append(stmts, fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s;",
						quoteIdent(tbl.Name, targetEngine),
						quoteIdent(col.Name, targetEngine),
					))
				}
			}

			// 4. Index differences
			for _, idx := range tbl.Indexes {
				if (idx.Status == StatusRemoved || idx.Status == StatusModified) && idx.ToIndex != nil {
					if strings.EqualFold(targetEngine, "mysql") {
						stmts = append(stmts, fmt.Sprintf("DROP INDEX %s ON %s;",
							quoteIdent(idx.Name, targetEngine),
							quoteIdent(tbl.Name, targetEngine),
						))
					} else {
						stmts = append(stmts, fmt.Sprintf("DROP INDEX IF EXISTS %s;",
							quoteIdent(idx.Name, targetEngine),
						))
					}
				}
				if (idx.Status == StatusAdded || idx.Status == StatusModified) && idx.FromIndex != nil {
					uniqueStr := ""
					if idx.FromIndex.Unique {
						uniqueStr = "UNIQUE "
					}
					var quotedCols []string
					for _, c := range idx.FromIndex.Columns {
						quotedCols = append(quotedCols, quoteIdent(c, targetEngine))
					}
					stmts = append(stmts, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s);",
						uniqueStr,
						quoteIdent(idx.Name, targetEngine),
						quoteIdent(tbl.Name, targetEngine),
						strings.Join(quotedCols, ", "),
					))
				}
			}

			if len(stmts) > 0 {
				hasStatements = true
				sb.WriteString(fmt.Sprintf("-- Table: %s (Altered)\n", tbl.Name))
				for _, stmt := range stmts {
					sb.WriteString(stmt)
					sb.WriteByte('\n')
				}
				sb.WriteString("\n")
			}

		case StatusRemoved:
			// Table is only in Target -> Drop table
			hasStatements = true
			sb.WriteString(fmt.Sprintf("-- Table: %s (Extra in Target)\n", tbl.Name))
			sb.WriteString(fmt.Sprintf("DROP TABLE IF EXISTS %s;\n\n", quoteIdent(tbl.Name, targetEngine)))
		}
	}

	if !hasStatements {
		sb.WriteString("-- No schema differences found between source and target.\n")
	}

	sb.WriteString("COMMIT;\n")

	return sb.String()
}

func generateCreateTable(tbl TableDiff, engine string) string {
	var colDefs []string
	for _, col := range tbl.Columns {
		if col.FromColumn == nil {
			continue
		}
		c := col.FromColumn
		def := fmt.Sprintf("    %s %s", quoteIdent(c.Name, engine), sqlDataType(c.Type, engine, c.Nullable))
		if c.IsPrimaryKey {
			def += " PRIMARY KEY"
		}
		if c.DefaultValue != nil && *c.DefaultValue != "" {
			def += fmt.Sprintf(" DEFAULT %s", *c.DefaultValue)
		}
		colDefs = append(colDefs, def)
	}

	createStmt := fmt.Sprintf("CREATE TABLE %s (\n%s\n);",
		quoteIdent(tbl.Name, engine),
		strings.Join(colDefs, ",\n"),
	)

	// Secondary indexes
	var idxStmts []string
	for _, idx := range tbl.Indexes {
		if idx.FromIndex == nil || idx.FromIndex.Primary {
			continue
		}
		uniqueStr := ""
		if idx.FromIndex.Unique {
			uniqueStr = "UNIQUE "
		}
		var quotedCols []string
		for _, c := range idx.FromIndex.Columns {
			quotedCols = append(quotedCols, quoteIdent(c, engine))
		}
		idxStmts = append(idxStmts, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s);",
			uniqueStr,
			quoteIdent(idx.Name, engine),
			quoteIdent(tbl.Name, engine),
			strings.Join(quotedCols, ", "),
		))
	}

	if len(idxStmts) > 0 {
		return createStmt + "\n" + strings.Join(idxStmts, "\n")
	}
	return createStmt
}

func sqlDataType(colType string, engine string, nullable bool) string {
	dt := sqlDataTypeName(colType, engine)
	if !nullable {
		return dt + " NOT NULL"
	}
	return dt
}

func sqlDataTypeName(colType string, engine string) string {
	lower := strings.ToLower(colType)
	isMySQL := strings.EqualFold(engine, "mysql")
	isPG := strings.EqualFold(engine, "postgres")

	switch lower {
	case "int", "integer":
		if isPG {
			return "INTEGER"
		}
		if isMySQL {
			return "INT"
		}
		return "INTEGER"
	case "float", "double", "real", "numeric":
		if isPG {
			return "NUMERIC"
		}
		if isMySQL {
			return "DECIMAL(10,2)"
		}
		return "REAL"
	case "bool", "boolean":
		if isPG {
			return "BOOLEAN"
		}
		if isMySQL {
			return "TINYINT(1)"
		}
		return "INTEGER"
	case "datetime", "timestamp":
		if isPG {
			return "TIMESTAMP WITH TIME ZONE"
		}
		if isMySQL {
			return "DATETIME"
		}
		return "DATETIME"
	case "json":
		if isPG {
			return "JSONB"
		}
		if isMySQL {
			return "JSON"
		}
		return "TEXT"
	case "binary", "blob":
		if isPG {
			return "BYTEA"
		}
		return "BLOB"
	case "uuid":
		if isPG {
			return "UUID"
		}
		if isMySQL {
			return "VARCHAR(36)"
		}
		return "TEXT"
	default:
		// String / text
		if isPG {
			return "VARCHAR(255)"
		}
		if isMySQL {
			return "VARCHAR(255)"
		}
		return "TEXT"
	}
}

func quoteIdent(ident string, engine string) string {
	if strings.EqualFold(engine, "mysql") {
		return fmt.Sprintf("`%s`", ident)
	}
	return fmt.Sprintf(`"%s"`, ident)
}
