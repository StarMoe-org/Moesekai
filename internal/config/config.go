package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	RedisURL            string
	Port                string
	MasterDataPath      string
	FrontendProxyURL    string
	HTMLCacheDir        string
	HTMLCacheMaxGB      int
	HTMLCacheEntries    int
	HTMLCacheEntryMB    int
	HTMLCachePersistent bool
	HTMLCacheWarmup     bool
	NextBuildID         string
	StaticArchiveDir    string

	// MoesekaiAPIURL is the private address of moesekai-api (sign-in and
	// guess-music), e.g. http://moesekai-api.zeabur.internal:8080. Empty
	// leaves /api/auth/ and /api/guess-music/ unavailable.
	MoesekaiAPIURL string

	// Live2DSite is the site that publishes the story data, whose episodes the Live2D model
	// catalogue (/api/live2d/<region>/models) is derived from; Live2DDataDir keeps that catalogue.
	Live2DSite    string
	Live2DDataDir string
}

func Load() *Config {
	cfg := &Config{
		RedisURL:            getEnv("REDIS_URL", "localhost:6379"),
		Port:                getEnv("PORT", "8080"),
		MasterDataPath:      getEnv("MASTER_DATA_PATH", "./data/master"),
		FrontendProxyURL:    getEnv("FRONTEND_PROXY_URL", "http://127.0.0.1:3000"),
		HTMLCacheDir:        getEnv("HTML_CACHE_DIR", defaultHTMLCacheDir()),
		HTMLCacheMaxGB:      getEnvInt("HTML_CACHE_MAX_GB", 20),
		HTMLCacheEntries:    getEnvInt("HTML_CACHE_MAX_ENTRIES", 100_000),
		HTMLCacheEntryMB:    getEnvInt("HTML_CACHE_MAX_ENTRY_MB", 4),
		HTMLCachePersistent: getEnvBool("HTML_CACHE_PERSISTENT", true),
		HTMLCacheWarmup:     getEnvBool("HTML_CACHE_WARMUP", true),
		NextBuildID:         getEnv("NEXT_BUILD_ID", ""),
		StaticArchiveDir:    getEnv("STATIC_ARCHIVE_DIR", "./data/static_archive"),
		MoesekaiAPIURL:      strings.TrimSpace(os.Getenv("MOESEKAI_API_URL")),
		Live2DSite:          getEnv("LIVE2D_SITE", "https://storage.pjsk.moe"),
		Live2DDataDir:       getEnv("LIVE2D_DATA_DIR", defaultDataDir("live2d")),
	}
	return cfg
}

func getEnvBool(key string, defaultValue bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func getEnvInt(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return defaultValue
	}
	return parsed
}

func getEnv(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}

// defaultDataDir is `name` under /app/data when the container has it, else under ./data.
func defaultDataDir(name string) string {
	if fi, err := os.Stat("/app/data"); err == nil && fi.IsDir() {
		return "/app/data/" + name
	}
	return "./data/" + name
}

func defaultHTMLCacheDir() string {
	if fi, err := os.Stat("/app/data"); err == nil && fi.IsDir() {
		return "/app/data/html_cache"
	}
	return "./data/html_cache"
}
