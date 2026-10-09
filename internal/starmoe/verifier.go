// Package starmoe verifies OpenID Connect ID tokens issued by StarMoe pass
// (a Logto OIDC provider). Only ES384-signed compact JWTs are accepted.
package starmoe

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

// DefaultIssuer is the StarMoe pass OIDC issuer.
const DefaultIssuer = "https://passport.star.moe/oidc"

const (
	clockLeeway             = 60 * time.Second
	maxTokenBytes           = 16 << 10
	maxJWKSBytes            = 1 << 20
	defaultJWKSCacheTTL     = time.Hour
	defaultUnknownKidPeriod = time.Minute
	jwksFetchTimeout        = 10 * time.Second
	p384CoordinateBytes     = 48
	es384SignatureBytes     = 2 * p384CoordinateBytes
)

var (
	// ErrInvalidToken reports a token that is malformed, badly signed or whose
	// claims do not validate. Callers should answer 401.
	ErrInvalidToken = errors.New("starmoe: invalid token")
	// ErrKeysUnavailable reports that the signing keys could not be fetched.
	// Callers should answer 503: the token may well be valid.
	ErrKeysUnavailable = errors.New("starmoe: signing keys unavailable")
	// ErrDisabled is returned when no client ID is configured.
	ErrDisabled = errors.New("starmoe: verification disabled")
)

// Claims holds the validated subset of ID token claims.
type Claims struct {
	Subject   string
	Name      string
	Username  string
	Picture   string
	Issuer    string
	Audience  []string
	ExpiresAt time.Time
	IssuedAt  time.Time
}

// DisplayName picks the best human readable name from the claims.
func (c *Claims) DisplayName() string {
	if c == nil {
		return ""
	}
	if name := strings.TrimSpace(c.Name); name != "" {
		return name
	}
	if username := strings.TrimSpace(c.Username); username != "" {
		return username
	}
	return ""
}

// Config configures a Verifier.
type Config struct {
	// Issuer must equal the token's iss claim exactly. Defaults to DefaultIssuer.
	Issuer string
	// ClientID must be contained in the token's aud claim. Empty disables verification.
	ClientID string
	// JWKSURL defaults to Issuer + "/jwks".
	JWKSURL string
	// HTTPClient defaults to a client with a 10s timeout.
	HTTPClient *http.Client
	// Now defaults to time.Now.
	Now func() time.Time
	// CacheTTL is how long fetched keys are trusted before a background
	// refresh is attempted. Defaults to one hour.
	CacheTTL time.Duration
	// MinRefreshInterval bounds JWKS refetches triggered by unknown key IDs.
	// Defaults to one minute.
	MinRefreshInterval time.Duration
}

// Verifier validates StarMoe ID tokens against the provider JWKS.
type Verifier struct {
	issuer     string
	clientID   string
	jwksURL    string
	client     *http.Client
	now        func() time.Time
	cacheTTL   time.Duration
	minRefresh time.Duration

	mu          sync.RWMutex
	keys        map[string]*ecdsa.PublicKey
	fetchedAt   time.Time
	lastAttempt time.Time

	fetchMu sync.Mutex
}

// NewVerifier builds a verifier. It never performs network I/O itself; keys
// are fetched lazily on the first verification.
func NewVerifier(cfg Config) *Verifier {
	issuer := strings.TrimSpace(cfg.Issuer)
	if issuer == "" {
		issuer = DefaultIssuer
	}
	issuer = strings.TrimRight(issuer, "/")
	jwksURL := strings.TrimSpace(cfg.JWKSURL)
	if jwksURL == "" {
		jwksURL = issuer + "/jwks"
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: jwksFetchTimeout}
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	cacheTTL := cfg.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = defaultJWKSCacheTTL
	}
	minRefresh := cfg.MinRefreshInterval
	if minRefresh <= 0 {
		minRefresh = defaultUnknownKidPeriod
	}
	return &Verifier{
		issuer:     issuer,
		clientID:   strings.TrimSpace(cfg.ClientID),
		jwksURL:    jwksURL,
		client:     client,
		now:        now,
		cacheTTL:   cacheTTL,
		minRefresh: minRefresh,
	}
}

// Enabled reports whether a client ID is configured.
func (v *Verifier) Enabled() bool {
	return v != nil && v.clientID != ""
}

// Issuer returns the configured issuer.
func (v *Verifier) Issuer() string { return v.issuer }

type jwtHeader struct {
	Alg  string          `json:"alg"`
	Kid  string          `json:"kid"`
	Typ  string          `json:"typ"`
	Crit json.RawMessage `json:"crit"`
}

