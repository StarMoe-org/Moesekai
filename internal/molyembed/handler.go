// Package molyembed serves immutable browser releases and independent game
// snapshots from an operator-managed, read-only volume, never from the image.
package molyembed

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const Prefix = "/moly/"
const ContractVersion = 2

var identifier = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,95}$`)
var gameVersion = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
var contentHash = regexp.MustCompile(`^[a-f0-9]{64}$`)
var storeDocument = regexp.MustCompile(`^asset-store/(catalogs|packages)/[a-f0-9]{64}\.json$`)
var storeBlob = regexp.MustCompile(`^asset-store/blobs/([a-f0-9]{2})/([a-f0-9]{64})\.(bin|gzz)$`)

type Handler struct {
	root        string
	rootErr     error
	storeRoot   string
	storeErr    error
	development bool
	mu          sync.Mutex
	stamp       string
	manifest    []byte
	manifestErr error
}

// An absent mount affects discovery only, not ordinary Moesekai pages.
func New(root string) *Handler {
	h := &Handler{development: os.Getenv("MOLY_DEVELOPMENT") == "1"}
	if strings.TrimSpace(root) == "" {
		h.rootErr = errors.New("not_configured")
		return h
	}
	h.root, h.rootErr = filepath.Abs(root)
	if h.rootErr == nil {
		h.root, h.rootErr = filepath.EvalSymlinks(h.root)
	}
	if store := strings.TrimSpace(os.Getenv("MOLY_ASSET_STORE_ROOT")); store != "" {
		h.storeRoot, h.storeErr = filepath.Abs(store)
		if h.storeErr == nil {
			h.storeRoot, h.storeErr = filepath.EvalSymlinks(h.storeRoot)
		}
	}
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("Referrer-Policy", "same-origin")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		problem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if r.URL.Path == Prefix+"manifest.json" {
		h.serveManifest(w, r)
		return
	}
	if h.rootErr != nil {
		problem(w, r, http.StatusNotFound, "runtime_unavailable")
		return
	}
	rel, ok := safeRelative(r.URL)
	if !ok {
		problem(w, r, http.StatusNotFound, "not_found")
		return
	}
	segments := strings.Split(rel, "/")
	mutable := rel == "cache-worker.mjs"
	cas := immutableStorePath(rel)
	if !mutable && !cas && (len(segments) < 3 || (segments[0] != "releases" && segments[0] != "snapshots") || !identifier.MatchString(segments[1])) {
		problem(w, r, http.StatusNotFound, "not_found")
		return
	}
	contentType, ok := mimeType(filepath.Ext(rel))
	if !ok {
		problem(w, r, http.StatusNotFound, "not_found")
		return
	}
	original, err := h.open(rel)
	if err != nil {
		problem(w, r, http.StatusNotFound, "asset_missing")
		return
	}
	defer original.Close()
	info, err := original.Stat()
	if err != nil || !info.Mode().IsRegular() {
		problem(w, r, http.StatusNotFound, "asset_missing")
		return
	}
	file := original
	encoding := ""
	selected := false
	representationInfo := info
	for _, candidate := range preferredEncodings(r.Header.Get("Accept-Encoding")) {
		if candidate == "identity" {
			selected = true
			break
		}
		// CAS blobs contain their declared representation; gzip is decoded by
		// the pack reader after checksum validation, never by HTTP negotiation.
		if cas {
			continue
		}
		extension := ".gz"
		if candidate == "br" {
			extension = ".br"
		}
		encodedFile, openErr := h.open(rel + extension)
		if openErr != nil {
			continue
		}
		encodedInfo, statErr := encodedFile.Stat()
		if statErr != nil || !encodedInfo.Mode().IsRegular() {
			encodedFile.Close()
			continue
		}
		file, representationInfo, encoding, selected = encodedFile, encodedInfo, candidate, true
		defer encodedFile.Close()
		w.Header().Set("Content-Length", strconv.FormatInt(encodedInfo.Size(), 10))
		break
	}
	if !selected {
		problem(w, r, http.StatusNotAcceptable, "encoding_unavailable")
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Vary", "Accept-Encoding")
	w.Header().Set("X-Moly-Decoded-Bytes", strconv.FormatInt(info.Size(), 10))
	if mutable {
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Service-Worker-Allowed", Prefix)
	} else if h.development && len(segments) >= 4 && segments[0] == "snapshots" && segments[2] == "assets" {
		w.Header().Set("Cache-Control", "no-cache")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	if filepath.Ext(rel) == ".html" {
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; object-src 'none'")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	}
	if encoding != "" {
		w.Header().Set("Content-Encoding", encoding)
	}
	variant := "identity"
	if encoding != "" {
		variant = encoding
	}
	w.Header().Set("ETag", fmt.Sprintf(`"%s-%x-%x-%s"`, segments[0], representationInfo.Size(), representationInfo.ModTime().UnixNano(), variant))
	// Keep the normal 30 s server limit, renewed only by progressing writes.
	// This permits large transfers, but does not let stalled clients linger.
	out := &progressWriter{ResponseWriter: w}
	out.renew()
	http.ServeContent(out, r, filepath.Base(rel), info.ModTime(), file)
}

func immutableStorePath(rel string) bool {
	if storeDocument.MatchString(rel) {
		return true
	}
	match := storeBlob.FindStringSubmatch(rel)
	return len(match) == 4 && strings.HasPrefix(match[2], match[1])
}

type progressWriter struct{ http.ResponseWriter }

func (w *progressWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *progressWriter) renew() {
	_ = http.NewResponseController(w.ResponseWriter).SetWriteDeadline(time.Now().Add(30 * time.Second))
}
func (w *progressWriter) Write(p []byte) (int, error) { w.renew(); return w.ResponseWriter.Write(p) }

func safeRelative(u *url.URL) (string, bool) {
	raw := strings.ToLower(u.EscapedPath())
	if !strings.HasPrefix(u.Path, Prefix) || strings.Contains(raw, "%2f") || strings.Contains(raw, "%5c") || strings.Contains(raw, "%00") {
		return "", false
	}
	rel := strings.TrimPrefix(u.Path, Prefix)
	if rel == "" || strings.ContainsAny(rel, "\\\x00:") {
		return "", false
	}
	for _, part := range strings.Split(rel, "/") {
		if part == "" || part == "." || part == ".." || strings.HasPrefix(part, ".") {
			return "", false
		}
	}
	return rel, true
}
func (h *Handler) open(rel string) (*os.File, error) {
	root := h.root
	if strings.HasPrefix(rel, "asset-store/") && h.storeRoot != "" {
		if !immutableStorePath(rel) || h.storeErr != nil {
			return nil, errors.New("invalid configured asset store")
		}
		root, rel = h.storeRoot, strings.TrimPrefix(rel, "asset-store/")
	}
	path := filepath.Join(root, filepath.FromSlash(rel))
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, err
	}
	within, err := filepath.Rel(root, resolved)
	if err != nil || within == ".." || strings.HasPrefix(within, ".."+string(filepath.Separator)) || filepath.IsAbs(within) {
		return nil, errors.New("outside runtime mount")
	}
	f, err := os.Open(resolved)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		f.Close()
		return nil, errors.New("not a regular asset")
	}
	return f, nil
}
func (h *Handler) readJSON(rel string, max int64, value any) error {
	f, err := h.open(rel)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.Size() > max {
		return errors.New("descriptor too large")
	}
	decoder := json.NewDecoder(io.LimitReader(f, max+1))
	if err := decoder.Decode(value); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errors.New("trailing descriptor data")
	}
	return nil
}
func problem(w http.ResponseWriter, r *http.Request, status int, code string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_ = json.NewEncoder(w).Encode(map[string]any{"schemaVersion": ContractVersion, "code": code})
	}
}
func acceptsGzip(header string) bool {
	for _, entry := range strings.Split(header, ",") {
		parts := strings.Split(strings.TrimSpace(entry), ";")
		if !strings.EqualFold(strings.TrimSpace(parts[0]), "gzip") {
			continue
		}
		quality := 1.0
		for _, parameter := range parts[1:] {
			p := strings.SplitN(strings.TrimSpace(parameter), "=", 2)
			if len(p) == 2 && strings.EqualFold(p[0], "q") {
				if n, err := strconv.ParseFloat(p[1], 64); err == nil {
					quality = n
				} else {
					quality = 0
				}
			}
		}
		return quality > 0 && quality <= 1
	}
	return false
}
func mimeType(ext string) (string, bool) {
	if ext == ".gzz" {
		return "application/octet-stream", true
	}
	types := map[string]string{".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".rgba8": "application/octet-stream", ".acb": "application/octet-stream", ".wgsl": "text/plain; charset=utf-8", ".glsl": "text/plain; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ktx2": "image/ktx2", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".ttf": "font/ttf"}
	value, ok := types[strings.ToLower(ext)]
	return value, ok
}
