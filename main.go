package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"snowy_viewer/internal/config"
	"snowy_viewer/internal/handlers"
	"snowy_viewer/internal/htmlcache"
	"snowy_viewer/internal/markdown"
	"snowy_viewer/internal/masterdata"
	"snowy_viewer/internal/mcp"
	"snowy_viewer/internal/middleware"
)

const (
	serverReadHeaderTimeout         = 5 * time.Second
	serverReadTimeout               = 15 * time.Second
	serverWriteTimeout              = 45 * time.Second
	serverIdleTimeout               = 60 * time.Second
	serverMaxHeaderBytes            = 1 << 20
	serverShutdownTimeout           = 4 * time.Second
	// Allows community_story posts carrying up to 2 MiB story_doc JSON (~2.5 MiB total);
	// raw audio archives upload directly to object storage via presigned PUT.
	proxyMaxBodyBytes         int64 = 3 << 20
	frontendHealthCacheTTL          = 2 * time.Second
	masterDataRetryInterval         = 30 * time.Second
	masterDataRefreshInterval       = 6 * time.Hour
	warmupReadyWaitMax              = 60 * time.Second
)

// moesekai-api (sign-in, guess-music, the accounts saved with a StarMoe
// account and game data read for them) runs as its own service on the private
// network. Forwarding its paths keeps the browser on one origin, so the
// session cookie stays first-party and no CORS is involved.
var moesekaiAPIPrefixes = []string{"/api/auth/", "/api/guess-music/", "/api/v1/me/", "/api/accounts", "/api/accounts/", "/api/sekai/", "/api/community", "/api/community/"}

// sekai-story-search runs as its own service on the private network.
var storySearchAPIPrefixes = []string{"/api/story-search", "/api/story-search/"}

// frontendAPIPrefixes are Next.js route handlers under /api/ that belong to
// the frontend, not to Go or moesekai-api.
var frontendAPIPrefixes = []string{"/api/sponsors", "/api/sponsors/"}

func registerFrontendAPIRoutes(mux *http.ServeMux, proxy http.Handler) {
	limited := limitProxyRequestBody(proxyMaxBodyBytes, proxy)
	for _, prefix := range frontendAPIPrefixes {
		mux.Handle(prefix, limited)
	}
}

