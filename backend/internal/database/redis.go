package database

import (
	"context"
	"fmt"
	"log/slog"
	"tripcompass-backend/internal/config"

	"github.com/redis/go-redis/v9"
)

// ConnectRedis creates a new Redis client and verifies connectivity.
func ConnectRedis(cfg *config.Config) (*redis.Client, error) {
	opts := &redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       0,
	}
	if opts.Addr == "" {
		opts.Addr = "localhost:6379"
		slog.Info("redis addr not set, using default", "addr", opts.Addr)
	}

	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("redis connection failed: %w", err)
	}
	slog.Info("redis connected", "addr", opts.Addr)
	return client, nil
}
