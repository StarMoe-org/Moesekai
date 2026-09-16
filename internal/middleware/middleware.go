package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// gzipResponseWriter wraps http.ResponseWriter for gzip compression
type gzipResponseWriter struct {
	io.Writer
	http.ResponseWriter
}

func (w gzipResponseWriter) Write(b []byte) (int, error) {
	return w.Writer.Write(b)
}

// Gzip middleware for response compression
// Skips compression if the upstream (e.g., Next.js proxy) already compressed the response
func Gzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Moly serves precompressed immutable artifacts and owns range/HEAD/ETag
		// semantics. Recompressing them here breaks streaming and wastes CPU.
		if strings.HasPrefix(r.URL.Path, "/moly/") || r.Header.Get("Upgrade") != "" || !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		// Use a wrapper that decides whether to gzip based on upstream response
		grw := &gzipGuardWriter{ResponseWriter: w}
		next.ServeHTTP(grw, r)

		// If we started gzip compression, close the writer
		if grw.gzWriter != nil {
			grw.gzWriter.Close()
		}
	})
}

// gzipGuardWriter only applies gzip if upstream hasn't already set Content-Encoding
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

	// If upstream already set Content-Encoding, don't compress
	if w.ResponseWriter.Header().Get("Content-Encoding") != "" {
		w.ResponseWriter.WriteHeader(code)
		return
	}

	// Apply gzip compression
	appendVary(w.ResponseWriter.Header(), "Accept-Encoding")
	w.ResponseWriter.Header().Set("Content-Encoding", "gzip")
	w.ResponseWriter.Header().Del("Content-Length")
	w.ResponseWriter.WriteHeader(code)
	w.gzWriter = gzip.NewWriter(w.ResponseWriter)
}

func appendVary(header http.Header, value string) {
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

// CORS middleware for cross-origin requests
func CORS(next http.Handler) http.Handler {
	allowedOrigins := map[string]bool{
		"https://pjsk.moe":                  true,
		"https://www.pjsk.moe":              true,
		"https://snowyviewer.exmeaning.com": true,
		"http://localhost:3000":             true,
		"http://127.0.0.1:3000":             true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicMapEndpoint(r.URL.Path) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			origin := r.Header.Get("Origin")
			if allowedOrigins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isPublicMapEndpoint(path string) bool {
	return strings.HasPrefix(path, "/api/") && strings.HasSuffix(path, "-map")
}

// Chain applies multiple middlewares in order
func Chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// Serve404 serves a custom 404 page if available
func Serve404(w http.ResponseWriter, root string) {
	notFoundPath := filepath.Join(root, "404.html")
	if content, err := os.ReadFile(notFoundPath); err == nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		w.Write(content)
		return
	}
	http.NotFound(w, nil)
}

// FileServerWithExtensions serves static files with SPA fallback routing.
// For paths without file extensions that don't match existing files/directories,
// it falls back to serving index.html to support client-side routing.
func FileServerWithExtensions(root string) http.Handler {
	fs := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := filepath.Clean(r.URL.Path)
		fullPath := filepath.Join(root, cleanPath)

		info, err := os.Stat(fullPath)
		if err == nil {
			if !info.IsDir() {
				fs.ServeHTTP(w, r)
				return
			}
			indexPath := filepath.Join(fullPath, "index.html")
			if _, err := os.Stat(indexPath); err == nil {
				fs.ServeHTTP(w, r)
				return
			}
		}

		htmlPath := fullPath + ".html"
		if _, err := os.Stat(htmlPath); err == nil {
			r.URL.Path += ".html"
			fs.ServeHTTP(w, r)
			return
		}

		// SPA fallback: for paths without file extensions, serve root index.html
		// This enables client-side routing for dynamic routes (e.g., /cards/123/)
		if filepath.Ext(cleanPath) == "" {
			rootIndex := filepath.Join(root, "index.html")
			if _, err := os.Stat(rootIndex); err == nil {
				http.ServeFile(w, r, rootIndex)
				return
			}
		}

		Serve404(w, root)
	})
}
