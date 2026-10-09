package starmoe

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const (
	testIssuer   = "https://passport.example/oidc"
	testClientID = "moesekai-test-client"
)

type testKey struct {
	kid  string
	priv *ecdsa.PrivateKey
}

func newTestKey(t *testing.T, kid string) testKey {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return testKey{kid: kid, priv: priv}
}

func (k testKey) jwk() map[string]string {
	x := make([]byte, 48)
	y := make([]byte, 48)
	k.priv.PublicKey.X.FillBytes(x)
	k.priv.PublicKey.Y.FillBytes(y)
	return map[string]string{
		"kty": "EC",
		"crv": "P-384",
		"alg": "ES384",
		"use": "sig",
		"kid": k.kid,
		"x":   base64.RawURLEncoding.EncodeToString(x),
		"y":   base64.RawURLEncoding.EncodeToString(y),
	}
}

type jwksServer struct {
	mu    sync.Mutex
	keys  []testKey
	hits  atomic.Int32
	fail  atomic.Bool
	srv   *httptest.Server
	extra []map[string]string
}

func newJWKSServer(t *testing.T, keys ...testKey) *jwksServer {
	t.Helper()
	js := &jwksServer{keys: keys}
	js.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		js.hits.Add(1)
		if js.fail.Load() {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		js.mu.Lock()
		list := make([]map[string]string, 0, len(js.keys)+len(js.extra))
		for _, k := range js.keys {
			list = append(list, k.jwk())
		}
		list = append(list, js.extra...)
		js.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": list})
	}))
	t.Cleanup(js.srv.Close)
	return js
}

func (js *jwksServer) setKeys(keys ...testKey) {
	js.mu.Lock()
	js.keys = keys
	js.mu.Unlock()
}

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

func b64(v interface{}) string {
	raw, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func signES384(t *testing.T, key *ecdsa.PrivateKey, header, payload map[string]interface{}) string {
	t.Helper()
	signingInput := b64(header) + "." + b64(payload)
	digest := sha512.Sum384([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	sig := make([]byte, 96)
	r.FillBytes(sig[:48])
	s.FillBytes(sig[48:])
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func validClaims(now time.Time) map[string]interface{} {
	return map[string]interface{}{
		"iss":      testIssuer,
		"aud":      testClientID,
		"sub":      "user-123",
		"name":     "Mizuki",
		"username": "akiyama",
		"picture":  "https://example.com/a.png",
		"iat":      now.Unix(),
		"exp":      now.Add(time.Hour).Unix(),
	}
}

func newTestVerifier(js *jwksServer, clock *fakeClock) *Verifier {
	return NewVerifier(Config{
		Issuer:   testIssuer,
		ClientID: testClientID,
		JWKSURL:  js.srv.URL + "/jwks",
		Now:      clock.Now,
	})
}

func TestVerifyValidToken(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	v := newTestVerifier(js, clock)

	token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "typ": "JWT", "kid": "k1"}, validClaims(clock.Now()))
	claims, err := v.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.Subject != "user-123" || claims.Name != "Mizuki" || claims.Username != "akiyama" || claims.Picture != "https://example.com/a.png" {
		t.Fatalf("unexpected claims %+v", claims)
	}
	if claims.DisplayName() != "Mizuki" {
		t.Fatalf("DisplayName = %q", claims.DisplayName())
	}

	// Cached: verifying again must not refetch.
	if _, err := v.Verify(context.Background(), token); err != nil {
		t.Fatal(err)
	}
	if got := js.hits.Load(); got != 1 {
		t.Fatalf("jwks fetched %d times, want 1", got)
	}
}

func TestVerifyAudienceArray(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	v := newTestVerifier(js, clock)
	claims := validClaims(clock.Now())
	claims["aud"] = []string{"other", testClientID}
	token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, claims)
	if _, err := v.Verify(context.Background(), token); err != nil {
		t.Fatalf("Verify: %v", err)
	}
}

func TestVerifyRejectsBadClaims(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	now := clock.Now()

	tests := []struct {
		name   string
		mutate func(map[string]interface{})
	}{
		{"expired", func(c map[string]interface{}) { c["exp"] = now.Add(-61 * time.Second).Unix() }},
		{"missing exp", func(c map[string]interface{}) { delete(c, "exp") }},
		{"wrong audience", func(c map[string]interface{}) { c["aud"] = "someone-else" }},
		{"audience array without client", func(c map[string]interface{}) { c["aud"] = []string{"a", "b"} }},
		{"missing audience", func(c map[string]interface{}) { delete(c, "aud") }},
		{"wrong issuer", func(c map[string]interface{}) { c["iss"] = "https://evil.example/oidc" }},
		{"issuer trailing slash", func(c map[string]interface{}) { c["iss"] = testIssuer + "/" }},
		{"not yet valid", func(c map[string]interface{}) { c["nbf"] = now.Add(2 * time.Minute).Unix() }},
		{"issued in future", func(c map[string]interface{}) { c["iat"] = now.Add(2 * time.Minute).Unix() }},
		{"missing sub", func(c map[string]interface{}) { delete(c, "sub") }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := newTestVerifier(js, clock)
			claims := validClaims(now)
			tt.mutate(claims)
			token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, claims)
			_, err := v.Verify(context.Background(), token)
			if !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("err = %v, want ErrInvalidToken", err)
			}
		})
	}
}

