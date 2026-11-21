package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ipBucket struct {
	tokens   float64
	lastSeen time.Time
}

// IPRateLimiter is a bounded, memory-safe per-IP token bucket rate limiter.
type IPRateLimiter struct {
	rate       float64 // tokens per second
	burst      float64
	maxEntries int
	idleTTL    time.Duration
	now        func() time.Time

	mu      sync.Mutex
	buckets map[string]*ipBucket
	ops     uint64
}

// NewIPRateLimiter creates a per-IP token bucket limiter allowing qpm requests
// per minute with the given burst size and hard entry cap.
func NewIPRateLimiter(qpm int, burst int, maxEntries int) *IPRateLimiter {
	if qpm <= 0 {
		qpm = 60
	}
	if burst <= 0 {
		burst = 10
	}
	if maxEntries <= 0 {
		maxEntries = 10_000
	}
	return &IPRateLimiter{
		rate:       float64(qpm) / 60.0,
		burst:      float64(burst),
		maxEntries: maxEntries,
		idleTTL:    5 * time.Minute,
		now:        time.Now,
		buckets:    make(map[string]*ipBucket),
	}
}

// Allow reports whether a request from key is permitted and returns a suggested
// Retry-After duration when denied.
func (l *IPRateLimiter) Allow(key string) (bool, time.Duration) {
	if key == "" {
		key = "unknown"
	}
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	l.ops++
	if l.ops%1024 == 0 {
		l.sweepExpiredLocked(now)
	}

	b, ok := l.buckets[key]
	if !ok {
		if len(l.buckets) >= l.maxEntries {
			l.sweepExpiredLocked(now)
			if len(l.buckets) >= l.maxEntries {
				l.evictOldestLocked()
			}
		}
		l.buckets[key] = &ipBucket{
			tokens:   l.burst - 1,
			lastSeen: now,
		}
		return true, 0
	}

	elapsed := now.Sub(b.lastSeen).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * l.rate
		if b.tokens > l.burst {
			b.tokens = l.burst
		}
	}
	b.lastSeen = now

	if b.tokens < 1.0 {
		waitSec := (1.0 - b.tokens) / l.rate
		wait := time.Duration(waitSec * float64(time.Second))
		if wait < time.Second {
			wait = time.Second
		}
		return false, wait
	}
	b.tokens -= 1.0
	return true, 0
}

func (l *IPRateLimiter) sweepExpiredLocked(now time.Time) {
	for k, b := range l.buckets {
		if now.Sub(b.lastSeen) > l.idleTTL {
			delete(l.buckets, k)
		}
	}
}

func (l *IPRateLimiter) evictOldestLocked() {
	var oldestKey string
	var oldestTime time.Time
	first := true
	for k, b := range l.buckets {
		if first || b.lastSeen.Before(oldestTime) {
			oldestKey = k
			oldestTime = b.lastSeen
			first = false
		}
	}
	if !first {
		delete(l.buckets, oldestKey)
	}
}

// ClientIP extracts a stable client IP for rate limiting, preferring
// CF-Connecting-IP, then the first X-Forwarded-For entry, then RemoteAddr.
func ClientIP(r *http.Request) string {
	if cf := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cf != "" {
		return cf
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first := strings.TrimSpace(strings.SplitN(xff, ",", 2)[0])
		if first != "" {
			return first
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}
