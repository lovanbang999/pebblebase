package api

import (
	"sync"
	"testing"
	"time"
)

func TestLoginRateLimiter_AllowsUnderThreshold(t *testing.T) {
	limiter := NewLoginRateLimiter(3, 1*time.Minute)
	ip := "192.168.1.100"

	for i := 0; i < 2; i++ {
		allowed, _ := limiter.Allow(ip)
		if !allowed {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
		limiter.RecordFailure(ip)
	}

	allowed, _ := limiter.Allow(ip)
	if !allowed {
		t.Fatalf("3rd attempt should still be allowed before 3rd failure is recorded")
	}
}

func TestLoginRateLimiter_BlocksOverThreshold(t *testing.T) {
	limiter := NewLoginRateLimiter(3, 1*time.Minute)
	ip := "192.168.1.101"

	for i := 0; i < 3; i++ {
		limiter.RecordFailure(ip)
	}

	allowed, remaining := limiter.Allow(ip)
	if allowed {
		t.Fatalf("4th attempt should be blocked after 3 failures")
	}
	if remaining <= 0 || remaining > 60 {
		t.Fatalf("expected remaining cooldown between 1 and 60 seconds, got %d", remaining)
	}
}

func TestLoginRateLimiter_ResetOnSuccess(t *testing.T) {
	limiter := NewLoginRateLimiter(3, 1*time.Minute)
	ip := "192.168.1.102"

	for i := 0; i < 3; i++ {
		limiter.RecordFailure(ip)
	}

	allowed, _ := limiter.Allow(ip)
	if allowed {
		t.Fatalf("expected to be blocked")
	}

	limiter.Reset(ip)

	allowedAfterReset, _ := limiter.Allow(ip)
	if !allowedAfterReset {
		t.Fatalf("expected to be allowed after successful reset")
	}
}

func TestLoginRateLimiter_ConcurrentSafety(t *testing.T) {
	limiter := NewLoginRateLimiter(100, 1*time.Minute)
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			ip := "10.0.0.1"
			limiter.Allow(ip)
			limiter.RecordFailure(ip)
			if id%10 == 0 {
				limiter.Reset(ip)
			}
		}(i)
	}

	wg.Wait()
}
