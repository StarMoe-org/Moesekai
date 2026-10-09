package middleware

import (
	"bytes"
	"compress/gzip"
	"io"
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

// A streaming proxy flushes after every write; the bytes written so far must
// reach the client then, compressed or not.
func TestGzipFlushesWrittenBytes(t *testing.T) {
	for _, contentType := range []string{"application/json", "audio/mpeg"} {
		t.Run(contentType, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", contentType)
				_, _ = w.Write([]byte("chunk"))
				if err := http.NewResponseController(w).Flush(); err != nil {
					t.Fatalf("flush: %v", err)
				}
				if !rec.Flushed {
					t.Fatal("flush did not reach the connection")
				}
				flushed := rec.Body.Bytes()
				gzipped := rec.Header().Get("Content-Encoding") == "gzip"
				if gzipped != (contentType == "application/json") {
					t.Fatalf("gzipped = %v for %s", gzipped, contentType)
				}
				if gzipped {
					zr, err := gzip.NewReader(bytes.NewReader(flushed))
					if err != nil {
						t.Fatal(err)
					}
					flushed = make([]byte, len("chunk"))
					if _, err := io.ReadFull(zr, flushed); err != nil {
						t.Fatalf("flushed gzip stream: %v", err)
					}
				}
				if string(flushed) != "chunk" {
					t.Fatalf("flushed %q, want chunk", flushed)
				}
			}))
			req := httptest.NewRequest(http.MethodGet, "/api/guess-music/stream", nil)
			req.Header.Set("Accept-Encoding", "gzip")
			h.ServeHTTP(rec, req)
		})
	}
}
