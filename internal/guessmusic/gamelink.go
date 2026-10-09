package guessmusic

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultHarukiOAuth2BaseURL is Haruki's OAuth2 API (see web/src/lib/oauth.ts).
const DefaultHarukiOAuth2BaseURL = "https://toolbox-api-direct.haruki.seiunx.com/api/oauth2"

const maxHarukiResponseBytes = 4 << 20

var (
	// ErrGameTokenInvalid reports a rejected Haruki access token.
	ErrGameTokenInvalid = errors.New("guessmusic: haruki token rejected")
	// ErrNoGameBinding reports a Haruki account without a usable binding.
	ErrNoGameBinding = errors.New("guessmusic: no usable game binding")
)

var gameServers = map[string]bool{"jp": true, "en": true, "tw": true, "kr": true, "cn": true}

// HarukiLinker verifies Haruki OAuth2 access tokens server-side.
type HarukiLinker struct {
	BaseURL string
	Client  *http.Client
}

// NewHarukiLinker creates a linker for baseURL (default Haruki API).
func NewHarukiLinker(baseURL string) *HarukiLinker {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = DefaultHarukiOAuth2BaseURL
	}
	return &HarukiLinker{
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		Client:  &http.Client{Timeout: 15 * time.Second},
	}
}

func (h *HarukiLinker) get(ctx context.Context, path, token string) (interface{}, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.BaseURL+path, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := h.Client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHarukiResponseBytes+1))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if len(body) > maxHarukiResponseBytes {
		return nil, resp.StatusCode, errors.New("haruki response too large")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("haruki %s: status %s", path, resp.Status)
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var out interface{}
	if err := dec.Decode(&out); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("haruki %s: %w", path, err)
	}
	return out, resp.StatusCode, nil
}

type harukiBinding struct {
	server   string
	userID   string
	verified *bool
	name     string
}

// Resolve verifies token with Haruki and returns the game account it is
// bound to. server/userID optionally pick one binding.
func (h *HarukiLinker) Resolve(ctx context.Context, token, server, userID string) (GameAccount, error) {
	data, status, err := h.get(ctx, "/user/bindings", token)
	if err != nil {
		if status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusBadRequest {
			return GameAccount{}, ErrGameTokenInvalid
		}
		return GameAccount{}, err
	}
	bindings := parseHarukiBindings(data)
	chosen, ok := chooseBinding(bindings, server, userID)
	if !ok {
		return GameAccount{}, ErrNoGameBinding
	}
	account := GameAccount{Server: chosen.server, UserID: chosen.userID, Name: chosen.name}
	if account.Name == "" {
		nctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		account.Name = h.gameName(nctx, token, chosen.server, chosen.userID)
		cancel()
	}
	return account, nil
}

// gameName fetches the in-game nickname (best effort).
func (h *HarukiLinker) gameName(ctx context.Context, token, server, userID string) string {
	data, _, err := h.get(ctx, "/game-data/"+server+"/userGamedata/"+url.PathEscape(userID), token)
	if err != nil {
		return ""
	}
	return findName(data, 0)
}

func findName(v interface{}, depth int) string {
	obj, ok := v.(map[string]interface{})
	if !ok || depth > 3 {
		return ""
	}
	if name, ok := obj["name"].(string); ok && strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	for _, key := range []string{"userGamedata", "data", "result"} {
		if name := findName(obj[key], depth+1); name != "" {
			return name
		}
	}
	return ""
}

func parseHarukiBindings(data interface{}) []harukiBinding {
	list := bindingList(data, 0)
	out := make([]harukiBinding, 0, len(list))
	for _, item := range list {
		obj, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		b := harukiBinding{}
		for _, key := range []string{"server", "region"} {
			if s, ok := obj[key].(string); ok && gameServers[strings.ToLower(strings.TrimSpace(s))] {
				b.server = strings.ToLower(strings.TrimSpace(s))
				break
			}
		}
		for _, key := range []string{"gameId", "userId", "uid"} {
			if id := scalarString(obj[key]); id != "" {
				b.userID = id
				break
			}
		}
		if v, ok := obj["verified"].(bool); ok {
			b.verified = &v
		}
		for _, key := range []string{"name", "nickname", "gameName"} {
			if s, ok := obj[key].(string); ok && strings.TrimSpace(s) != "" {
				b.name = strings.TrimSpace(s)
				break
			}
		}
		if b.server != "" && b.userID != "" {
			out = append(out, b)
		}
	}
	return out
}

func bindingList(data interface{}, depth int) []interface{} {
	switch v := data.(type) {
	case []interface{}:
		return v
	case map[string]interface{}:
		if depth > 1 {
			return nil
		}
		for _, key := range []string{"bindings", "items", "updatedData"} {
			if list, ok := v[key].([]interface{}); ok {
				return list
			}
		}
		for _, key := range []string{"data", "result"} {
			if list := bindingList(v[key], depth+1); list != nil {
				return list
			}
		}
	}
	return nil
}

func scalarString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case json.Number:
		return t.String()
	}
	return ""
}

// chooseBinding picks the requested binding, else prefers verified and JP.
func chooseBinding(bindings []harukiBinding, server, userID string) (harukiBinding, bool) {
	usable := bindings[:0:0]
	for _, b := range bindings {
		if b.verified != nil && !*b.verified {
			continue
		}
		usable = append(usable, b)
	}
	if server != "" || userID != "" {
		for _, b := range usable {
			if (server == "" || b.server == server) && (userID == "" || b.userID == userID) {
				return b, true
			}
		}
		return harukiBinding{}, false
	}
	best, bestScore := harukiBinding{}, -1
	for _, b := range usable {
		score := 0
		if b.verified != nil && *b.verified {
			score += 2
		}
		if b.server == ServerRegion {
			score++
		}
		if score > bestScore {
			best, bestScore = b, score
		}
	}
	return best, bestScore >= 0
}
