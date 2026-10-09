package guessmusic

import (
	"net"
	"sync"
	"time"
)

// rateLimiter allows limit events per window per key (sliding log).
type rateLimiter struct {
	limit  int
	window time.Duration
	now    func() time.Time

	mu     sync.Mutex
	events map[string][]time.Time
	sweeps int
}

func newRateLimiter(limit int, window time.Duration, now func() time.Time) *rateLimiter {
	return &rateLimiter{limit: limit, window: window, now: now, events: make(map[string][]time.Time)}
}

// limitKey is the bucket of a client address: IPv6 clients are grouped by
// their /64 (one subscriber's network, inside which a client can pick a new
// address for every request), everything else counts as is.
func limitKey(key string) string {
	ip := net.ParseIP(key)
	if ip == nil || ip.To4() != nil {
		return key
	}
	return ip.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

// Allow records an event for key (a client IP) and reports whether it is
// within the limit. Loopback clients (local development) are not limited.
func (l *rateLimiter) Allow(key string) bool {
	if ip := net.ParseIP(key); ip != nil && ip.IsLoopback() {
		return true
	}
	key = limitKey(key)
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	cutoff := now.Add(-l.window)
	l.sweeps++
	if l.sweeps >= 1024 {
		l.sweeps = 0
		for k, times := range l.events {
			if len(times) == 0 || !times[len(times)-1].After(cutoff) {
				delete(l.events, k)
			}
		}
	}
	times := l.events[key]
	kept := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.events[key] = kept
		return false
	}
	l.events[key] = append(kept, now)
	return true
}
