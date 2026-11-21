package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"
)

var gzipWriterPool = sync.Pool{
	New: func() any {
		return gzip.NewWriter(io.Discard)
	},
}

// Gzip middleware for response compression.
// Skips compression if the upstream already compressed the response, if the
// response is bodyless (HEAD, 1xx, 204, 304), or if the MIME type is already
// compressed / streaming.
func Gzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Moly serves precompressed immutable artifacts and owns range/HEAD/ETag
		// semantics. Recompressing them here breaks streaming and wastes CPU.
		if r.Method == http.MethodHead ||
			strings.HasPrefix(r.URL.Path, "/moly/") ||
			r.Header.Get("Upgrade") != "" ||
			!strings.Contains(strings.ToLower(r.Header.Get("Accept-Encoding")), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		grw := &gzipGuardWriter{ResponseWriter: w}
		completed := false
		defer func() {
			if grw.gzWriter != nil {
				if completed {
					_ = grw.gzWriter.Close()
					grw.gzWriter.Reset(io.Discard)
					gzipWriterPool.Put(grw.gzWriter)
				}
				grw.gzWriter = nil
			}
		}()

		next.ServeHTTP(grw, r)
		completed = true
	})
}

// gzipGuardWriter only applies gzip if upstream hasn't already set Content-Encoding
// and the status/content-type are compressible.
type gzipGuardWriter struct {
	http.ResponseWriter
	gzWriter    *gzip.Writer
	wroteHeader bool
}

func (w *gzipGuardWriter) WriteHeader(code int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true

	if code < http.StatusOK || code == http.StatusNoContent || code == http.StatusNotModified {
		w.ResponseWriter.WriteHeader(code)
		return
	}

	// If upstream already set Content-Encoding, or the body is already
	// compressed media (audio/video/images/fonts/archives), opaque binary
	// (sealed guess-music clips), or SSE, don't compress.
	contentType := w.ResponseWriter.Header().Get("Content-Type")
	if w.ResponseWriter.Header().Get("Content-Encoding") != "" || shouldSkipGzipContentType(contentType) {
		w.ResponseWriter.WriteHeader(code)
		return
	}

	// Apply gzip compression using a pooled writer.
	AppendVary(w.ResponseWriter.Header(), "Accept-Encoding")
	w.ResponseWriter.Header().Set("Content-Encoding", "gzip")
	w.ResponseWriter.Header().Del("Content-Length")
	w.ResponseWriter.WriteHeader(code)

	gz := gzipWriterPool.Get().(*gzip.Writer)
	gz.Reset(w.ResponseWriter)
	w.gzWriter = gz
}

func shouldSkipGzipContentType(contentType string) bool {
	if contentType == "" {
		return false
	}
	mediaType := strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	if strings.HasPrefix(mediaType, "audio/") ||
		strings.HasPrefix(mediaType, "video/") ||
		strings.HasPrefix(mediaType, "font/") {
		return true
	}
	if strings.HasPrefix(mediaType, "image/") && mediaType != "image/svg+xml" {
		return true
	}
	switch mediaType {
	case "application/octet-stream",
		"application/zip",
		"application/pdf",
		"application/gzip",
		"application/x-gzip",
		"application/zstd",
		"application/br",
		"application/font-woff",
		"application/font-woff2",
		"text/event-stream":
		return true
	default:
		return false
	}
}

// AppendVary adds value to the Vary header if not already present (case-insensitive).
func AppendVary(header http.Header, value string) {
	for _, existing := range header.Values("Vary") {
		for _, token := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(token), value) {
				return
			}
		}
	}
	header.Add("Vary", value)
}

func (w *gzipGuardWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.gzWriter != nil {
		return w.gzWriter.Write(b)
	}
	return w.ResponseWriter.Write(b)
}

// Flush passes streaming flushes on (the moesekai-api proxy flushes after
// every write), draining the gzip buffer first; without it this wrapper would
// hide the connection's Flusher and hold the bytes back.
func (w *gzipGuardWriter) Flush() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.gzWriter != nil {
		_ = w.gzWriter.Flush()
	}
	_ = http.NewResponseController(w.ResponseWriter).Flush()
}

// Unwrap exposes the underlying ResponseWriter to http.ResponseController.
func (w *gzipGuardWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// CORS middleware for cross-origin requests.
func CORS(next http.Handler) http.Handler {
	allowedOrigins := map[string]bool{
		"https://pjsk.moe":                  true,
		"https://www.pjsk.moe":              true,
		"https://snowyviewer.exmeaning.com": true,
		"http://localhost:3000":             true,
		"http://127.0.0.1:3000":             true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicWildcardCORS(r.URL.Path) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			origin := r.Header.Get("Origin")
			if allowedOrigins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				AppendVary(w.Header(), "Origin")
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isPublicWildcardCORS(path string) bool {
	if strings.HasPrefix(path, "/api/") && strings.HasSuffix(path, "-map") {
		return true
	}
	if path == "/api/mcp" || strings.HasPrefix(path, "/api/mcp/") || strings.HasPrefix(path, "/.well-known/mcp") {
		return true
	}
	return false
}

// Chain applies multiple middlewares in order.
func Chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}
