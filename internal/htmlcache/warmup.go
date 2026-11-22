package htmlcache

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// StartWarmup runs a gentle background worker that warms up uncached routes
// during server idle periods without impacting live external traffic.
func (c *Cache) StartWarmup(ctx context.Context, routes []string, interval time.Duration) {
	if len(routes) == 0 || !c.ready {
		return
	}
	if interval <= 0 {
		interval = 400 * time.Millisecond
	}

	runCtx, cancelRun := context.WithCancel(ctx)
	stopBase := context.AfterFunc(c.baseCtx, cancelRun)

	totalRoutes := len(routes)
	startTime := time.Now()

	c.warmupMu.Lock()
	c.warmupStats = WarmupStats{
		Total:      totalRoutes,
		InProgress: true,
		StartTime:  startTime,
	}
	c.warmupMu.Unlock()

	fmt.Printf("[HTMLCache Warmup] Starting background warmup for %d routes (interval: %v)\n", totalRoutes, interval)

	c.bgWG.Add(1)
	go func() {
		defer c.bgWG.Done()
		defer func() {
			stopBase()
			cancelRun()
		}()

		completedCount := 0
		warmedCount := 0
		skippedCount := 0

		defer func() {
			endTime := time.Now()
			c.warmupMu.Lock()
			c.warmupStats.Completed = completedCount
			c.warmupStats.Warmed = warmedCount
			c.warmupStats.Skipped = skippedCount
			c.warmupStats.InProgress = false
			c.warmupStats.EndTime = endTime
			c.warmupMu.Unlock()

			duration := endTime.Sub(startTime).Round(time.Second)
			fmt.Printf("[HTMLCache Warmup] Stopped/Complete in %v: %d/%d processed (%d newly warmed, %d already cached)\n",
				duration, completedCount, totalRoutes, warmedCount, skippedCount)
		}()

		for i, path := range routes {
			select {
			case <-runCtx.Done():
				return
			default:
			}

			// Normalize path
			if !strings.HasPrefix(path, "/") {
				path = "/" + path
			}

			c.warmupMu.Lock()
			c.warmupStats.Completed = completedCount
			c.warmupStats.Warmed = warmedCount
			c.warmupStats.Skipped = skippedCount
			c.warmupStats.CurrentPath = path
			c.warmupMu.Unlock()

			req, err := http.NewRequestWithContext(runCtx, http.MethodGet, "http://127.0.0.1"+path, nil)
			if err != nil {
				completedCount++
				continue
			}
			req.Header.Set("Accept", "text/html")
			key := cacheKey(req)

			// If already cached and fresh, skip
			if entry, state := c.acquire(key); entry != nil {
				c.release(entry)
				if state == "HIT" {
					skippedCount++
					completedCount++
					if (i+1)%50 == 0 || i < 3 {
						c.logWarmupProgress(completedCount, totalRoutes, warmedCount, skippedCount, path)
					}
					continue
				}
			}

			// Priority yielding: Wait until zero external requests are in flight
			for c.activeRequests.Load() > 0 {
				timer := time.NewTimer(150 * time.Millisecond)
				select {
				case <-runCtx.Done():
					timer.Stop()
					return
				case <-timer.C:
				}
			}

			// Use singleflight so warmup never duplicates a live render or races .meta writes.
			f, leader := c.beginFlight(key)
			if !leader {
				skippedCount++
				completedCount++
				continue
			}

			func() {
				defer c.endFlight(key, f)
				meta, recorded := c.fetchBackground(runCtx, req)
				if meta != nil && c.store(key, meta, recorded.body.Bytes()) {
					f.stored = true
					warmedCount++
				}
			}()
			completedCount++

			if runCtx.Err() != nil {
				return
			}

			if (i+1)%50 == 0 || i < 3 || i+1 == totalRoutes {
				c.logWarmupProgress(completedCount, totalRoutes, warmedCount, skippedCount, path)
			}

			// Yield interval to avoid spiking CPU or memory
			timer := time.NewTimer(interval)
			select {
			case <-runCtx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
		}
	}()
}

func (c *Cache) logWarmupProgress(completed, total, warmed, skipped int, currentPath string) {
	c.mu.Lock()
	bytes := c.bytes
	entries := len(c.items)
	c.mu.Unlock()

	pct := float64(completed) / float64(total) * 100
	fmt.Printf("[HTMLCache Warmup] [%d/%d] (%.1f%%) | Warmed: %d | Hits: %d | Disk: %.1f MB (%d files) | %s\n",
		completed, total, pct, warmed, skipped, float64(bytes)/(1024*1024), entries, currentPath)
}