func main() {
	rootCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	// Load configuration
	cfg := config.Load()

	// Initialize and load master data without blocking the process health endpoint.
	store := masterdata.NewStore(cfg.MasterDataPath)
	store.StartRetryUntilReadyContext(rootCtx, masterDataRetryInterval)
	store.StartPeriodicUpdateContext(rootCtx, masterDataRefreshInterval)

	// Create router and register handlers
	mux := http.NewServeMux()
	handler := handlers.New(store)
	handler.RegisterRoutes(mux)

	// Register Model Context Protocol (MCP) server
	mcpServer := mcp.New(store)
	mcpServer.SetBaseContext(rootCtx)
	mcpServer.RegisterRoutes(mux)

	// Sign-in, guess-music, community, and story-search live in private backend services.
	var transports []*http.Transport
	if t := registerMoesekaiAPIRoutes(mux, cfg.MoesekaiAPIURL); t != nil {
		transports = append(transports, t)
	}
	if t := registerStorySearchAPIRoutes(mux, cfg.StorySearchAPIURL); t != nil {
		transports = append(transports, t)
	}

	// Prevent unknown /api/* paths from bouncing between Go and Next.js.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})

	var cacheHandler *htmlcache.Cache

	// Set up frontend proxy or default to API-only mode.
	if cfg.FrontendProxyURL != "" && cfg.FrontendProxyURL != "none" {
		nextjsURL, err := parseProxyTargetURL(cfg.FrontendProxyURL)
		if err != nil {
			fmt.Printf("Invalid FRONTEND_PROXY_URL %q: %v\n", cfg.FrontendProxyURL, err)
			registerAPIOnlyHealthRoute(mux)
			registerReadinessRoute(mux, store, nil)
			setupAPIOnlyMode(mux)
		} else {
			nextjsProxy := newRegisteredFrontendProxy(mux, nextjsURL)
			if t, ok := nextjsProxy.Transport.(*http.Transport); ok {
				transports = append(transports, t)
			}
			frontendHealth := newFrontendHealthCheck(cfg.FrontendProxyURL)
			registerFrontendHealthRoute(mux, frontendHealth)
			registerReadinessRoute(mux, store, frontendHealth)

			// Intercept Next.js static files to serve from the persistent archive when available.
			if cfg.StaticArchiveDir != "" {
				registerStaticArchiveRoute(mux, cfg.StaticArchiveDir, nextjsProxy)
			}

			fmt.Printf("Proxying frontend requests to Next.js server on %s\n", cfg.FrontendProxyURL)
			cacheHandler = htmlcache.New(nextjsProxy, htmlcache.Config{
				Dir:           cfg.HTMLCacheDir,
				MaxBytes:      int64(cfg.HTMLCacheMaxGB) << 30,
				MaxEntries:    cfg.HTMLCacheEntries,
				MaxEntryBytes: int64(cfg.HTMLCacheEntryMB) << 20,
				Persistent:    cfg.HTMLCachePersistent,
				BuildID:       cfg.NextBuildID,
				BaseContext:   rootCtx,
			})
			registerInternalCacheStatsRoute(mux, cacheHandler)
			// Block internal-only Next.js health endpoint from public access
			mux.HandleFunc("/internal-healthz", func(w http.ResponseWriter, r *http.Request) {
				http.NotFound(w, r)
			})
			mux.HandleFunc("/internal-healthz/", func(w http.ResponseWriter, r *http.Request) {
				http.NotFound(w, r)
			})
			mux.Handle("/", markdown.NewNegotiationMiddleware(cacheHandler))

			if cfg.HTMLCacheWarmup {
				go startMetadataWarmup(rootCtx, store, mcpServer, cacheHandler, cfg.HTMLCacheEntries)
			}
		}
	} else {
		registerAPIOnlyHealthRoute(mux)
		registerReadinessRoute(mux, store, nil)
		setupAPIOnlyMode(mux)
	}

	// Apply middlewares and start server
	finalHandler := middleware.Chain(mux, middleware.CORS, middleware.Gzip)

	fmt.Printf("Server starting on :%s...\n", cfg.Port)
	server := newHTTPServer(":"+cfg.Port, finalHandler)

	serverErr := make(chan error, 1)
	go func() {
		err := server.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			return
		}
		serverErr <- nil
	}()

	select {
	case err := <-serverErr:
		if err != nil {
			fmt.Printf("Error starting server: %s\n", err)
		}
	case <-rootCtx.Done():
		fmt.Println("Shutdown signal received; draining active requests...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			fmt.Printf("HTTP server shutdown error: %v\n", err)
		}
		if cacheHandler != nil {
			if err := cacheHandler.Close(shutdownCtx); err != nil {
				fmt.Printf("HTML cache drain warning: %v\n", err)
			}
		}
		for _, t := range transports {
			t.CloseIdleConnections()
		}
		if err := <-serverErr; err != nil {
			fmt.Printf("Server exit error: %v\n", err)
		}
		fmt.Println("Server stopped cleanly.")
	}
}

func startMetadataWarmup(ctx context.Context, store *masterdata.Store, mcpServer *mcp.Server, cacheHandler *htmlcache.Cache, maxEntries int) {
	// Give Next.js and masterdata startup a short window before beginning warmup.
	initTimer := time.NewTimer(3 * time.Second)
	select {
	case <-ctx.Done():
		initTimer.Stop()
		return
	case <-initTimer.C:
	}

	waitDeadline := time.Now().Add(warmupReadyWaitMax)
	for !store.IsReady() && time.Now().Before(waitDeadline) {
		t := time.NewTimer(500 * time.Millisecond)
		select {
		case <-ctx.Done():
			t.Stop()
			return
		case <-t.C:
		}
	}

	if ctx.Err() != nil {
		return
	}
	routes := buildWarmupRoutes(store, mcpServer, maxEntries)
	cacheHandler.StartWarmup(ctx, routes, 300*time.Millisecond)
}

