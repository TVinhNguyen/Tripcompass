package database

import (
	"context"
	"fmt"
	"log"
	"tripcompass-backend/internal/config"

	"github.com/redis/go-redis/v9"
)

// ConnectRedis creates a new Redis client with retry options
func ConnectRedis(cfg *config.Config) (*redis.Client, error) {
	opts := &redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       0, // default DB
	}
	
	// Default options if not specified
	if opts.Addr == "" {
		opts.Addr = "localhost:6379"
		log.Printf("[Redis] Using default address: %s", opts.Addr)
	}

	client := redis.NewClient(opts)

	// Test connection with ping
	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("không kết nối được Redis: %w", err)
	}

	log.Printf("[Redis] Connected to %s", opts.Addr)
	return client, nil
}

// ConnectRedisWithPool creates Redis client with connection pool settings
func ConnectRedisWithPool(cfg *config.Config, poolSize int) (*redis.Client, error) {
	opts := &redis.Options{
		Addr:             cfg.RedisAddr,
		Password:         cfg.RedisPassword,
		DB:               0,
		MaxRetries:       3,
		MinIdleConns:     poolSize / 4,
		PoolSize:         poolSize,
		PoolTimeout:      0, // Use default (4s)
		ReadTimeout:      0, // Use default (timeout = dial + write + read)
		WriteTimeout:     0, // Use default (timeout = dial + write + read)
		DialTimeout:      0, // Use default (5s)
	}
	
	if opts.Addr == "" {
		opts.Addr = "localhost:6379"
		log.Printf("[Redis] Using default address: %s", opts.Addr)
	}

	client := redis.NewClient(opts)

	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("không kết nối được Redis với pool settings: %w", err)
	}

	log.Printf("[Redis] Connected with pool size: %d, MinIdleConns: %d", poolSize, opts.MinIdleConns)
	return client, nil
}

// RedisStats returns Redis client statistics
func RedisStats(client *redis.Client, addr string) {
	ctx := context.Background()
	stats := client.Info(ctx, "stats").Val()
	log.Printf("[Redis] Statistics for %s: %s", addr, stats)
}
