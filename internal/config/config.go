package config

import (
	"os"
	"strconv"
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

func defaultHTMLCacheDir() string {
	if fi, err := os.Stat("/app/data"); err == nil && fi.IsDir() {
		return "/app/data/html_cache"
	}
	return "./data/html_cache"
}
