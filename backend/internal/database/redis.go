package database

import (
	"context"
	"fmt"
	"log"
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
		log.Printf("[Redis] Using default address: %s", opts.Addr)
	}

	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("không kết nối được Redis: %w", err)
	}
	log.Printf("[Redis] Connected to %s", opts.Addr)
	return client, nil
}
