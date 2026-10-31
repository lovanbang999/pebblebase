package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"pebblebase/internal/schema"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/catalog"
)

const (
	findGlobalTimeout     = 12 * time.Second
	findConnectionTimeout = 8 * time.Second
	findTableCap          = 50
	findRowsPerTable      = 4
	findSampleFields      = 6
	findMaxConnections    = 24
)

var (
	findUUID           = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	findOID            = regexp.MustCompile(`(?i)^[0-9a-f]{24}$`)
	findInt            = regexp.MustCompile(`^-?(0|[1-9][0-9]*)$`)
	findSensitiveField = regexp.MustCompile(`(?i)(password|secret|credential|token|api.?key|private.?key)`)
)

type findRequest struct {
	Value             string   `json:"value"`
	ConnectionIDs     []string `json:"connectionIds"`
	IncludeProduction bool     `json:"includeProduction"`
}

type findMatch struct {
	ConnectionID   string           `json:"connectionId"`
	ConnectionName string           `json:"connectionName"`
	Table          string           `json:"table"`
	Count          int              `json:"count"`
	Column         string           `json:"column"`
	Operator       string           `json:"operator"`
	Rows           []map[string]any `json:"rows"`
	Truncated      bool             `json:"truncated,omitempty"`
}

type findConnectionResult struct {
	ConnectionID   string      `json:"connectionId"`
	ConnectionName string      `json:"connectionName"`
	Status         string      `json:"status"`
	Note           string      `json:"note,omitempty"`
	Matches        []findMatch `json:"matches"`
}

func classifyFind(value, kind string) (string, bool) {
	if findUUID.MatchString(value) || findOID.MatchString(value) {
		return "eq", kind == "uuid" || kind == "string"
	}
	if findInt.MatchString(value) {
		if _, err := strconv.ParseInt(value, 10, 64); err == nil && kind == "int" {
			return "eq", true
		}
	}
	if len([]rune(value)) >= 3 && (kind == "string" || kind == "text") {
		return "contains", true
	}
	return "", false
}

func safeFindRow(row map[string]any, matchedColumn ...string) map[string]any {
	out := make(map[string]any, findSampleFields)
	if len(matchedColumn) > 0 && matchedColumn[0] != "" {
		if value, ok := row[matchedColumn[0]]; ok {
			if findSensitiveField.MatchString(matchedColumn[0]) {
				out[matchedColumn[0]] = "[redacted]"
			} else {
				out[matchedColumn[0]] = truncateFindValue(value)
			}
		}
	}
	for key, value := range row {
		if len(out) >= findSampleFields {
			break
		}
		if _, exists := out[key]; exists {
			continue
		}
		if findSensitiveField.MatchString(key) {
			out[key] = "[redacted]"
		} else {
			out[key] = truncateFindValue(value)
		}
	}
	return out
}

func truncateFindValue(value any) any {
	switch v := value.(type) {
	case string:
		runes := []rune(v)
		if len(runes) > 160 {
			return string(runes[:157]) + "..."
		}
	case []byte:
		if len(v) > 80 {
			return fmt.Sprintf("%x…", v[:80])
		}
		return fmt.Sprintf("%x", v)
	}
	return value
}

func (s *Server) findEverywhere(w http.ResponseWriter, r *http.Request) {
	var req findRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Value = strings.TrimSpace(req.Value)
	if req.Value == "" || len(req.Value) > 512 {
		writeError(w, http.StatusBadRequest, "search value must contain 1 to 512 characters")
		return
	}
	if len(req.ConnectionIDs) > findMaxConnections {
		writeError(w, http.StatusBadRequest, "too many connections selected")
		return
	}
	globalCtx, cancel := context.WithTimeout(r.Context(), findGlobalTimeout)
	defer cancel()
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	flusher, _ := w.(http.Flusher)
	results := make(chan findConnectionResult, len(req.ConnectionIDs))
	var wg sync.WaitGroup
	for _, id := range req.ConnectionIDs {
		id := id
		wg.Go(func() { results <- s.searchConnection(globalCtx, id, req) })
	}
	go func() { wg.Wait(); close(results) }()
	encoder := json.NewEncoder(w)
	for {
		select {
		case result, ok := <-results:
			if !ok {
				return
			}
			if err := encoder.Encode(result); err != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		case <-globalCtx.Done():
			return
		}
	}
}

