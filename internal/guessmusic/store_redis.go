package guessmusic

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const redisUpdateRetries = 16

// RedisStore is a Store backed by Redis.
type RedisStore struct {
	client *redis.Client
}

// NewStore connects to Redis at redisURL (a redis:// URL or host:port) and
// falls back to an in-memory store when Redis is unreachable, mirroring
// internal/cache.
func NewStore(redisURL string, logf func(string, ...interface{})) Store {
	if redisURL == "" {
		return NewMemoryStore()
	}
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		opts = &redis.Options{Addr: redisURL}
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		logf("guess-music: Redis unavailable (%s), using memory store: %v", opts.Addr, err)
		_ = client.Close()
		return NewMemoryStore()
	}
	logf("guess-music: using Redis store at %s", opts.Addr)
	return &RedisStore{client: client}
}

// NewRedisStore wraps an existing client.
func NewRedisStore(client *redis.Client) *RedisStore {
	return &RedisStore{client: client}
}

func (s *RedisStore) Get(ctx context.Context, key string) ([]byte, error) {
	data, err := s.client.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrNotFound
	}
	return data, err
}

func (s *RedisStore) MGet(ctx context.Context, keys ...string) ([][]byte, error) {
	out := make([][]byte, len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	values, err := s.client.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	for i, v := range values {
		switch typed := v.(type) {
		case string:
			out[i] = []byte(typed)
		case []byte:
			out[i] = typed
		}
	}
	return out, nil
}

func (s *RedisStore) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return s.client.Set(ctx, key, value, ttl).Err()
}

func (s *RedisStore) SetNX(ctx context.Context, key string, value []byte, ttl time.Duration) (bool, error) {
	return s.client.SetNX(ctx, key, value, ttl).Result()
}

func (s *RedisStore) Delete(ctx context.Context, key string) error {
	return s.client.Del(ctx, key).Err()
}

func (s *RedisStore) Update(ctx context.Context, key string, ttl time.Duration, fn func([]byte, bool) ([]byte, error)) error {
	for attempt := 0; attempt < redisUpdateRetries; attempt++ {
		err := s.client.Watch(ctx, func(tx *redis.Tx) error {
			current, err := tx.Get(ctx, key).Bytes()
			exists := true
			if errors.Is(err, redis.Nil) {
				exists = false
				current = nil
			} else if err != nil {
				return err
			}
			next, err := fn(current, exists)
			if err != nil {
				return err
			}
			_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
				pipe.Set(ctx, key, next, ttl)
				return nil
			})
			return err
		}, key)
		if errors.Is(err, redis.TxFailedErr) {
			continue
		}
		if errors.Is(err, errNoWrite) {
			return nil
		}
		return err
	}
	return fmt.Errorf("guessmusic: update of %s kept conflicting", key)
}

func (s *RedisStore) ZAddNX(ctx context.Context, key, member string, score float64) (bool, error) {
	n, err := s.client.ZAddNX(ctx, key, redis.Z{Score: score, Member: member}).Result()
	return n > 0, err
}

func (s *RedisStore) ZRevRank(ctx context.Context, key, member string) (int64, bool, error) {
	rank, err := s.client.ZRevRank(ctx, key, member).Result()
	if errors.Is(err, redis.Nil) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return rank, true, nil
}

func (s *RedisStore) ZRevRange(ctx context.Context, key string, start, stop int64) ([]ZMember, error) {
	values, err := s.client.ZRevRangeWithScores(ctx, key, start, stop).Result()
	if err != nil {
		return nil, err
	}
	out := make([]ZMember, 0, len(values))
	for _, z := range values {
		member, _ := z.Member.(string)
		out = append(out, ZMember{Member: member, Score: z.Score})
	}
	return out, nil
}

func (s *RedisStore) ZCard(ctx context.Context, key string) (int64, error) {
	return s.client.ZCard(ctx, key).Result()
}

func (s *RedisStore) Expire(ctx context.Context, key string, ttl time.Duration) error {
	return s.client.Expire(ctx, key, ttl).Err()
}

func (s *RedisStore) Close() error { return s.client.Close() }

func (s *RedisStore) Kind() string { return "redis" }