func TestVerifyAllowsLeeway(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	now := clock.Now()
	v := newTestVerifier(js, clock)
	claims := validClaims(now)
	claims["exp"] = now.Add(-30 * time.Second).Unix()
	claims["nbf"] = now.Add(30 * time.Second).Unix()
	claims["iat"] = now.Add(30 * time.Second).Unix()
	token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, claims)
	if _, err := v.Verify(context.Background(), token); err != nil {
		t.Fatalf("Verify within leeway: %v", err)
	}
}

func TestVerifyRejectsWrongAlgorithms(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	v := newTestVerifier(js, clock)
	claims := validClaims(clock.Now())

	// Correct ES384 signature but a header claiming another algorithm.
	for _, alg := range []string{"ES256", "RS256", "HS384", "none", "es384", ""} {
		t.Run("alg="+alg, func(t *testing.T) {
			token := signES384(t, key.priv, map[string]interface{}{"alg": alg, "kid": "k1"}, claims)
			if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("err = %v, want ErrInvalidToken", err)
			}
		})
	}

	t.Run("alg none unsigned", func(t *testing.T) {
		token := b64(map[string]interface{}{"alg": "none"}) + "." + b64(claims) + "."
		if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err = %v, want ErrInvalidToken", err)
		}
	})

	t.Run("HS384 keyed with public key bytes", func(t *testing.T) {
		header := b64(map[string]interface{}{"alg": "HS384", "kid": "k1"})
		payload := b64(claims)
		x := key.jwk()["x"]
		mac := hmac.New(sha256.New, []byte(x))
		mac.Write([]byte(header + "." + payload))
		token := header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
		if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err = %v, want ErrInvalidToken", err)
		}
	})

	t.Run("signed by another key", func(t *testing.T) {
		other := newTestKey(t, "k1")
		token := signES384(t, other.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, claims)
		if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err = %v, want ErrInvalidToken", err)
		}
	})

	t.Run("tampered payload", func(t *testing.T) {
		token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, claims)
		parts := strings.Split(token, ".")
		tampered := validClaims(clock.Now())
		tampered["sub"] = "admin"
		parts[1] = b64(tampered)
		if _, err := v.Verify(context.Background(), strings.Join(parts, ".")); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err = %v, want ErrInvalidToken", err)
		}
	})

	t.Run("access token typ", func(t *testing.T) {
		token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1", "typ": "at+jwt"}, claims)
		if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err = %v, want ErrInvalidToken", err)
		}
	})

	t.Run("garbage", func(t *testing.T) {
		for _, token := range []string{"", "a.b", "a.b.c", "....", strings.Repeat("a", maxTokenBytes+1)} {
			if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("token %q: err = %v, want ErrInvalidToken", token, err)
			}
		}
	})
}

func TestVerifyUnknownKidRefreshesOnceAndRateLimits(t *testing.T) {
	oldKey := newTestKey(t, "old")
	js := newJWKSServer(t, oldKey)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	v := newTestVerifier(js, clock)
	claims := validClaims(clock.Now())

	if _, err := v.Verify(context.Background(), signES384(t, oldKey.priv, map[string]interface{}{"alg": "ES384", "kid": "old"}, claims)); err != nil {
		t.Fatal(err)
	}

	// Unknown kid that the provider does not publish either.
	clock.Advance(2 * time.Minute)
	stranger := newTestKey(t, "stranger")
	strangerToken := signES384(t, stranger.priv, map[string]interface{}{"alg": "ES384", "kid": "stranger"}, validClaims(clock.Now()))
	if _, err := v.Verify(context.Background(), strangerToken); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("unknown kid err = %v, want ErrInvalidToken", err)
	}
	hitsAfterUnknown := js.hits.Load()
	if hitsAfterUnknown != 2 {
		t.Fatalf("jwks hits = %d, want 2 (one refresh for the unknown kid)", hitsAfterUnknown)
	}
	// Immediately retrying with forged kids must not refetch.
	for i := 0; i < 5; i++ {
		if _, err := v.Verify(context.Background(), strangerToken); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("err = %v", err)
		}
	}
	if got := js.hits.Load(); got != hitsAfterUnknown {
		t.Fatalf("jwks hits = %d, want %d (rate limited)", got, hitsAfterUnknown)
	}

	// Key rotation: a new kid appears; after the refresh interval it is picked up.
	newKey := newTestKey(t, "new")
	js.setKeys(oldKey, newKey)
	clock.Advance(2 * time.Minute)
	rotated := signES384(t, newKey.priv, map[string]interface{}{"alg": "ES384", "kid": "new"}, validClaims(clock.Now()))
	if _, err := v.Verify(context.Background(), rotated); err != nil {
		t.Fatalf("rotated key: %v", err)
	}
}

