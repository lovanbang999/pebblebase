package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pebblebase/internal/adapter"
	"pebblebase/internal/audit"
	"pebblebase/internal/migration"
)

type executeMigrationRequest struct {
	DDL    string `json:"ddl"`
	DryRun bool   `json:"dry_run"`
}

type migrationHistoryResponse struct {
	Items      []migration.MigrationRecord `json:"items"`
	TotalCount int                         `json:"total_count"`
}

// executeMigration executes or dry-runs a DDL migration against a target connection.
// Route: POST /api/connections/{id}/migrations
func (s *Server) executeMigration(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing connection id")
		return
	}

	var req executeMigrationRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body: %v", err))
		return
	}

	trimmedDDL := strings.TrimSpace(req.DDL)
	if trimmedDDL == "" {
		writeError(w, http.StatusBadRequest, "migration DDL cannot be empty")
		return
	}

	conn, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("connection %q not found", id))
		return
	}

	if conn.ReadOnly && !req.DryRun {
		writeError(w, http.StatusForbidden, "connection is read-only: schema mutations are disabled")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	a, err := s.getAdapter(ctx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to get adapter: %v", err))
		return
	}

	runner, ok := a.(adapter.MigrationRunner)
	if !ok {
		writeError(w, http.StatusNotImplemented, fmt.Sprintf("migration runner not implemented for engine %q", conn.Type))
		return
	}

	result, execErr := runner.ExecuteMigration(ctx, trimmedDDL, req.DryRun)

	// In non-dry-run mode, record to persistent migration history
	if !req.DryRun && s.migrationSvc != nil {
		errMsg := result.Error
		if execErr != nil && errMsg == "" {
			errMsg = execErr.Error()
		}

		rec := migration.MigrationRecord{
			ConnectionID: id,
			DDL:          trimmedDDL,
			RollbackSQL:  result.RollbackSQL,
			Success:      result.Success && execErr == nil,
			Error:        errMsg,
			ExecutedAt:   time.Now().UTC(),
		}
		_, _ = s.migrationSvc.Record(ctx, rec)

		summary := trimmedDDL
		if len(summary) > 80 {
			summary = summary[:77] + "..."
		}
		s.logAudit(r, audit.ActionSchemaChange, conn.Name, fmt.Sprintf("Migration (success=%v): %s", result.Success, summary))
	}

	writeJSON(w, http.StatusOK, result)
}

// listMigrations retrieves paginated migration history for a connection.
// Route: GET /api/connections/{id}/migrations
func (s *Server) listMigrations(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing connection id")
		return
	}

	limit := 20
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	if s.migrationSvc == nil {
		writeJSON(w, http.StatusOK, migrationHistoryResponse{Items: []migration.MigrationRecord{}, TotalCount: 0})
		return
	}

	items, total, err := s.migrationSvc.List(r.Context(), id, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to list migrations: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, migrationHistoryResponse{
		Items:      items,
		TotalCount: total,
	})
}

// rollbackMigration executes stored rollback SQL for a previous migration.
// Route: POST /api/connections/{id}/migrations/{mid}/rollback
func (s *Server) rollbackMigration(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	id := r.PathValue("id")
	mid := r.PathValue("mid")
	if id == "" || mid == "" {
		writeError(w, http.StatusBadRequest, "missing connection id or migration id")
		return
	}

	conn, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("connection %q not found", id))
		return
	}

	if conn.ReadOnly {
		writeError(w, http.StatusForbidden, "connection is read-only: schema mutations are disabled")
		return
	}

	if s.migrationSvc == nil {
		writeError(w, http.StatusInternalServerError, "migration history store not configured")
		return
	}

	orig, err := s.migrationSvc.GetByID(r.Context(), mid)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("migration %q not found: %v", mid, err))
		return
	}

	rollbackDDL := strings.TrimSpace(orig.RollbackSQL)
	if rollbackDDL == "" {
		writeError(w, http.StatusBadRequest, "no rollback SQL available for this migration")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	a, err := s.getAdapter(ctx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to get adapter: %v", err))
		return
	}

	runner, ok := a.(adapter.MigrationRunner)
	if !ok {
		writeError(w, http.StatusNotImplemented, fmt.Sprintf("migration runner not implemented for engine %q", conn.Type))
		return
	}

	result, execErr := runner.ExecuteMigration(ctx, rollbackDDL, false)

	errMsg := result.Error
	if execErr != nil && errMsg == "" {
		errMsg = execErr.Error()
	}

	// Record the rollback action in history
	rec := migration.MigrationRecord{
		ConnectionID: id,
		DDL:          rollbackDDL,
		RollbackSQL:  orig.DDL, // Rollback of the rollback is the original DDL
		Success:      result.Success && execErr == nil,
		Error:        errMsg,
		ExecutedAt:   time.Now().UTC(),
	}
	_, _ = s.migrationSvc.Record(ctx, rec)

	s.logAudit(r, audit.ActionSchemaChange, conn.Name, fmt.Sprintf("Rollback migration %s (success=%v)", mid, result.Success))

	writeJSON(w, http.StatusOK, result)
}
