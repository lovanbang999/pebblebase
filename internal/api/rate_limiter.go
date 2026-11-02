package api

import (
	"sync"
	"time"
)

type attemptRecord struct {
	timestamps []time.Time
}

// LoginRateLimiter implements an in-memory sliding-window rate limiter by client IP.
type LoginRateLimiter struct {
	mu          sync.Mutex
	attempts    map[string]*attemptRecord
	maxAttempts int
	window      time.Duration
}

// NewLoginRateLimiter creates a LoginRateLimiter with max failed attempts threshold and sliding window duration.
func NewLoginRateLimiter(maxAttempts int, window time.Duration) *LoginRateLimiter {
	return &LoginRateLimiter{
		attempts:    make(map[string]*attemptRecord),
		maxAttempts: maxAttempts,
		window:      window,
	}
}

// Allow checks if the given IP is allowed to attempt login.
// Returns false along with remaining cool-down seconds if the IP has exceeded max failed attempts in the window.
func (l *LoginRateLimiter) Allow(ip string) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-l.window)

	record, exists := l.attempts[ip]
	if !exists {
		return true, 0
	}

	// Purge timestamps older than cutoff
	valid := record.timestamps[:0]
	for _, t := range record.timestamps {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	record.timestamps = valid

	if len(valid) >= l.maxAttempts {
		oldestInWindow := valid[0]
		remaining := int(l.window.Seconds() - now.Sub(oldestInWindow).Seconds())
		if remaining <= 0 {
			remaining = 1
		}
		return false, remaining
	}

	return true, 0
}

// RecordFailure records a failed login attempt for the given IP.
func (l *LoginRateLimiter) RecordFailure(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	record, exists := l.attempts[ip]
	if !exists {
		record = &attemptRecord{}
		l.attempts[ip] = record
	}
	record.timestamps = append(record.timestamps, now)
}

// Reset clears failure records for the given IP upon successful login.
func (l *LoginRateLimiter) Reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, ip)
}
