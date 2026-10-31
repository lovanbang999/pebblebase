package api

import (
	"context"
	"encoding/json"
	"net/http"
	"pebblebase/internal/adapter"
	"pebblebase/internal/catalog"
	"pebblebase/internal/schema"
	"strings"
	"time"
)

const (
	referenceCandidateCap = 30
	referenceRowsPerTable = 2
	referenceTableTimeout = 300 * time.Millisecond
)

type referenceRequest struct {
	WorkspaceID       string `json:"workspaceId"`
	CurrentConnection string `json:"currentConnectionId"`
	CurrentTable      string `json:"currentTable"`
	Value             string `json:"value"`
	DeclaredTable     string `json:"declaredTable,omitempty"`
	DeclaredColumn    string `json:"declaredColumn,omitempty"`
}

type referenceMatch struct {
	ConnectionID   string           `json:"connectionId"`
	ConnectionName string           `json:"connectionName"`
	Table          string           `json:"table"`
	Column         string           `json:"column"`
	Count          int              `json:"count"`
	Rows           []map[string]any `json:"rows"`
	RowIdentity    string           `json:"rowIdentity,omitempty"`
}

type referenceResponse struct {
	Matches []referenceMatch `json:"matches"`
	Checked int              `json:"checked"`
}

type referenceCandidate struct {
	connection  string
	table       string
	column      string
	engine      string
	primaryKeys []string
}

func referenceCandidates(tables []schema.Table, connection, engine, excludedTable string) []referenceCandidate {
	candidates := []referenceCandidate{}
	for _, table := range tables {
		if connection == "" || table.Name == excludedTable {
			continue
		}
		primaryKeys := []string{}
		for _, column := range table.Columns {
			if column.IsPrimaryKey {
				primaryKeys = append(primaryKeys, column.Name)
			}
		}
		if len(primaryKeys) > 0 {
			candidates = append(candidates, referenceCandidate{connection: connection, table: table.Name, column: primaryKeys[0], engine: engine, primaryKeys: primaryKeys})
		}
	}
	return candidates
}

func (s *Server) resolveReferences(w http.ResponseWriter, r *http.Request) {
	var req referenceRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid reference lookup request")
		return
	}
	req.Value = strings.TrimSpace(req.Value)
	declared := req.DeclaredTable != "" && req.DeclaredColumn != ""
	if req.Value == "" || len(req.Value) > 512 || req.CurrentConnection == "" || req.WorkspaceID == "" || (!declared && !findUUID.MatchString(req.Value) && !findOID.MatchString(req.Value)) {
		writeError(w, http.StatusBadRequest, "reference value or scope is invalid")
		return
	}
	connections, err := s.referenceWorkspaceConnections(req.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}
	if _, err := s.store.Get(req.CurrentConnection); err != nil || !containsString(connections, req.CurrentConnection) {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}
	if declared {
		connections = []string{req.CurrentConnection}
	}
	response := referenceResponse{Matches: []referenceMatch{}}
	candidates := []referenceCandidate{}
	for _, id := range connections {
		record, getErr := s.store.Get(id)
		if getErr != nil || (strings.EqualFold(record.Environment, "production") && id != req.CurrentConnection) {
			continue
		}
		source, sourceErr := s.getAdapter(r.Context(), id)
		if sourceErr != nil {
			continue
		}
		tables, schemaErr := catalog.ReadSearchSchema(r.Context(), source)
		if schemaErr != nil {
			continue
		}
		if declared {
			relationFound := false
			for _, table := range tables {
				if table.Name != req.CurrentTable {
					continue
				}
				for _, relation := range table.Relations {
					if relation.ToTable == req.DeclaredTable && relation.ToColumn == req.DeclaredColumn {
						relationFound = true
					}
				}
			}
			if !relationFound {
				writeError(w, http.StatusBadRequest, "declared relation not found")
				return
			}
			candidate := referenceCandidate{connection: id, table: req.DeclaredTable, column: req.DeclaredColumn, engine: strings.ToLower(record.Type)}
			for _, table := range tables {
				if table.Name == req.DeclaredTable {
					for _, column := range table.Columns {
						if column.IsPrimaryKey {
							candidate.primaryKeys = append(candidate.primaryKeys, column.Name)
						}
					}
				}
			}
			candidates = append(candidates, candidate)
			break
		}
		for _, candidate := range referenceCandidates(tables, id, strings.ToLower(record.Type), "") {
			if id == req.CurrentConnection && candidate.table == req.CurrentTable {
				continue
			}
			candidates = append(candidates, candidate)
		}
	}
	if len(candidates) > referenceCandidateCap {
		candidates = candidates[:referenceCandidateCap]
	}
	response.Checked = len(candidates)
	for _, candidate := range candidates {
		if err := r.Context().Err(); err != nil {
			break
		}
		tableCtx, cancel := context.WithTimeout(r.Context(), referenceTableTimeout)
		source, sourceErr := s.getAdapter(tableCtx, candidate.connection)
		if sourceErr == nil {
			var found adapter.ValueMatch
			var queryErr error
			if finder, ok := source.(interface {
				FindColumn(context.Context, string, string, any, string, int) (adapter.ValueMatch, error)
			}); ok {
				found, queryErr = finder.FindColumn(tableCtx, candidate.table, candidate.column, req.Value, "eq", referenceRowsPerTable)
			} else {
				var rows adapter.QueryResult
				rows, queryErr = source.Query(tableCtx, candidate.table, adapter.QueryOptions{Limit: referenceRowsPerTable, Filters: []adapter.Filter{{Column: candidate.column, Operator: "eq", Value: req.Value}}})
				found = adapter.ValueMatch{Count: rows.TotalCount, Rows: rows.Rows}
			}
			if queryErr == nil && len(found.Rows) > 0 {
				record, _ := s.store.Get(candidate.connection)
				rows := make([]map[string]any, 0, len(found.Rows))
				for _, row := range found.Rows {
					rows = append(rows, safeReferenceRow(row))
				}
				count := found.Count
				if count < len(found.Rows) {
					count = len(found.Rows)
				}
				identity := ""
				if len(candidate.primaryKeys) > 0 {
					values := make([]any, 0, len(candidate.primaryKeys))
					for _, key := range candidate.primaryKeys {
						values = append(values, found.Rows[0][key])
					}
					if raw, marshalErr := json.Marshal(values); marshalErr == nil {
						identity = string(raw)
					}
				}
				response.Matches = append(response.Matches, referenceMatch{ConnectionID: candidate.connection, ConnectionName: record.Name, Table: candidate.table, Column: candidate.column, Count: count, Rows: rows, RowIdentity: identity})
			}
		}
		cancel()
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) referenceWorkspaceConnections(workspaceID string) ([]string, error) {
	all, err := s.store.List()
	if err != nil {
		return nil, err
	}
	if workspaceID == "all" {
		ids := make([]string, 0, len(all))
		for _, record := range all {
			ids = append(ids, record.ID)
		}
		return ids, nil
	}
	document, err := s.store.Workspaces()
	if err != nil {
		return nil, err
	}
	for _, workspace := range document.Workspaces {
		if workspace.ID == workspaceID {
			return workspace.ConnectionIDs, nil
		}
	}
	return nil, http.ErrNoCookie
}

func safeReferenceRow(row map[string]any) map[string]any {
	const maxFields = 9
	out := make(map[string]any, maxFields)
	for key, value := range row {
		if len(out) == maxFields {
			break
		}
		if findSensitiveField.MatchString(key) {
			out[key] = "[redacted]"
		} else {
			out[key] = truncateFindValue(value)
		}
	}
	return out
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
