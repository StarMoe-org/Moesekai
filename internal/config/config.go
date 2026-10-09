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

	// Guess-music daily challenge.
	StarMoeIssuer    string
	StarMoeClientID  string
	GuessMusicSecret string
	// GuessMusicRedisURL is the guess-music store (sessions, plans,
	// leaderboards); defaults to REDIS_URL so the site cache is unaffected
	// when only this one is set.
	GuessMusicRedisURL     string
	DailyTimezone          string
	GuessMusicAudioBaseURL string
	GuessMusicSessionLimit int
	GuessMusicClipLimit    int
	// GuessMusicTrustedProxies lists extra proxy networks (comma-separated
	// CIDRs) in front of the backend; loopback, private ranges and Cloudflare
	// are always recognised.
	GuessMusicTrustedProxies string
	GuessMusicClipCacheDir   string
	// GuessMusicInstSource locates the private instrumentals (vocal removal):
	// an absolute directory or a non-public http(s) base URL. Empty disables
	// vocal removal.
	GuessMusicInstSource string
	HarukiOAuth2BaseURL  string
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

		StarMoeIssuer:            getEnv("STARMOE_ISSUER", "https://passport.star.moe/oidc"),
		StarMoeClientID:          os.Getenv("STARMOE_CLIENT_ID"),
		GuessMusicSecret:         os.Getenv("GUESS_MUSIC_SECRET"),
		DailyTimezone:            getEnv("DAILY_TIMEZONE", "Asia/Shanghai"),
		GuessMusicAudioBaseURL:   getEnv("GUESS_MUSIC_AUDIO_BASE_URL", "https://storage.exmeaning.com/sekai-jp-assets"),
		GuessMusicSessionLimit:   getEnvInt("GUESS_MUSIC_SESSIONS_PER_HOUR", 300),
		GuessMusicClipLimit:      getEnvInt("GUESS_MUSIC_PRACTICE_CLIPS_PER_HOUR", 2000),
		GuessMusicTrustedProxies: os.Getenv("GUESS_MUSIC_TRUSTED_PROXIES"),
		GuessMusicClipCacheDir:   getEnv("GUESS_MUSIC_CLIP_CACHE_DIR", "./data/guess_music_clips"),
		GuessMusicInstSource:     strings.TrimSpace(os.Getenv("GUESS_MUSIC_INST_SOURCE")),
		HarukiOAuth2BaseURL:      getEnv("HARUKI_OAUTH2_BASE_URL", "https://toolbox-api-direct.haruki.seiunx.com/api/oauth2"),
	}
	cfg.GuessMusicRedisURL = getEnv("GUESS_MUSIC_REDIS_URL", cfg.RedisURL)
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
