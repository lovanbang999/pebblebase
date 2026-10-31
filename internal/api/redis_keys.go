package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	redisadapter "pebblebase/internal/adapter/redis"
	"pebblebase/internal/audit"
)

// getRedisAdapter retrieves and casts the active adapter to *redisadapter.Adapter.
func (s *Server) getRedisAdapter(r *http.Request, id string) (*redisadapter.Adapter, error) {
	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		return nil, err
	}
	redisAdp, ok := a.(*redisadapter.Adapter)
	if !ok {
		return nil, fmt.Errorf("connection %q is not a Redis database", id)
	}
	return redisAdp, nil
}

// handleRedisScan handles GET /api/connections/{id}/redis/scan
// Query params: cursor (default 0), pattern (default *), count (default 50), type (default all)
func (s *Server) handleRedisScan(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	adp, err := s.getRedisAdapter(r, id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	q := r.URL.Query()
	var cursor uint64
	if cStr := q.Get("cursor"); cStr != "" {
		if c, err := strconv.ParseUint(cStr, 10, 64); err == nil {
			cursor = c
		}
	}

	pattern := q.Get("pattern")
	if pattern == "" {
		pattern = "*"
	}

	var count int64 = 50
	if cntStr := q.Get("count"); cntStr != "" {
		if cnt, err := strconv.ParseInt(cntStr, 10, 64); err == nil && cnt > 0 {
			count = cnt
		}
	}

	typeFilter := q.Get("type")

	res, err := adp.ScanKeysWithMetadata(r.Context(), cursor, pattern, count, typeFilter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleRedisKeyDetail handles GET /api/connections/{id}/redis/key?name={key}
func (s *Server) handleRedisKeyDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	adp, err := s.getRedisAdapter(r, id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	key := r.URL.Query().Get("name")
	if key == "" {
		writeError(w, http.StatusBadRequest, "query parameter 'name' is required")
		return
	}

	detail, err := adp.GetKeyDetail(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, detail)
}

type updateRedisKeyRequest struct {
	Key    string  `json:"key"`
	NewKey string  `json:"new_key,omitempty"`
	TTL    *int64  `json:"ttl,omitempty"`
	Value  *string `json:"value,omitempty"`
}

// handleRedisKeyUpdate handles PUT /api/connections/{id}/redis/key
func (s *Server) handleRedisKeyUpdate(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	id := r.PathValue("id")
	if s.checkReadOnly(w, id) {
		return
	}
	adp, err := s.getRedisAdapter(r, id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateRedisKeyRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "'key' is required")
		return
	}

	// Rename key if requested
	currentKey := req.Key
	if req.NewKey != "" && req.NewKey != req.Key {
		if err := adp.RenameKey(r.Context(), req.Key, req.NewKey); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("rename failed: %v", err))
			return
		}
		currentKey = req.NewKey
	}

	// Update TTL if specified
	if req.TTL != nil {
		if err := adp.SetKeyTTL(r.Context(), currentKey, *req.TTL); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("set ttl failed: %v", err))
			return
		}
	}

	// Update String value if specified
	if req.Value != nil {
		ttlSec := int64(0)
		if req.TTL != nil {
			ttlSec = *req.TTL
		}
		if err := adp.SetStringValue(r.Context(), currentKey, *req.Value, ttlSec); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("set string value failed: %v", err))
			return
		}
	}

	s.logAudit(r, audit.ActionRowMutate, "redis", fmt.Sprintf("update key %s", currentKey))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "key": currentKey})
}

type itemMutateRequest struct {
	Key    string  `json:"key"`
	Type   string  `json:"type"`   // hash, list, set, zset, string
	Action string  `json:"action"` // add, update, delete
	Field  string  `json:"field,omitempty"`
	Value  string  `json:"value,omitempty"`
	Score  float64 `json:"score,omitempty"`
	Index  int64   `json:"index,omitempty"`
	Left   bool    `json:"left,omitempty"`
}

// handleRedisKeyItemMutate handles POST /api/connections/{id}/redis/key/item
func (s *Server) handleRedisKeyItemMutate(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	id := r.PathValue("id")
	if s.checkReadOnly(w, id) {
		return
	}
	adp, err := s.getRedisAdapter(r, id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req itemMutateRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "'key' is required")
		return
	}

	keyType := strings.ToLower(req.Type)
	action := strings.ToLower(req.Action)

	switch keyType {
	case "hash":
		switch action {
		case "add", "update", "set":
			if req.Field == "" {
				writeError(w, http.StatusBadRequest, "hash field is required")
				return
			}
			if err := adp.HSetField(r.Context(), req.Key, req.Field, req.Value); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		case "delete":
			if req.Field == "" {
				writeError(w, http.StatusBadRequest, "hash field is required")
				return
			}
			if err := adp.HDelField(r.Context(), req.Key, req.Field); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		default:
			writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported hash action: %s", action))
			return
		}

	case "list":
		switch action {
		case "push", "add":
			if err := adp.ListPush(r.Context(), req.Key, req.Value, req.Left); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		case "set", "update":
			if err := adp.ListSet(r.Context(), req.Key, req.Index, req.Value); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		case "delete", "remove":
			if err := adp.ListRemove(r.Context(), req.Key, req.Value, 0); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		default:
			writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported list action: %s", action))
			return
		}

	case "set":
		switch action {
		case "add":
			if err := adp.SetAdd(r.Context(), req.Key, req.Value); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		case "delete", "remove":
			if err := adp.SetRemove(r.Context(), req.Key, req.Value); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		default:
			writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported set action: %s", action))
			return
		}

	case "zset":
		switch action {
		case "add", "update", "set":
			if err := adp.ZSetAdd(r.Context(), req.Key, req.Value, req.Score); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		case "delete", "remove":
			if err := adp.ZSetRemove(r.Context(), req.Key, req.Value); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		default:
			writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported zset action: %s", action))
			return
		}

	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported key type for item mutation: %s", keyType))
		return
	}

	s.logAudit(r, audit.ActionRowMutate, "redis", fmt.Sprintf("mutate item on %s key %s", keyType, req.Key))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleRedisKeyDelete handles DELETE /api/connections/{id}/redis/key?name={key}
func (s *Server) handleRedisKeyDelete(w http.ResponseWriter, r *http.Request) {
	if s.viewerBlocked(w, r) {
		return
	}

	id := r.PathValue("id")
	if s.checkReadOnly(w, id) {
		return
	}
	adp, err := s.getRedisAdapter(r, id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	key := r.URL.Query().Get("name")
	if key == "" {
		writeError(w, http.StatusBadRequest, "query parameter 'name' is required")
		return
	}

	if err := adp.DeleteKey(r.Context(), key); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.logAudit(r, audit.ActionRowMutate, "redis", fmt.Sprintf("delete key %s", key))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
