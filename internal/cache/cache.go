package cache

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache struct {
	redis       *redis.Client
	memoryCache sync.Map
	useRedis    bool
}

type MemoryCacheItem struct {
	Data      []byte
	ExpiresAt time.Time
}

var ctx = context.Background()

// New creates a new cache instance with Redis support
// Falls back to memory cache if Redis is unavailable
func New(redisURL string) *Cache {
	c := &Cache{
		useRedis: false,
	}

	if redisURL != "" {
		var opts *redis.Options
		var err error

		// Try to parse as connection URL first
		if opts, err = redis.ParseURL(redisURL); err != nil {
			// Fallback: treat as direct address
			opts = &redis.Options{
				Addr: redisURL,
			}
		}
		// Skip CLIENT SETINFO on connect: when it timed out, go-redis before v9.7.3 kept the
		// connection with unread replies and later commands got each other's answers (CVE-2025-29923)
		opts.DisableIdentity = true

		client := redis.NewClient(opts)

		// Test connection with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		_, err = client.Ping(ctx).Result()
		if err != nil {
			fmt.Printf("Redis connection failed (%s), using memory cache: %v\n", redisURL, err)
			return c
		}

		c.redis = client
		c.useRedis = true
		// Mask password in log if present
		fmt.Printf("Redis connected successfully: %s\n", opts.Addr)
	}

	return c
}

// Get retrieves a value from cache
func (c *Cache) Get(key string) ([]byte, bool) {
	if c.useRedis {
		val, err := c.redis.Get(ctx, key).Bytes()
		if err == nil {
			return val, true
		}
		return nil, false
	}

	// Memory cache fallback
	if item, ok := c.memoryCache.Load(key); ok {
		cached := item.(MemoryCacheItem)
		if time.Now().Before(cached.ExpiresAt) {
			return cached.Data, true
		}
		c.memoryCache.Delete(key)
	}
	return nil, false
}

// Set stores a value in cache with TTL
func (c *Cache) Set(key string, value []byte, ttl time.Duration) error {
	if c.useRedis {
		return c.redis.Set(ctx, key, value, ttl).Err()
	}

	// Memory cache fallback
	c.memoryCache.Store(key, MemoryCacheItem{
		Data:      value,
		ExpiresAt: time.Now().Add(ttl),
	})
	return nil
}

// Delete removes a key from cache
func (c *Cache) Delete(key string) error {
	if c.useRedis {
		return c.redis.Del(ctx, key).Err()
	}
	c.memoryCache.Delete(key)
	return nil
}

// IsRedisEnabled returns whether Redis is being used
func (c *Cache) IsRedisEnabled() bool {
	return c.useRedis
}

// Close closes Redis connection if enabled
func (c *Cache) Close() error {
	if c.useRedis && c.redis != nil {
		return c.redis.Close()
	}
	return nil
}