type jwtPayload struct {
	Iss      *string         `json:"iss"`
	Sub      *string         `json:"sub"`
	Aud      json.RawMessage `json:"aud"`
	Exp      *json.Number    `json:"exp"`
	Nbf      *json.Number    `json:"nbf"`
	Iat      *json.Number    `json:"iat"`
	Name     *string         `json:"name"`
	Username *string         `json:"username"`
	Picture  *string         `json:"picture"`
}

func invalid(format string, args ...interface{}) error {
	return fmt.Errorf("%w: %s", ErrInvalidToken, fmt.Sprintf(format, args...))
}

// Verify checks the compact JWT and returns its claims.
func (v *Verifier) Verify(ctx context.Context, token string) (*Claims, error) {
	if !v.Enabled() {
		return nil, ErrDisabled
	}
	if len(token) == 0 || len(token) > maxTokenBytes {
		return nil, invalid("token length out of range")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return nil, invalid("malformed compact serialization")
	}

	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, invalid("header encoding")
	}
	var header jwtHeader
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, invalid("header json")
	}
	// Strict algorithm pinning: never let the token choose the algorithm.
	if header.Alg != "ES384" {
		return nil, invalid("unsupported alg %q", header.Alg)
	}
	if len(header.Crit) > 0 {
		return nil, invalid("crit header not supported")
	}
	if header.Typ != "" && !strings.EqualFold(header.Typ, "JWT") {
		return nil, invalid("unexpected typ %q", header.Typ)
	}
	if header.Kid == "" {
		return nil, invalid("missing kid")
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(signature) != es384SignatureBytes {
		return nil, invalid("signature encoding")
	}

	key, err := v.key(ctx, header.Kid)
	if err != nil {
		return nil, err
	}

	digest := sha512.Sum384([]byte(parts[0] + "." + parts[1]))
	r := new(big.Int).SetBytes(signature[:p384CoordinateBytes])
	s := new(big.Int).SetBytes(signature[p384CoordinateBytes:])
	if !ecdsa.Verify(key, digest[:], r, s) {
		return nil, invalid("bad signature")
	}

	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, invalid("payload encoding")
	}
	decoder := json.NewDecoder(bytes.NewReader(payloadJSON))
	decoder.UseNumber()
	var payload jwtPayload
	if err := decoder.Decode(&payload); err != nil {
		return nil, invalid("payload json")
	}
	return v.validateClaims(&payload)
}

func (v *Verifier) validateClaims(p *jwtPayload) (*Claims, error) {
	now := v.now()
	if p.Iss == nil || *p.Iss != v.issuer {
		return nil, invalid("issuer mismatch")
	}
	audience, err := parseAudience(p.Aud)
	if err != nil {
		return nil, err
	}
	audienceOK := false
	for _, aud := range audience {
		if aud == v.clientID {
			audienceOK = true
			break
		}
	}
	if !audienceOK {
		return nil, invalid("audience mismatch")
	}
	if p.Sub == nil || strings.TrimSpace(*p.Sub) == "" {
		return nil, invalid("missing sub")
	}

	exp, err := numericDate(p.Exp, true)
	if err != nil {
		return nil, invalid("exp: %v", err)
	}
	if now.After(exp.Add(clockLeeway)) {
		return nil, invalid("token expired")
	}
	iat, err := numericDate(p.Iat, true)
	if err != nil {
		return nil, invalid("iat: %v", err)
	}
	if iat.After(now.Add(clockLeeway)) {
		return nil, invalid("token issued in the future")
	}
	if p.Nbf != nil {
		nbf, err := numericDate(p.Nbf, false)
		if err != nil {
			return nil, invalid("nbf: %v", err)
		}
		if nbf.After(now.Add(clockLeeway)) {
			return nil, invalid("token not yet valid")
		}
	}

	claims := &Claims{
		Subject:   *p.Sub,
		Issuer:    *p.Iss,
		Audience:  audience,
		ExpiresAt: exp,
		IssuedAt:  iat,
	}
	if p.Name != nil {
		claims.Name = *p.Name
	}
	if p.Username != nil {
		claims.Username = *p.Username
	}
	if p.Picture != nil {
		claims.Picture = *p.Picture
	}
	return claims, nil
}

func parseAudience(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, invalid("missing aud")
	}
	var single string
	if err := json.Unmarshal(raw, &single); err == nil {
		return []string{single}, nil
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err != nil {
		return nil, invalid("aud must be a string or an array of strings")
	}
	return many, nil
}

func numericDate(n *json.Number, required bool) (time.Time, error) {
	if n == nil {
		if required {
			return time.Time{}, errors.New("missing")
		}
		return time.Time{}, nil
	}
	f, err := n.Float64()
	if err != nil || f < 0 || f > 1e11 {
		return time.Time{}, errors.New("not a valid NumericDate")
	}
	sec := int64(f)
	nsec := int64((f - float64(sec)) * 1e9)
	return time.Unix(sec, nsec), nil
}

