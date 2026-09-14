package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/audit"
	"pebblebase/internal/schema"
)

// importTable handles POST /api/connections/{id}/tables/{table}/import.
// Accepts a multipart/form-data request containing:
//   - "file": The CSV file to import
//   - "mappings": Optional JSON object mapping CSV column headers to database column names, e.g. {"csv_col": "db_col"}
func (s *Server) importTable(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")

	if s.viewerBlocked(w, r) {
		return
	}

	// Read-only safety guard: reject any import on read-only connections
	if s.checkReadOnly(w, id) {
		return
	}

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	importer, ok := a.(adapter.BulkImporter)
	if !ok {
		writeError(w, http.StatusNotImplemented, "bulk import is not supported for this database")
		return
	}

	// Introspect table schema to validate column existence and cast types
	tables, err := a.Introspect(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "introspect schema: "+err.Error())
		return
	}

	var targetTable *schema.Table
	for i := range tables {
		if tables[i].Name == table {
			targetTable = &tables[i]
			break
		}
	}
	if targetTable == nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("table %q not found", table))
		return
	}

	tableColMap := make(map[string]schema.Column, len(targetTable.Columns))
	tableColLowerMap := make(map[string]schema.Column, len(targetTable.Columns))
	for _, col := range targetTable.Columns {
		tableColMap[col.Name] = col
		tableColLowerMap[strings.ToLower(col.Name)] = col
	}

	// Limit request body to 100MB
	r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "parse multipart form: "+err.Error())
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file in form-data: "+err.Error())
		return
	}
	defer file.Close()

	// Parse optional column mappings JSON: {"csv_header": "db_column_name"}
	userMappings := make(map[string]string)
	if rawMappings := r.FormValue("mappings"); rawMappings != "" {
		if err := json.Unmarshal([]byte(rawMappings), &userMappings); err != nil {
			writeError(w, http.StatusBadRequest, "invalid mappings JSON: "+err.Error())
			return
		}
	}

	csvReader := csv.NewReader(file)
	csvReader.TrimLeadingSpace = true
	csvReader.LazyQuotes = true

	headers, err := csvReader.Read()
	if err != nil {
		writeError(w, http.StatusBadRequest, "read CSV header: "+err.Error())
		return
	}
	if len(headers) == 0 {
		writeError(w, http.StatusBadRequest, "CSV file is empty or has no header columns")
		return
	}

	type colMapping struct {
		csvIndex int
		dbCol    schema.Column
	}

	var mappedCols []colMapping
	var targetColNames []string

	for i, rawHeader := range headers {
		trimmedHeader := strings.TrimSpace(rawHeader)
		if trimmedHeader == "" {
			continue
		}

		// Check if explicit mapping provided
		mappedName, explicit := userMappings[trimmedHeader]
		if explicit {
			if mappedName == "" || mappedName == "-" {
				// Column explicitly skipped
				continue
			}
			col, exists := tableColMap[mappedName]
			if !exists {
				col, exists = tableColLowerMap[strings.ToLower(mappedName)]
			}
			if !exists {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("mapped column %q does not exist in table %q", mappedName, table))
				return
			}
			mappedCols = append(mappedCols, colMapping{csvIndex: i, dbCol: col})
			targetColNames = append(targetColNames, col.Name)
		} else {
			// Auto-match by column name (case-insensitive fallback)
			col, exists := tableColMap[trimmedHeader]
			if !exists {
				col, exists = tableColLowerMap[strings.ToLower(trimmedHeader)]
			}
			if exists {
				mappedCols = append(mappedCols, colMapping{csvIndex: i, dbCol: col})
				targetColNames = append(targetColNames, col.Name)
			}
		}
	}

	if len(mappedCols) == 0 {
		writeError(w, http.StatusBadRequest, "no matching columns found between CSV header and table schema")
		return
	}

	start := time.Now()
	var records [][]any
	lineNum := 1

	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		lineNum++
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("parse CSV row %d: %v", lineNum, err))
			return
		}

		row := make([]any, len(mappedCols))
		for mIdx, m := range mappedCols {
			var rawVal string
			if m.csvIndex < len(record) {
				rawVal = strings.TrimSpace(record[m.csvIndex])
			}

			parsedVal, parseErr := parseCSVField(rawVal, m.dbCol)
			if parseErr != nil {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("row %d column %q: %v", lineNum, m.dbCol.Name, parseErr))
				return
			}
			row[mIdx] = parsedVal
		}
		records = append(records, row)
	}

	if len(records) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"inserted_count": 0,
			"duration_ms":   adapter.ElapsedMs(start),
			"message":        "CSV contained 0 data rows",
		})
		return
	}

	inserted, err := importer.BulkInsert(r.Context(), table, targetColNames, records)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "bulk insert failed: "+err.Error())
		return
	}

	s.logAudit(r, audit.ActionSchemaChange, table, fmt.Sprintf("imported %d rows", inserted))

	writeJSON(w, http.StatusOK, map[string]any{
		"inserted_count": inserted,
		"duration_ms":   adapter.ElapsedMs(start),
	})
}

// parseCSVField parses a raw CSV string value into a typed Go value based on the column's schema.
func parseCSVField(val string, col schema.Column) (any, error) {
	if val == "" {
		// Nullable columns or primary keys without value are set to nil
		if col.Nullable || col.IsPrimaryKey {
			return nil, nil
		}
		typeKind := classifyType(col.Type)
		if typeKind == "string" {
			return "", nil
		}
		return nil, nil
	}

	typeKind := classifyType(col.Type)
	switch typeKind {
	case "int":
		n, err := strconv.ParseInt(val, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid integer %q", val)
		}
		return n, nil

	case "float":
		f, err := strconv.ParseFloat(val, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid float %q", val)
		}
		return f, nil

	case "bool":
		lower := strings.ToLower(val)
		if lower == "true" || lower == "1" || lower == "t" || lower == "yes" {
			return true, nil
		}
		if lower == "false" || lower == "0" || lower == "f" || lower == "no" {
			return false, nil
		}
		return nil, fmt.Errorf("invalid boolean %q", val)

	case "json":
		var js any
		if err := json.Unmarshal([]byte(val), &js); err != nil {
			// If not valid JSON, pass raw string
			return val, nil
		}
		return val, nil

	default:
		return val, nil
	}
}

// classifyType returns the general category of a database column type.
func classifyType(colType string) string {
	lower := strings.ToLower(colType)
	switch {
	case strings.Contains(lower, "int"),
		strings.Contains(lower, "serial"),
		strings.Contains(lower, "numeric(0"):
		return "int"

	case strings.Contains(lower, "float"),
		strings.Contains(lower, "double"),
		strings.Contains(lower, "real"),
		strings.Contains(lower, "decimal"),
		strings.Contains(lower, "numeric"):
		return "float"

	case strings.Contains(lower, "bool"):
		return "bool"

	case strings.Contains(lower, "json"):
		return "json"

	default:
		return "string"
	}
}