func (s *Server) searchConnection(parent context.Context, id string, req findRequest) findConnectionResult {
	record, err := s.store.Get(id)
	if err != nil {
		return findConnectionResult{ConnectionID: id, Status: "skipped", Note: "connection not found"}
	}
	result := findConnectionResult{ConnectionID: id, ConnectionName: record.Name, Status: "complete", Matches: []findMatch{}}
	if strings.EqualFold(record.Environment, "production") && !req.IncludeProduction {
		result.Status = "skipped"
		result.Note = "skipped (production)"
		return result
	}
	ctx, cancel := context.WithTimeout(parent, findConnectionTimeout)
	defer cancel()
	source, err := s.getAdapter(ctx, id)
	if err != nil {
		result.Status = "skipped"
		result.Note = "skipped (disconnected)"
		return result
	}
	if err := source.Ping(ctx); err != nil {
		result.Status = "skipped"
		result.Note = "skipped (disconnected)"
		return result
	}
	if strings.EqualFold(record.Type, "redis") {
		if finder, ok := source.(interface {
			FindValues(context.Context, string, int, int) ([]adapter.ValueMatch, error)
		}); ok {
			matches, err := finder.FindValues(ctx, req.Value, 1000, findRowsPerTable)
			if err != nil {
				result.Status = "failed"
				result.Note = "search failed"
				return result
			}
			for _, item := range matches {
				rows := make([]map[string]any, 0, len(item.Rows))
				for _, row := range item.Rows {
					rows = append(rows, safeFindRow(row, item.Column))
				}
				result.Matches = append(result.Matches, findMatch{ConnectionID: id, ConnectionName: record.Name, Table: item.Table, Count: item.Count, Column: item.Column, Operator: "contains", Rows: rows, Truncated: item.Truncated})
				if item.Truncated {
					result.Status = "partial"
					result.Note = "Redis key scan limit reached (1000 keys)"
				}
			}
			return result
		}
		result.Status = "failed"
		result.Note = "search unsupported"
		return result
	}
	engine := strings.ToLower(record.Type)
	if engine != "postgres" && engine != "mysql" && engine != "mongodb" {
		result.Status = "skipped"
		result.Note = "skipped (engine unsupported)"
		return result
	}
	tables, err := catalog.ReadSearchSchema(ctx, source)
	if err != nil {
		if ctx.Err() != nil {
			result.Status = "partial"
			result.Note = "connection search timed out"
			return result
		}
		result.Status = "failed"
		result.Note = "schema lookup failed"
		return result
	}
	tableCount := len(tables)
	if tableCount > findTableCap {
		tableCount = findTableCap
	}
	hadQueryError := false
	for _, table := range tables[:tableCount] {
		if ctx.Err() != nil {
			result.Status = "partial"
			result.Note = "connection search timed out"
			return result
		}
		columns := []string{}
		for _, column := range table.Columns {
			if column.IsPrimaryKey {
				columns = append(columns, column.Name)
			} else {
				idName := strings.EqualFold(column.Name, "id") || strings.HasSuffix(strings.ToLower(column.Name), "_id") || strings.HasSuffix(strings.ToLower(column.Name), "id")
				if column.Type == "uuid" || column.Type == "string" && suitableFindText(column, strings.EqualFold(record.Type, "mongodb")) || column.Type == "int" && idName {
					columns = append(columns, column.Name)
				}
			}
		}
		seen := map[string]bool{}
		for _, name := range columns {
			if ctx.Err() != nil {
				result.Status = "partial"
				result.Note = "connection search timed out"
				return result
			}
			if seen[name] {
				continue
			}
			seen[name] = true
			var columnType string
			var columnSchema schema.Column
			for _, column := range table.Columns {
				if column.Name == name {
					columnType = column.Type
					columnSchema = column
					break
				}
			}
			operator, eligible := classifyFind(req.Value, columnType)
			if columnType == "int" && !columnSchema.IsPrimaryKey && !strings.EqualFold(name, "id") && !strings.HasSuffix(strings.ToLower(name), "_id") && !strings.HasSuffix(strings.ToLower(name), "id") {
				eligible = false
			}
			if !eligible {
				continue
			}
			value := any(req.Value)
			if columnType == "int" {
				if parsed, parseErr := strconv.ParseInt(req.Value, 10, 64); parseErr == nil {
					value = parsed
				}
			}
			if operator == "contains" {
				value = req.Value
			}
			query, queryCancel := context.WithTimeout(ctx, 2*time.Second)
			var resultRows []map[string]any
			count := 0
			truncated := false
			if engine == "mysql" && operator == "contains" {
				if finder, ok := source.(interface {
					FindContains(context.Context, string, string, string, int) (adapter.ValueMatch, error)
				}); ok {
					found, queryErr := finder.FindContains(query, table.Name, name, req.Value, findRowsPerTable)
					if queryErr == nil {
						resultRows, count = found.Rows, found.Count
						truncated = found.Truncated
					} else {
						hadQueryError = true
					}
				} else {
					hadQueryError = true
				}
			} else if engine == "mysql" && columnType == "uuid" && strings.Contains(strings.ToLower(columnSchema.NativeType), "binary(16)") {
				if finder, ok := source.(interface {
					FindBinaryUUID(context.Context, string, string, string, int) (adapter.ValueMatch, error)
				}); ok {
					found, queryErr := finder.FindBinaryUUID(query, table.Name, name, req.Value, findRowsPerTable)
					if queryErr == nil {
						resultRows, count = found.Rows, found.Count
						truncated = found.Truncated
					} else {
						hadQueryError = true
					}
				} else {
					hadQueryError = true
				}
			} else if finder, ok := source.(interface {
				FindColumn(context.Context, string, string, any, string, int) (adapter.ValueMatch, error)
			}); ok {
				found, queryErr := finder.FindColumn(query, table.Name, name, value, operator, findRowsPerTable)
				if queryErr == nil {
					resultRows, count = found.Rows, found.Count
					truncated = found.Truncated
				} else {
					hadQueryError = true
				}
			} else {
				rows, queryErr := source.Query(query, table.Name, adapter.QueryOptions{Limit: findRowsPerTable, Filters: []adapter.Filter{{Column: name, Operator: operator, Value: value}}})
				if queryErr == nil {
					resultRows, count = rows.Rows, rows.TotalCount
				} else {
					hadQueryError = true
				}
			}
			queryCancel()
			if len(resultRows) == 0 {
				continue
			}
			match := findMatch{ConnectionID: id, ConnectionName: record.Name, Table: table.Name, Count: count, Column: name, Operator: operator, Rows: make([]map[string]any, 0, len(resultRows)), Truncated: truncated}
			for _, row := range resultRows {
				match.Rows = append(match.Rows, safeFindRow(row, name))
			}
			result.Matches = append(result.Matches, match)
			if truncated {
				result.Status = "partial"
				result.Note = "one or more database result counts were capped by timeout"
			}
		}
	}
	if len(tables) > tableCount {
		result.Note = fmt.Sprintf("table limit reached (%d)", findTableCap)
	}
	if hadQueryError {
		result.Status = "partial"
		if result.Note == "" {
			result.Note = "some catalog queries failed or timed out"
		}
	}
	return result
}

func suitableFindText(column schema.Column, mongo bool) bool {
	if mongo {
		return true
	}
	typ := strings.ToLower(strings.TrimSpace(column.NativeType))
	if typ == "" {
		return true
	}
	if strings.Contains(typ, "text") || strings.Contains(typ, "clob") || strings.Contains(typ, "longtext") {
		return false
	}
	if typ == "varchar" || typ == "character varying" || typ == "nvarchar" {
		return false
	}
	if open := strings.IndexByte(typ, '('); open >= 0 {
		close := strings.IndexByte(typ[open+1:], ')')
		if close >= 0 {
			length, err := strconv.Atoi(strings.TrimSpace(typ[open+1 : open+1+close]))
			if err == nil && length > 2048 {
				return false
			}
		}
	}
	return true
}
