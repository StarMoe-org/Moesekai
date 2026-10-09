package guessmusic

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHarukiLinker(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		switch {
		case token == "Bearer expired":
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid_token"}`))
		case token == "Bearer broken":
			w.WriteHeader(http.StatusBadGateway)
		case r.URL.Path == "/api/oauth2/user/bindings" && token == "Bearer none":
			_, _ = w.Write([]byte(`{"data":{"bindings":[{"server":"jp","userId":1,"verified":false}]}}`))
		case r.URL.Path == "/api/oauth2/user/bindings":
			_, _ = w.Write([]byte(`{"data":{"bindings":[
				{"server":"en","userId":"111","verified":true},
				{"region":"JP","gameId":7485938033569284,"verified":true},
				{"server":"tw","uid":"333"}]}}`))
		case r.URL.Path == "/api/oauth2/game-data/jp/userGamedata/7485938033569284":
			_, _ = w.Write([]byte(`{"userGamedata":{"name":"瑞希","rank":200}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	linker := NewHarukiLinker(srv.URL + "/api/oauth2/")
	ctx := context.Background()

	got, err := linker.Resolve(ctx, "ok", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if got != (GameAccount{Server: "jp", UserID: "7485938033569284", Name: "瑞希"}) {
		t.Fatalf("default choice %+v", got)
	}
	if got, err := linker.Resolve(ctx, "ok", "tw", ""); err != nil || got.UserID != "333" || got.Name != "" {
		t.Fatalf("explicit choice %+v %v", got, err)
	}
	if _, err := linker.Resolve(ctx, "ok", "kr", ""); !errors.Is(err, ErrNoGameBinding) {
		t.Fatalf("missing server: %v", err)
	}
	if _, err := linker.Resolve(ctx, "none", "", ""); !errors.Is(err, ErrNoGameBinding) {
		t.Fatalf("unverified only: %v", err)
	}
	if _, err := linker.Resolve(ctx, "expired", "", ""); !errors.Is(err, ErrGameTokenInvalid) {
		t.Fatalf("expired: %v", err)
	}
	if _, err := linker.Resolve(ctx, "broken", "", ""); err == nil || errors.Is(err, ErrGameTokenInvalid) {
		t.Fatalf("upstream failure: %v", err)
	}
}
