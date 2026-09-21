package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"snowy_viewer/internal/cache"
	"snowy_viewer/internal/config"
	"snowy_viewer/internal/handlers"
	"snowy_viewer/internal/htmlcache"
	"snowy_viewer/internal/markdown"
	"snowy_viewer/internal/masterdata"
	"snowy_viewer/internal/mcp"
	"snowy_viewer/internal/middleware"
)

const (
	serverReadHeaderTimeout   = 5 * time.Second
	serverReadTimeout         = 15 * time.Second
	serverWriteTimeout        = 30 * time.Second
	serverIdleTimeout         = 60 * time.Second
	serverMaxHeaderBytes      = 1 << 20
	masterDataRetryInterval   = 30 * time.Second
	masterDataRefreshInterval = 6 * time.Hour
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize cache (Redis with memory fallback)
	appCache := cache.New(cfg.RedisURL)
	defer appCache.Close()

	// Initialize and load master data without blocking the process health endpoint.
	store := masterdata.NewStore(cfg.MasterDataPath)
	store.StartRetryUntilReady(masterDataRetryInterval)
	store.StartPeriodicUpdate(masterDataRefreshInterval)

	// Create router and register handlers
	mux := http.NewServeMux()
	handler := handlers.New(store)
	handler.RegisterRoutes(mux)

	// Register Model Context Protocol (MCP) server
	mcpServer := mcp.New(store)
	mcpServer.RegisterRoutes(mux)

	// Prevent unknown /api/* paths from bouncing between Go and Next.js.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})

	// Set up frontend proxy or default to API-only mode.
	if cfg.FrontendProxyURL != "" && cfg.FrontendProxyURL != "none" {
		nextjsURL, err := parseFrontendProxyURL(cfg.FrontendProxyURL)
		if err != nil {
			fmt.Printf("Invalid FRONTEND_PROXY_URL %q: %v\n", cfg.FrontendProxyURL, err)
			registerAPIOnlyHealthRoute(mux)
			registerReadinessRoute(mux, store, nil)
			setupAPIOnlyMode(mux)
		} else {
			nextjsProxy := newFrontendProxy(nextjsURL)
			frontendHealth := newFrontendHealthCheck(cfg.FrontendProxyURL)
			registerFrontendHealthRoute(mux, frontendHealth)
			registerReadinessRoute(mux, store, frontendHealth)

			// Intercept Next.js static files to serve from the persistent archive when available.
			if cfg.StaticArchiveDir != "" {
				registerStaticArchiveRoute(mux, cfg.StaticArchiveDir, nextjsProxy)
			}

			fmt.Printf("Proxying frontend requests to Next.js server on %s\n", cfg.FrontendProxyURL)
			cacheHandler := htmlcache.New(nextjsProxy, htmlcache.Config{
				Dir:           cfg.HTMLCacheDir,
				MaxBytes:      int64(cfg.HTMLCacheMaxGB) << 30,
				MaxEntries:    cfg.HTMLCacheEntries,
				MaxEntryBytes: int64(cfg.HTMLCacheEntryMB) << 20,
				Persistent:    cfg.HTMLCachePersistent,
			})
			mux.HandleFunc("/internal-cache-stats", func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(cacheHandler.Stats())
			})
			// Block internal-only Next.js health endpoint from public access
			mux.HandleFunc("/internal-healthz", func(w http.ResponseWriter, r *http.Request) {
				http.NotFound(w, r)
			})
			mux.HandleFunc("/internal-healthz/", func(w http.ResponseWriter, r *http.Request) {
				http.NotFound(w, r)
			})
			mux.Handle("/", markdown.NewNegotiationMiddleware(cacheHandler))

			if cfg.HTMLCacheWarmup {
				go func() {
					time.Sleep(3 * time.Second)
					locales := []string{"zh-cn", "ja-jp", "en-us"}
					var warmupRoutes []string
					for _, loc := range locales {
						warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/", loc))
						warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/cards/", loc))
						warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/music/", loc))
						warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/events/", loc))
						warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/gacha/", loc))
						warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/costumes/", loc))
						warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/character/", loc))
					}
					// Warm up detail routes (trailing slash is mandatory due to Next.js trailingSlash: true)
					for id := 1; id <= 1450; id++ {
						for _, loc := range locales {
							warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/cards/%d/", loc, id))
						}
					}
					for id := 1; id <= 650; id++ {
						for _, loc := range locales {
							warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/music/%d/", loc, id))
						}
					}
					for id := 1; id <= 250; id++ {
						for _, loc := range locales {
							warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/events/%d/", loc, id))
						}
					}
					for id := 1; id <= 1300; id++ {
						for _, loc := range locales {
							warmupRoutes = append(warmupRoutes, fmt.Sprintf("/%s/gacha/%d/", loc, id))
						}
					}
					cacheHandler.StartWarmup(context.Background(), warmupRoutes, 300*time.Millisecond)
				}()
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
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Printf("Error starting server: %s\n", err)
	}
}

func parseFrontendProxyURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil {
		return nil, fmt.Errorf("must be an absolute HTTP(S) URL without credentials")
	}
	return parsed, nil
}

func newFrontendProxy(nextjsURL *url.URL) *httputil.ReverseProxy {
	nextjsProxy := httputil.NewSingleHostReverseProxy(nextjsURL)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = 100
	transport.MaxIdleConnsPerHost = 32
	transport.IdleConnTimeout = 90 * time.Second
	transport.ResponseHeaderTimeout = 30 * time.Second
	nextjsProxy.Transport = transport
	nextjsProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		fmt.Printf("Next.js proxy error for %s: %v\n", r.URL.Path, err)
		http.Error(w, "frontend upstream unavailable", http.StatusBadGateway)
	}
	return nextjsProxy
}

type frontendHealthCheck func(context.Context) error

func newFrontendHealthCheck(frontendProxyURL string) frontendHealthCheck {
	healthClient := &http.Client{Timeout: 2 * time.Second}
	healthURL := strings.TrimRight(frontendProxyURL, "/") + "/internal-healthz/"
	return func(ctx context.Context) error {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
		if err != nil {
			return err
		}
		resp, err := healthClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNoContent {
			return fmt.Errorf("unexpected frontend health status: %s", resp.Status)
		}
		return nil
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
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "unhealthy", "frontend": "unavailable"})
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
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
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