func buildWarmupRoutes(store *masterdata.Store, mcpServer *mcp.Server, maxEntries int) []string {
	locales := []string{"zh-cn", "ja-jp", "en-us"}
	var routes []string
	for _, loc := range locales {
		routes = append(routes,
			fmt.Sprintf("/%s/", loc),
			fmt.Sprintf("/%s/cards/", loc),
			fmt.Sprintf("/%s/music/", loc),
			fmt.Sprintf("/%s/events/", loc),
			fmt.Sprintf("/%s/gacha/", loc),
			fmt.Sprintf("/%s/costumes/", loc),
			fmt.Sprintf("/%s/character/", loc),
		)
	}

	var snapCards, snapMusics, snapEvents, snapGachas []int
	if store != nil {
		if snap := store.GetSnapshot(); snap != nil {
			snapCards = snap.CardIDs
			snapMusics = snap.MusicIDs
			snapEvents = snap.EventIDs
			snapGachas = snap.GachaIDs
		}
	}
	var mcpCards, mcpMusics, mcpEvents, mcpGachas []int
	if mcpServer != nil {
		mcpCards, mcpMusics, mcpEvents, mcpGachas = mcpServer.WarmupIDs()
	}

	cards := mergeDescUniqueIDs(snapCards, mcpCards)
	musics := mergeDescUniqueIDs(snapMusics, mcpMusics)
	events := mergeDescUniqueIDs(snapEvents, mcpEvents)
	gachas := mergeDescUniqueIDs(snapGachas, mcpGachas)

	budget := maxEntries * 3 / 4
	if budget <= len(routes) {
		return routes
	}

	appendKind := func(prefix string, ids []int) {
		for _, id := range ids {
			for _, loc := range locales {
				if len(routes) >= budget {
					return
				}
				routes = append(routes, fmt.Sprintf("/%s/%s/%d/", loc, prefix, id))
			}
		}
	}
	appendKind("events", events)
	appendKind("cards", cards)
	appendKind("music", musics)
	appendKind("gacha", gachas)
	return routes
}

func mergeDescUniqueIDs(a, b []int) []int {
	if len(a) == 0 && len(b) == 0 {
		return nil
	}
	seen := make(map[int]struct{}, len(a)+len(b))
	for _, id := range a {
		if id > 0 {
			seen[id] = struct{}{}
		}
	}
	for _, id := range b {
		if id > 0 {
			seen[id] = struct{}{}
		}
	}
	out := make([]int, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] > out[j] })
	return out
}

func parseProxyTargetURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil {
		return nil, fmt.Errorf("must be an absolute HTTP(S) URL without credentials")
	}
	return parsed, nil
}

func limitProxyRequestBody(maxBytes int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if maxBytes > 0 && r.Body != nil &&
			(r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		}
		next.ServeHTTP(w, r)
	})
}

func isTimeoutError(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

// Set up the production proxy and its API routes together so the /api/ fallback
// cannot accidentally shadow frontend route handlers.
func newRegisteredFrontendProxy(mux *http.ServeMux, target *url.URL) *httputil.ReverseProxy {
	proxy := newFrontendProxy(target)
	registerFrontendAPIRoutes(mux, proxy)
	return proxy
}

func newFrontendProxy(nextjsURL *url.URL) *httputil.ReverseProxy {
	nextjsProxy := httputil.NewSingleHostReverseProxy(nextjsURL)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: 2 * time.Second, KeepAlive: 30 * time.Second}).DialContext
	transport.MaxIdleConns = 64
	transport.MaxIdleConnsPerHost = 24
	transport.MaxConnsPerHost = 24
	transport.IdleConnTimeout = 90 * time.Second
	transport.ResponseHeaderTimeout = 15 * time.Second
	nextjsProxy.Transport = transport
	nextjsProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		if errors.Is(err, context.Canceled) {
			return
		}
		fmt.Printf("Next.js proxy error for %s: %v\n", r.URL.Path, err)
		if isTimeoutError(err) {
			http.Error(w, "frontend upstream timeout", http.StatusGatewayTimeout)
			return
		}
		http.Error(w, "frontend upstream unavailable", http.StatusBadGateway)
	}
	return nextjsProxy
}

func registerMoesekaiAPIRoutes(mux *http.ServeMux, rawURL string) *http.Transport {
	return registerProxyAPIRoutes(mux, "moesekai-api", "MOESEKAI_API_URL", moesekaiAPIPrefixes, rawURL)
}

func registerStorySearchAPIRoutes(mux *http.ServeMux, rawURL string) *http.Transport {
	return registerProxyAPIRoutes(mux, "sekai-story-search", "STORY_SEARCH_API_URL", storySearchAPIPrefixes, rawURL)
}

