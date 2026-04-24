package config

import (
	"log"
	"os"

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
	Port           string
	AllowedOrigins string
	// LLM planner proxy
	UseLLMPlanner  bool
	PlannerAIURL   string
	// Email / SMTP
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	FrontendURL  string
	// Social OAuth
	GoogleClientID     string
	GoogleClientSecret string
	FacebookAppID      string
	FacebookAppSecret  string
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
		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     os.Getenv("SMTP_PORT"),
		SMTPUser:     os.Getenv("SMTP_USER"),
		SMTPPassword: os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:     os.Getenv("SMTP_FROM"),
		FrontendURL:  os.Getenv("FRONTEND_URL"),
		// Social OAuth
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		FacebookAppID:      os.Getenv("FACEBOOK_APP_ID"),
		FacebookAppSecret:  os.Getenv("FACEBOOK_APP_SECRET"),
	}

	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	if cfg.AllowedOrigins == "" {
		cfg.AllowedOrigins = "http://localhost:3000"
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	return cfg
}