func TestVerifyKeysUnavailable(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	js.fail.Store(true)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	v := newTestVerifier(js, clock)
	token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, validClaims(clock.Now()))
	if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("err = %v, want ErrKeysUnavailable", err)
	}
	// Within the refresh interval the failure is remembered without refetching.
	if _, err := v.Verify(context.Background(), token); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("err = %v, want ErrKeysUnavailable", err)
	}
	if got := js.hits.Load(); got != 1 {
		t.Fatalf("jwks hits = %d, want 1", got)
	}
	js.fail.Store(false)
	clock.Advance(2 * time.Minute)
	if _, err := v.Verify(context.Background(), signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, validClaims(clock.Now()))); err != nil {
		t.Fatalf("after recovery: %v", err)
	}
}

func TestStaleKeysSurviveFailedRefresh(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	v := newTestVerifier(js, clock)
	if _, err := v.Verify(context.Background(), signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, validClaims(clock.Now()))); err != nil {
		t.Fatal(err)
	}
	js.fail.Store(true)
	clock.Advance(2 * time.Hour)
	if _, err := v.Verify(context.Background(), signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, validClaims(clock.Now()))); err != nil {
		t.Fatalf("stale key should still verify when refresh fails: %v", err)
	}
}

func TestJWKSRejectsInvalidKeys(t *testing.T) {
	key := newTestKey(t, "k1")
	good := key.jwk()
	offCurve := key.jwk()
	offCurve["kid"] = "bad"
	offCurve["y"] = offCurve["x"]
	wrongCurve := key.jwk()
	wrongCurve["kid"] = "p256"
	wrongCurve["crv"] = "P-256"
	wrongAlg := key.jwk()
	wrongAlg["kid"] = "rs"
	wrongAlg["alg"] = "RS256"
	body, _ := json.Marshal(map[string]interface{}{"keys": []map[string]string{good, offCurve, wrongCurve, wrongAlg}})
	keys, err := parseJWKS(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 1 || keys["k1"] == nil {
		t.Fatalf("keys = %v, want only k1", keys)
	}
}

func TestDisabledVerifier(t *testing.T) {
	v := NewVerifier(Config{})
	if v.Enabled() {
		t.Fatal("verifier without client ID must be disabled")
	}
	if v.Issuer() != DefaultIssuer {
		t.Fatalf("issuer = %q", v.Issuer())
	}
	if _, err := v.Verify(context.Background(), "x.y.z"); !errors.Is(err, ErrDisabled) {
		t.Fatalf("err = %v, want ErrDisabled", err)
	}
}

// A request that hangs up while it triggers the JWKS fetch must not spoil
// the fetch for everyone else (a failed attempt blocks refetches for a
// minute).
func TestCanceledRequestDoesNotSpoilJWKSFetch(t *testing.T) {
	key := newTestKey(t, "k1")
	js := newJWKSServer(t, key)
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	v := newTestVerifier(js, clock)
	token := signES384(t, key.priv, map[string]interface{}{"alg": "ES384", "kid": "k1"}, validClaims(clock.Now()))

	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	_, _ = v.Verify(canceled, token)
	if _, err := v.Verify(context.Background(), token); err != nil {
		t.Fatalf("after a canceled first request: %v", err)
	}
	if got := js.hits.Load(); got != 1 {
		t.Fatalf("jwks hits = %d, want 1", got)
	}

	// Same for a refresh after the cache went stale with a rotated key.
	rotated := newTestKey(t, "k2")
	js.setKeys(rotated)
	clock.Advance(2 * time.Hour)
	fresh := signES384(t, rotated.priv, map[string]interface{}{"alg": "ES384", "kid": "k2"}, validClaims(clock.Now()))
	canceled, cancel = context.WithCancel(context.Background())
	cancel()
	_, _ = v.Verify(canceled, fresh)
	if _, err := v.Verify(context.Background(), fresh); err != nil {
		t.Fatalf("rotated key after a canceled refresh: %v", err)
	}
}
