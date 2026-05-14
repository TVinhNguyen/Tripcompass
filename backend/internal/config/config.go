package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost         string
	DBPort         string
	DBUser         string
	DBPassword     string
	DBName         string
	DBSchema       string
	RedisAddr      string
	RedisPassword  string
	JWTSecret      string
	JWTExpireHours int // L5: parsed at startup, default 72h
	Port           string
	AllowedOrigins string
	// LLM planner proxy
	UseLLMPlanner bool
	PlannerAIURL  string
	// Email / Resend
	ResendAPIKey string
	ResendFrom   string
	FrontendURL  string
	// Social OAuth
	GoogleClientID     string
	GoogleClientSecret string
	FacebookAppID      string
	FacebookAppSecret  string
	// Admin access control
	AdminEmails string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: .env not found: %v", err)
	}

	cfg := &Config{
		DBHost:         os.Getenv("DB_HOST"),
		DBPort:         os.Getenv("DB_PORT"),
		DBUser:         os.Getenv("DB_USER"),
		DBPassword:     os.Getenv("DB_PASSWORD"),
		DBName:         os.Getenv("DB_NAME"),
		DBSchema:       os.Getenv("DB_SCHEMA"),
		RedisAddr:      os.Getenv("REDIS_ADDR"),
		RedisPassword:  os.Getenv("REDIS_PASSWORD"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		Port:           os.Getenv("PORT"),
		AllowedOrigins: os.Getenv("ALLOWED_ORIGINS"),
		UseLLMPlanner:  os.Getenv("USE_LLM_PLANNER") == "true",
		PlannerAIURL:   os.Getenv("PLANNER_AI_URL"),
		// Email
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		ResendFrom:   os.Getenv("RESEND_FROM"),
		FrontendURL:  os.Getenv("FRONTEND_URL"),
		// Social OAuth
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		FacebookAppID:      os.Getenv("FACEBOOK_APP_ID"),
		FacebookAppSecret:  os.Getenv("FACEBOOK_APP_SECRET"),
		AdminEmails:        os.Getenv("ADMIN_EMAILS"),
	}

	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	// L5: parse JWT_EXPIRE_HOURS at startup (fail-fast, consistent with other int config)
	cfg.JWTExpireHours = 72 // default 72h
	if e := os.Getenv("JWT_EXPIRE_HOURS"); e != "" {
		if v, err := strconv.Atoi(e); err == nil && v > 0 {
			cfg.JWTExpireHours = v
		} else {
			log.Fatalf("JWT_EXPIRE_HOURS must be a positive integer, got %q", e)
		}
	}
	// Validate required database fields — fail fast with a clear message instead of a cryptic DB error
	for _, check := range []struct{ name, val string }{
		{"DB_HOST", cfg.DBHost},
		{"DB_PORT", cfg.DBPort},
		{"DB_USER", cfg.DBUser},
		{"DB_NAME", cfg.DBName},
	} {
		if check.val == "" {
			log.Fatalf("environment variable %s is required but not set", check.name)
		}
	}
	if cfg.AllowedOrigins == "" {
		cfg.AllowedOrigins = "http://localhost:3000"
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.UseLLMPlanner && cfg.PlannerAIURL == "" {
		log.Fatal("USE_LLM_PLANNER=true requires PLANNER_AI_URL to be set")
	}

	if cfg.GoogleClientID == "" {
		log.Printf("Warning: GOOGLE_CLIENT_ID not set — Google login will return 401")
	} else {
		log.Printf("Google login enabled (client_id length=%d, suffix=...%s)",
			len(cfg.GoogleClientID), tail(cfg.GoogleClientID, 12))
	}

	return cfg
}

func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
