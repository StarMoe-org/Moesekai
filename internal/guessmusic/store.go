package guessmusic

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"
)

// ErrNotFound is returned by Store.Get for a missing key.
var ErrNotFound = errors.New("guessmusic: key not found")

// errNoWrite can be returned by an Update callback to leave the value as is.
var errNoWrite = errors.New("guessmusic: no write")

// ZMember is a sorted set member with its score.
type ZMember struct {
	Member string
	Score  float64
}

// Store is the persistence used by the game. Keys are prefixed "gm:".
type Store interface {
	Get(ctx context.Context, key string) ([]byte, error)
	MGet(ctx context.Context, keys ...string) ([][]byte, error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	SetNX(ctx context.Context, key string, value []byte, ttl time.Duration) (bool, error)
	Delete(ctx context.Context, key string) error
	// Update atomically replaces the value of key with fn's result. fn may
	// run more than once and must not have side effects. It receives
	// exists=false for a missing key; returning errNoWrite skips the write.
	Update(ctx context.Context, key string, ttl time.Duration, fn func(current []byte, exists bool) ([]byte, error)) error
	// ZAddNX adds member only if it is not present yet.
	ZAddNX(ctx context.Context, key, member string, score float64) (bool, error)
	// ZRevRank returns the 0-based rank of member, highest score first.
	ZRevRank(ctx context.Context, key, member string) (int64, bool, error)
	ZRevRange(ctx context.Context, key string, start, stop int64) ([]ZMember, error)
	ZCard(ctx context.Context, key string) (int64, error)
	Expire(ctx context.Context, key string, ttl time.Duration) error
	Close() error
	Kind() string
}

type memoryValue struct {
	data    []byte
	expires time.Time
}

type memoryZSet struct {
	scores  map[string]float64
	expires time.Time
}

// MemoryStore is an in-process Store.
type MemoryStore struct {
	mu     sync.Mutex
	values map[string]memoryValue
	zsets  map[string]*memoryZSet
	now    func() time.Time
	stop   chan struct{}
	once   sync.Once
}

// NewMemoryStore creates an in-memory store with a background janitor.
func NewMemoryStore() *MemoryStore {
	s := &MemoryStore{
		values: make(map[string]memoryValue),
		zsets:  make(map[string]*memoryZSet),
		now:    time.Now,
		stop:   make(chan struct{}),
	}
	go s.janitor()
	return s
}

func (s *MemoryStore) janitor() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-ticker.C:
			s.sweep()
		}
	}
}

func (s *MemoryStore) sweep() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for k, v := range s.values {
		if expired(v.expires, now) {
			delete(s.values, k)
		}
	}
	for k, z := range s.zsets {
		if expired(z.expires, now) {
			delete(s.zsets, k)
		}
	}
}

func expired(at, now time.Time) bool {
	return !at.IsZero() && !now.Before(at)
}

func (s *MemoryStore) deadline(ttl time.Duration) time.Time {
	if ttl <= 0 {
		return time.Time{}
	}
	return s.now().Add(ttl)
}

// getLocked returns a live value; callers hold s.mu.
func (s *MemoryStore) getLocked(key string) ([]byte, bool) {
	v, ok := s.values[key]
	if !ok {
		return nil, false
	}
	if expired(v.expires, s.now()) {
		delete(s.values, key)
		return nil, false
	}
	return v.data, true
}

func (s *MemoryStore) zsetLocked(key string, create bool) *memoryZSet {
	z, ok := s.zsets[key]
	if ok && expired(z.expires, s.now()) {
		delete(s.zsets, key)
		ok = false
	}
	if !ok {
		if !create {
			return nil
		}
		z = &memoryZSet{scores: make(map[string]float64)}
		s.zsets[key] = z
	}
	return z
}

func cloneBytes(b []byte) []byte {
	if b == nil {
		return nil
	}
	out := make([]byte, len(b))
	copy(out, b)
	return out
}

func (s *MemoryStore) Get(_ context.Context, key string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, ok := s.getLocked(key)
	if !ok {
		return nil, ErrNotFound
	}
	return cloneBytes(data), nil
}

func (s *MemoryStore) MGet(_ context.Context, keys ...string) ([][]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([][]byte, len(keys))
	for i, k := range keys {
		if data, ok := s.getLocked(k); ok {
			out[i] = cloneBytes(data)
		}
	}
	return out, nil
}

func (s *MemoryStore) Set(_ context.Context, key string, value []byte, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[key] = memoryValue{data: cloneBytes(value), expires: s.deadline(ttl)}
	return nil
}

func (s *MemoryStore) SetNX(_ context.Context, key string, value []byte, ttl time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.getLocked(key); ok {
		return false, nil
	}
	s.values[key] = memoryValue{data: cloneBytes(value), expires: s.deadline(ttl)}
	return true, nil
}

func (s *MemoryStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.values, key)
	delete(s.zsets, key)
	return nil
}

func (s *MemoryStore) Update(_ context.Context, key string, ttl time.Duration, fn func([]byte, bool) ([]byte, error)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, ok := s.getLocked(key)
	next, err := fn(cloneBytes(current), ok)
	if errors.Is(err, errNoWrite) {
		return nil
	}
	if err != nil {
		return err
	}
	s.values[key] = memoryValue{data: cloneBytes(next), expires: s.deadline(ttl)}
	return nil
}

func (s *MemoryStore) ZAddNX(_ context.Context, key, member string, score float64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	z := s.zsetLocked(key, true)
	if _, ok := z.scores[member]; ok {
		return false, nil
	}
	z.scores[member] = score
	return true, nil
}

// sortedLocked orders like Redis ZREVRANGE: score desc, then member desc.
func (z *memoryZSet) sorted() []ZMember {
	out := make([]ZMember, 0, len(z.scores))
	for m, sc := range z.scores {
		out = append(out, ZMember{Member: m, Score: sc})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].Member > out[j].Member
	})
	return out
}

func (s *MemoryStore) ZRevRank(_ context.Context, key, member string) (int64, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	z := s.zsetLocked(key, false)
	if z == nil {
		return 0, false, nil
	}
	if _, ok := z.scores[member]; !ok {
		return 0, false, nil
	}
	for i, m := range z.sorted() {
		if m.Member == member {
			return int64(i), true, nil
		}
	}
	return 0, false, nil
}

func (s *MemoryStore) ZRevRange(_ context.Context, key string, start, stop int64) ([]ZMember, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	z := s.zsetLocked(key, false)
	if z == nil {
		return nil, nil
	}
	all := z.sorted()
	n := int64(len(all))
	if start < 0 {
		start = 0
	}
	if stop < 0 || stop >= n {
		stop = n - 1
	}
	if start > stop || start >= n {
		return nil, nil
	}
	return all[start : stop+1], nil
}

func (s *MemoryStore) ZCard(_ context.Context, key string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	z := s.zsetLocked(key, false)
	if z == nil {
		return 0, nil
	}
	return int64(len(z.scores)), nil
}

func (s *MemoryStore) Expire(_ context.Context, key string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	deadline := s.deadline(ttl)
	if v, ok := s.values[key]; ok {
		v.expires = deadline
		s.values[key] = v
	}
	if z, ok := s.zsets[key]; ok {
		z.expires = deadline
	}
	return nil
}

func (s *MemoryStore) Close() error {
	s.once.Do(func() { close(s.stop) })
	return nil
}

func (s *MemoryStore) Kind() string { return "memory" }