func registerProxyAPIRoutes(mux *http.ServeMux, serviceName, envName string, prefixes []string, rawURL string) *http.Transport {
	handler := http.Handler(http.HandlerFunc(serveMoesekaiAPIUnavailable))
	var transport *http.Transport
	if rawURL == "" {
		fmt.Printf("%s is not set; %s routes are unavailable.\n", envName, serviceName)
	} else if target, err := parseProxyTargetURL(rawURL); err != nil {
		// Not echoed: a rejected value may carry credentials.
		fmt.Printf("Invalid %s (want an absolute HTTP(S) URL without credentials); %s routes are unavailable.\n", envName, serviceName)
	} else {
		proxy := newMoesekaiAPIProxy(target)
		if t, ok := proxy.Transport.(*http.Transport); ok {
			transport = t
		}
		handler = limitProxyRequestBody(proxyMaxBodyBytes, proxy)
		fmt.Printf("Proxying %s to %s on %s\n", strings.Join(prefixes, ", "), serviceName, target.Host)
	}
	for _, prefix := range prefixes {
		mux.Handle(prefix, handler)
	}
	return transport
}

// newMoesekaiAPIProxy forwards requests unchanged apart from the forwarding
// headers: Cookie, Set-Cookie and Location pass through as they are, and
// bodies stream instead of being buffered.
func newMoesekaiAPIProxy(target *url.URL) *httputil.ReverseProxy {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext
	transport.TLSHandshakeTimeout = 5 * time.Second
	transport.MaxIdleConns = 128
	transport.MaxIdleConnsPerHost = 32
	transport.MaxConnsPerHost = 64
	transport.IdleConnTimeout = 90 * time.Second
	transport.ResponseHeaderTimeout = 20 * time.Second
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			// Append the peer to the incoming chain: moesekai-api walks
			// X-Forwarded-For past private hops, and CF-Connecting-IP passes
			// through untouched.
			r.Out.Header["X-Forwarded-For"] = r.In.Header["X-Forwarded-For"]
			r.SetXForwarded()
			// The platform ingress terminates TLS; keep the public scheme and
			// host it reported.
			if proto := r.In.Header.Get("X-Forwarded-Proto"); proto == "http" || proto == "https" {
				r.Out.Header.Set("X-Forwarded-Proto", proto)
			}
			if host := r.In.Header.Get("X-Forwarded-Host"); host != "" {
				r.Out.Header.Set("X-Forwarded-Host", host)
			}
		},
		Transport:     transport,
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				writeJSONError(w, http.StatusRequestEntityTooLarge, "request_too_large")
				return
			}
			// A visitor leaving mid-request (a skipped clip) is not an outage.
			if errors.Is(err, context.Canceled) {
				return
			}
			fmt.Printf("moesekai-api proxy error for %s %s: %v\n", r.Method, r.URL.Path, err)
			if isTimeoutError(err) {
				writeJSONError(w, http.StatusGatewayTimeout, "upstream_timeout")
				return
			}
			writeJSONError(w, http.StatusBadGateway, "upstream_unavailable")
		},
	}
}

func serveMoesekaiAPIUnavailable(w http.ResponseWriter, _ *http.Request) {
	writeJSONError(w, http.StatusServiceUnavailable, "unavailable")
}

func writeJSONError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