// key returns the verification key for kid, refreshing the JWKS when the
// cache is stale or the kid is unknown (rate limited to MinRefreshInterval).
func (v *Verifier) key(ctx context.Context, kid string) (*ecdsa.PublicKey, error) {
	v.mu.RLock()
	key := v.keys[kid]
	fetchedAt := v.fetchedAt
	lastAttempt := v.lastAttempt
	v.mu.RUnlock()

	now := v.now()
	stale := fetchedAt.IsZero() || now.Sub(fetchedAt) > v.cacheTTL
	if key != nil && !stale {
		return key, nil
	}
	// Refetch at most once per minRefresh, whatever triggered it (stale cache
	// or an unknown kid), so forged kids cannot hammer the provider.
	canRetry := lastAttempt.IsZero() || now.Sub(lastAttempt) >= v.minRefresh
	if !canRetry {
		if key != nil {
			return key, nil
		}
		if fetchedAt.IsZero() {
			return nil, fmt.Errorf("%w: recent fetch failed", ErrKeysUnavailable)
		}
		return nil, invalid("unknown kid")
	}

	refreshErr := v.refresh(ctx, lastAttempt)
	v.mu.RLock()
	key = v.keys[kid]
	v.mu.RUnlock()
	if key != nil {
		return key, nil
	}
	if refreshErr != nil {
		return nil, fmt.Errorf("%w: %v", ErrKeysUnavailable, refreshErr)
	}
	return nil, invalid("unknown kid")
}

// refresh fetches the JWKS unless another goroutine already did so after
// observedAttempt.
func (v *Verifier) refresh(ctx context.Context, observedAttempt time.Time) error {
	v.fetchMu.Lock()
	defer v.fetchMu.Unlock()

	v.mu.RLock()
	attempted := v.lastAttempt
	v.mu.RUnlock()
	if !attempted.Equal(observedAttempt) {
		// Someone refreshed while we waited for the lock.
		return nil
	}

	v.mu.Lock()
	v.lastAttempt = v.now()
	v.mu.Unlock()

	keys, err := v.fetchJWKS(ctx)
	if err != nil {
		return err
	}
	v.mu.Lock()
	v.keys = keys
	v.fetchedAt = v.now()
	v.mu.Unlock()
	return nil
}

type jwk struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func (v *Verifier) fetchJWKS(ctx context.Context) (map[string]*ecdsa.PublicKey, error) {
	// The fetch must not die with the request that triggered it: a fetch
	// attempt blocks further refetches for MinRefreshInterval, so a client
	// that hangs up mid-fetch would otherwise leave every login without keys
	// (or stop a key rotation from being picked up) for that long.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), jwksFetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := v.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks status %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxJWKSBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxJWKSBytes {
		return nil, errors.New("jwks too large")
	}
	return parseJWKS(body)
}

func parseJWKS(body []byte) (map[string]*ecdsa.PublicKey, error) {
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.Unmarshal(body, &set); err != nil {
		return nil, fmt.Errorf("jwks json: %w", err)
	}
	keys := make(map[string]*ecdsa.PublicKey)
	for _, k := range set.Keys {
		if k.Kid == "" || k.Kty != "EC" || k.Crv != "P-384" {
			continue
		}
		if k.Alg != "" && k.Alg != "ES384" {
			continue
		}
		if k.Use != "" && k.Use != "sig" {
			continue
		}
		pub, err := p384PublicKey(k.X, k.Y)
		if err != nil {
			continue
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return nil, errors.New("jwks contains no usable ES384 keys")
	}
	return keys, nil
}

func p384PublicKey(xB64, yB64 string) (*ecdsa.PublicKey, error) {
	x, err := base64.RawURLEncoding.DecodeString(xB64)
	if err != nil || len(x) != p384CoordinateBytes {
		return nil, errors.New("bad x coordinate")
	}
	y, err := base64.RawURLEncoding.DecodeString(yB64)
	if err != nil || len(y) != p384CoordinateBytes {
		return nil, errors.New("bad y coordinate")
	}
	// crypto/ecdh validates that the point is on the curve.
	uncompressed := make([]byte, 0, 1+2*p384CoordinateBytes)
	uncompressed = append(uncompressed, 4)
	uncompressed = append(uncompressed, x...)
	uncompressed = append(uncompressed, y...)
	if _, err := ecdh.P384().NewPublicKey(uncompressed); err != nil {
		return nil, err
	}
	return &ecdsa.PublicKey{
		Curve: elliptic.P384(),
		X:     new(big.Int).SetBytes(x),
		Y:     new(big.Int).SetBytes(y),
	}, nil
}
