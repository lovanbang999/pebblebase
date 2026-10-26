package redis

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"pebblebase/internal/adapter"
)

// Mutate performs key-level mutations: insert (SET), update (SET/EXPIRE), or delete (DEL).
func (a *Adapter) Mutate(ctx context.Context, table string, op adapter.MutationOp) error {
	mutateCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	switch op.Type {
	case "insert":
		keyRaw, ok := op.Values["key"]
		if !ok || keyRaw == nil {
			return fmt.Errorf("redis: insert requires a 'key' field")
		}
		key := fmt.Sprintf("%v", keyRaw)

		valRaw := op.Values["value"]
		val := ""
		if valRaw != nil {
			val = fmt.Sprintf("%v", valRaw)
		}

		var expiration time.Duration
		if ttlRaw, ok := op.Values["ttl"]; ok && ttlRaw != nil {
			if ttlSec, err := strconv.ParseInt(fmt.Sprintf("%v", ttlRaw), 10, 64); err == nil && ttlSec > 0 {
				expiration = time.Duration(ttlSec) * time.Second
			}
		}

		return a.client.Set(mutateCtx, key, val, expiration).Err()

	case "update":
		keyRaw, ok := op.Where["key"]
		if !ok || keyRaw == nil {
			return fmt.Errorf("redis: update requires a 'key' in where condition")
		}
		key := fmt.Sprintf("%v", keyRaw)

		// Check if value is updated
		if valRaw, ok := op.Values["value"]; ok && valRaw != nil {
			val := fmt.Sprintf("%v", valRaw)

			// If new TTL is also provided
			if ttlRaw, ok := op.Values["ttl"]; ok && ttlRaw != nil {
				if ttlSec, err := strconv.ParseInt(fmt.Sprintf("%v", ttlRaw), 10, 64); err == nil {
					if ttlSec > 0 {
						return a.client.Set(mutateCtx, key, val, time.Duration(ttlSec)*time.Second).Err()
					} else if ttlSec == -1 {
						// Persist key
						if err := a.client.Set(mutateCtx, key, val, 0).Err(); err != nil {
							return err
						}
						return a.client.Persist(mutateCtx, key).Err()
					}
				}
			}

			// Update value while keeping existing TTL
			return a.client.Do(mutateCtx, "SET", key, val, "KEEPTTL").Err()
		}

		// If only TTL is being updated
		if ttlRaw, ok := op.Values["ttl"]; ok && ttlRaw != nil {
			ttlSec, err := strconv.ParseInt(fmt.Sprintf("%v", ttlRaw), 10, 64)
			if err != nil {
				return fmt.Errorf("redis: invalid ttl value: %w", err)
			}
			if ttlSec > 0 {
				return a.client.Expire(mutateCtx, key, time.Duration(ttlSec)*time.Second).Err()
			} else if ttlSec == -1 {
				return a.client.Persist(mutateCtx, key).Err()
			}
		}

		return nil

	case "delete":
		keyRaw, ok := op.Where["key"]
		if !ok || keyRaw == nil {
			return fmt.Errorf("redis: delete requires a 'key' in where condition")
		}
		key := fmt.Sprintf("%v", keyRaw)
		return a.client.Del(mutateCtx, key).Err()

	default:
		return fmt.Errorf("redis: unsupported mutation operation %q", op.Type)
	}
}
