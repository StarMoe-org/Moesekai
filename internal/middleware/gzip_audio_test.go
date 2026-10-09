package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGzipSkipsAudio(t *testing.T) {
	h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Header().Set("Content-Length", "4")
		_, _ = w.Write([]byte{0xFF, 0xFB, 0x90, 0x00})
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/guess-music/daily/sessions/x/rounds/0/clip", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Content-Encoding") != "" || rec.Header().Get("Content-Length") != "4" || rec.Body.Len() != 4 {
		t.Fatalf("audio was compressed: %v", rec.Header())
	}
}