func isLoopbackRequest(r *http.Request) bool {
	if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("CF-Connecting-IP") != "" {
		return false
	}
	host := strings.TrimSpace(r.RemoteAddr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func registerInternalCacheStatsRoute(mux *http.ServeMux, cacheHandler *htmlcache.Cache) {
	mux.HandleFunc("/internal-cache-stats", func(w http.ResponseWriter, r *http.Request) {
		if !isLoopbackRequest(r) {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		_ = json.NewEncoder(w).Encode(cacheHandler.Stats())
	})
}

type frontendHealthCheck func(context.Context) error

type healthFlight struct {
	done chan struct{}
	err  error
}

func newFrontendHealthCheck(frontendProxyURL string) frontendHealthCheck {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: 1 * time.Second, KeepAlive: 30 * time.Second}).DialContext
	transport.ResponseHeaderTimeout = 2 * time.Second
	transport.MaxIdleConns = 4
	transport.MaxIdleConnsPerHost = 4
	transport.MaxConnsPerHost = 4
	transport.IdleConnTimeout = 30 * time.Second
	healthClient := &http.Client{
		Timeout:   2 * time.Second,
		Transport: transport,
	}
	healthURL := strings.TrimRight(frontendProxyURL, "/") + "/internal-healthz/"

	var (
		mu          sync.Mutex
		cachedErr   error
		cachedUntil time.Time
		inFlight    *healthFlight
	)

	probe := func() error {
		probeCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, healthURL, nil)
		if err != nil {
			return err
		}
		resp, err := healthClient.Do(req)
		if err != nil {
			return err
		}
		defer func() {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
			_ = resp.Body.Close()
		}()
		if resp.StatusCode != http.StatusNoContent {
			return fmt.Errorf("unexpected frontend health status: %s", resp.Status)
		}
		return nil
	}

	return func(ctx context.Context) error {
		now := time.Now()
		mu.Lock()
		if now.Before(cachedUntil) {
			err := cachedErr
			mu.Unlock()
			return err
		}
		if f := inFlight; f != nil {
			mu.Unlock()
			select {
			case <-f.done:
				return f.err
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		f := &healthFlight{done: make(chan struct{})}
		inFlight = f
		mu.Unlock()

		go func() {
			err := probe()
			mu.Lock()
			f.err = err
			cachedErr = err
			cachedUntil = time.Now().Add(frontendHealthCacheTTL)
			if inFlight == f {
				inFlight = nil
			}
			close(f.done)
			mu.Unlock()
		}()

		select {
		case <-f.done:
			return f.err
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func registerFrontendHealthRoute(mux *http.ServeMux, checkFrontend frontendHealthCheck) {
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := checkFrontend(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			if r.Method != http.MethodHead {
				_ = json.NewEncoder(w).Encode(map[string]string{"status": "unhealthy", "frontend": "unavailable"})
			}
			return
		}
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "frontend": "ok"})
	})
}

func registerAPIOnlyHealthRoute(mux *http.ServeMux) {
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "mode": "api-only"})
	})
}

func registerReadinessRoute(mux *http.ServeMux, store *masterdata.Store, checkFrontend frontendHealthCheck) {
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if !store.IsReady() || (checkFrontend != nil && checkFrontend(r.Context()) != nil) {
			w.Header().Set("Retry-After", "30")
			w.WriteHeader(http.StatusServiceUnavailable)
			if r.Method != http.MethodHead {
				_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			}
			return
		}
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})
}

func registerStaticArchiveRoute(mux *http.ServeMux, archiveDir string, fallback http.Handler) {
	const staticPrefix = "/_next/static/"
	archiveRoot, err := filepath.Abs(archiveDir)
	if err != nil {
		fmt.Printf("Invalid static archive directory %q: %v\n", archiveDir, err)
		return
	}
	fileServer := http.StripPrefix(staticPrefix, http.FileServer(http.Dir(archiveRoot)))

	mux.HandleFunc(staticPrefix, func(w http.ResponseWriter, r *http.Request) {
		relPath, err := url.PathUnescape(strings.TrimPrefix(r.URL.EscapedPath(), staticPrefix))
		if err != nil || relPath == "" {
			fallback.ServeHTTP(w, r)
			return
		}

		cleanRelPath := filepath.Clean(filepath.FromSlash(relPath))
		if cleanRelPath == "." || filepath.IsAbs(cleanRelPath) || cleanRelPath == ".." || strings.HasPrefix(cleanRelPath, ".."+string(filepath.Separator)) {
			fallback.ServeHTTP(w, r)
			return
		}
		filePath := filepath.Join(archiveRoot, cleanRelPath)
		if rel, relErr := filepath.Rel(archiveRoot, filePath); relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			fallback.ServeHTTP(w, r)
			return
		}

		if info, statErr := os.Stat(filePath); statErr == nil && !info.IsDir() {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			fileServer.ServeHTTP(w, r)
			return
		}
		// Fall back to Next.js when the requested asset is not archived.
		fallback.ServeHTTP(w, r)
	})
	fmt.Printf("Serving persistent static assets from %s for %s\n", archiveRoot, staticPrefix)
}

func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: serverReadHeaderTimeout,
		ReadTimeout:       serverReadTimeout,
		WriteTimeout:      serverWriteTimeout,
		IdleTimeout:       serverIdleTimeout,
		MaxHeaderBytes:    serverMaxHeaderBytes,
	}
}

func setupAPIOnlyMode(mux *http.ServeMux) {
	fmt.Println("Frontend proxy is disabled. API-only mode active.")
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok","message":"PJSK Moe API Server"}`))
			return
		}
		http.NotFound(w, r)
	})
}
