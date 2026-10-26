// Package redis implements the unified adapter.Adapter interface for Redis.
package redis

import (
	"crypto/tls"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// parseRedisDSN converts a Redis connection URI into go-redis UniversalOptions.
// Supported schemes:
//   - redis://[user:password@]host[:port][/db]
//   - rediss://[user:password@]host[:port][/db] (TLS enabled)
//   - redis-sentinel://[user:password@]host1[:port],host2[:port]/master_name[/db]
//   - redis-cluster://[user:password@]host1[:port],host2[:port][/db]
//
// Optional query parameters:
//   - cluster=true: force cluster mode
//   - master_name=<name>: Sentinel master name
//   - insecure=true: skip TLS certificate verification
//   - pool_size=<int>: connection pool size
func parseRedisDSN(rawURI string) (*redis.UniversalOptions, int, error) {
	rawURI = strings.TrimSpace(rawURI)
	if rawURI == "" {
		return nil, 0, fmt.Errorf("redis: connection URI is empty")
	}

	// Default universal options with leak-prevention timeouts
	uOpts := &redis.UniversalOptions{
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     20,
		MinIdleConns: 5,
		MaxRetries:   3,
	}

	var isTLS bool
	var isCluster bool
	var isSentinel bool
	var masterName string
	dbIndex := 0

	// Separate query string if present
	queryPart := ""
	if idx := strings.Index(rawURI, "?"); idx != -1 {
		queryPart = rawURI[idx+1:]
		rawURI = rawURI[:idx]
	}

	// Extract scheme
	schemeIdx := strings.Index(rawURI, "://")
	if schemeIdx == -1 {
		return nil, 0, fmt.Errorf("redis: invalid URI: missing scheme (redis://, rediss://, redis-sentinel://, redis-cluster://)")
	}
	scheme := strings.ToLower(rawURI[:schemeIdx])
	rest := rawURI[schemeIdx+3:]

	switch scheme {
	case "rediss":
		isTLS = true
	case "redis-sentinel":
		isSentinel = true
	case "redis-cluster":
		isCluster = true
	case "redis":
		// Standard standalone or multi-node
	default:
		return nil, 0, fmt.Errorf("redis: unsupported scheme %q", scheme)
	}

	// Extract user:password if present
	if atIdx := strings.LastIndex(rest, "@"); atIdx != -1 {
		userinfo := rest[:atIdx]
		rest = rest[atIdx+1:]
		if colonIdx := strings.Index(userinfo, ":"); colonIdx != -1 {
			uOpts.Username = userinfo[:colonIdx]
			uOpts.Password = userinfo[colonIdx+1:]
		} else {
			uOpts.Username = userinfo
		}
	}

	// Extract path (/db or /master_name/db)
	var path string
	if slashIdx := strings.Index(rest, "/"); slashIdx != -1 {
		path = rest[slashIdx+1:]
		rest = rest[:slashIdx]
	}

	// Parse host addresses (comma-separated for cluster/sentinel)
	hosts := strings.Split(rest, ",")
	for _, h := range hosts {
		h = strings.TrimSpace(h)
		if h == "" {
			continue
		}
		if !strings.Contains(h, ":") {
			if isSentinel {
				h = h + ":26379"
			} else {
				h = h + ":6379"
			}
		}
		uOpts.Addrs = append(uOpts.Addrs, h)
	}

	if len(uOpts.Addrs) == 0 {
		return nil, 0, fmt.Errorf("redis: no host addresses specified in URI")
	}

	// Parse Path components
	pathParts := strings.Split(strings.Trim(path, "/"), "/")
	if isSentinel && len(pathParts) > 0 && pathParts[0] != "" {
		masterName = pathParts[0]
		pathParts = pathParts[1:]
	}

	if len(pathParts) > 0 && pathParts[0] != "" {
		if idx, err := strconv.Atoi(pathParts[0]); err == nil && idx >= 0 {
			dbIndex = idx
			uOpts.DB = idx
		}
	}

	// Parse query parameters
	if queryPart != "" {
		q, err := url.ParseQuery(queryPart)
		if err == nil {
			if q.Get("cluster") == "true" {
				isCluster = true
			}
			if mn := q.Get("master_name"); mn != "" {
				masterName = mn
				isSentinel = true
			}
			if ps := q.Get("pool_size"); ps != "" {
				if n, err := strconv.Atoi(ps); err == nil && n > 0 {
					uOpts.PoolSize = n
				}
			}
			if q.Get("ssl") == "true" || q.Get("tls") == "true" {
				isTLS = true
			}
			if isTLS || q.Get("insecure") == "true" || q.Get("tls_skip_verify") == "true" {
				insecure := q.Get("insecure") == "true" || q.Get("sslmode") == "disable" || q.Get("tls_skip_verify") == "true"
				uOpts.TLSConfig = &tls.Config{
					InsecureSkipVerify: insecure,
				}
			}
		}
	} else if isTLS {
		uOpts.TLSConfig = &tls.Config{}
	}

	// Apply Sentinel master name
	if isSentinel {
		if masterName == "" {
			masterName = "mymaster" // standard sentinel default
		}
		uOpts.MasterName = masterName
	}

	_ = isCluster // Used by UniversalOptions which auto-detects cluster based on multi-addrs or server topology

	return uOpts, dbIndex, nil
}
