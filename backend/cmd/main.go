package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"tripcompass-backend/internal/config"
	"tripcompass-backend/internal/database"
	"tripcompass-backend/internal/server"
	"tripcompass-backend/internal/viewcounter"
	"tripcompass-backend/internal/ws"
)

func main() {
	// Structured JSON logging — set LOG_LEVEL=DEBUG for verbose output.
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))

	cfg := config.Load()

	db, err := database.Connect(cfg)
	if err != nil {
		slog.Error("database connection failed", "err", err)
		os.Exit(1)
	}
	if err := database.Migrate(db); err != nil {
		slog.Error("database migration failed", "err", err)
		os.Exit(1)
	}

	rdb, err := database.ConnectRedis(cfg)
	if err != nil {
		slog.Error("redis connection failed", "addr", cfg.RedisAddr, "err", err)
		os.Exit(1)
	}
	slog.Info("redis connected", "addr", cfg.RedisAddr)

	hub := ws.NewHub()
	redisPubSub := ws.NewRedisPubSub(rdb, hub)
	hub.SetRedisPubSub(redisPubSub)
	go hub.Run()

	// Transactional outbox worker — drains rows that handlers wrote inside
	// the same DB Tx as their mutations and fans the events through the hub.
	// Cancellation on SIGTERM lets in-flight drains complete cleanly.
	outboxCtx, cancelOutbox := context.WithCancel(context.Background())
	outboxWorker := ws.NewWorker(db, ws.NewPublisher(hub), 0, 0)
	go outboxWorker.Start(outboxCtx)

	// H10: Buffered view counter — Redis INCR per request, flush to DB every 30s.
	// Context cancelled on SIGTERM triggers a final flush before process exits.
	flusherCtx, cancelFlusher := context.WithCancel(context.Background())
	vc := viewcounter.New(rdb, db)
	vc.StartFlusher(flusherCtx)

	r := server.NewRouter(db, rdb, hub, cfg, vc)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: r}
	go func() {
		slog.Info("server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down server")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "err", err)
	}

	// Shutdown order matters:
	// 1. Cancel flusher → triggers final view-count flush to DB
	// 2. Cancel outbox worker → in-flight drain finishes, no new picks
	// 3. Stop WS hub + pubsub (Redis client still open for the flush above)
	// 4. Log cleanup complete — all writes are done at this point
	cancelFlusher()
	cancelOutbox()
	hub.Stop()
	redisPubSub.Close()
	slog.Info("cleanup complete")
}
