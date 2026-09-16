package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The production entrypoint also proxies the local Next development server.
// An Upgrade response must retain the real server's Hijacker, not a gzip writer.
func TestGzipPreservesUpgradeTransport(t *testing.T) {
	seen := make(chan bool, 1)
	server := httptest.NewServer(Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, ok := w.(http.Hijacker)
		seen <- ok
		w.WriteHeader(http.StatusNoContent)
	})))
	defer server.Close()
	request, err := http.NewRequest(http.MethodGet, server.URL+"/_next/hmr", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Connection", "Upgrade")
	request.Header.Set("Upgrade", "websocket")
	request.Header.Set("Accept-Encoding", "gzip")
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if !<-seen || response.Header.Get("Content-Encoding") != "" {
		t.Fatal("Upgrade transport was wrapped in gzip")
	}
}
