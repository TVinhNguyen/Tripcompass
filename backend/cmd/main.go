package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"tripcompass-backend/internal/config"
	"tripcompass-backend/internal/database"
	"tripcompass-backend/internal/handlers"
	"tripcompass-backend/internal/middleware"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatal("Không kết nối được DB:", err)
	}

	if err := database.Migrate(db); err != nil {
		log.Fatal("Database migration failed:", err)
	}

	rdb, err := database.ConnectRedis(cfg)
	if err != nil {
		log.Fatal("Không kết nối được Redis:", err)
	}
	log.Printf("Kết nối Redis thành công: %s", cfg.RedisAddr)

	// WebSocket Hub
	hub := ws.NewHub()
	redisPubSub := ws.NewRedisPubSub(rdb, hub)
	hub.SetRedisPubSub(redisPubSub)
	go hub.Run()

	r := gin.Default()

	// CORS — restrict to allowed origins
	allowedOrigins := strings.Split(cfg.AllowedOrigins, ",")
	r.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			for _, allowed := range allowedOrigins {
				if strings.TrimSpace(allowed) == origin {
					c.Header("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}
		c.Header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")
		c.Header("Access-Control-Allow-Credentials", "true")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Request body size limit — 10 MB
	r.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 10<<20)
		c.Next()
	})

	// Handlers
	authHandler := handlers.NewAuthHandler(db, cfg)
	userHandler := handlers.NewUserHandler(db)
	itineraryHandler := handlers.NewItineraryHandler(db)
	activityHandler := handlers.NewActivityHandler(db)
	placeHandler := handlers.NewPlaceHandler(db)
	comboHandler := handlers.NewComboHandler(db)
	lookupHandler := handlers.NewLookupHandler(db)
	seedHandler := handlers.NewSeedHandler(db)
	plannerHandler := handlers.NewPlannerHandler(db, rdb, cfg)
	wsHandler := handlers.NewWSHandler(db, hub, cfg.JWTSecret)

	// Health check — public (for monitoring/ALB)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Routes
	api := r.Group("/api/v1")
	{
		// ── Public routes ────────────────────────────────────────────

		// Auth — public
		auth := api.Group("/auth")
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/verify", authHandler.VerifyEmail)
		auth.POST("/resend-verification", authHandler.ResendVerification)
		auth.POST("/google", authHandler.GoogleLogin)
		auth.POST("/facebook", authHandler.FacebookLogin)

		// Explore published itineraries
		api.GET("/explore", itineraryHandler.Explore)

		// Public read: Places & Combos (browse without login)
		api.GET("/places", placeHandler.List)
		api.GET("/places/:id", placeHandler.Get)
		api.GET("/combos", comboHandler.List)
		api.GET("/combos/:id", comboHandler.Get)

		// Public view: published itinerary detail
		api.GET("/itineraries/:id/public", itineraryHandler.GetPublic)

		// Knowledge Base lookup — public (used by ai-service)
		api.GET("/knowledge-base/lookup", lookupHandler.Lookup)

		// Planner — public with rate limiting
		api.POST("/planner/generate", middleware.RateLimit(30, 60), plannerHandler.Generate)

		// WebSocket — auth via query param ?token=xxx
		api.GET("/ws/itinerary/:id", wsHandler.HandleWebSocket)

		// ── Protected routes (JWT required) ─────────────────────────
		protected := api.Group("/")
		protected.Use(middleware.JWTAuth(cfg.JWTSecret))
		{
			// Auth — get current user
			protected.GET("/auth/me", authHandler.Me)

			// User profile & settings
			protected.GET("/user/profile", userHandler.GetProfile)
			protected.PATCH("/user/profile", userHandler.UpdateProfile)
			protected.POST("/user/change-password", userHandler.ChangePassword)

			// Saved Places
			protected.GET("/user/saved-places", userHandler.GetSavedPlaces)
			protected.POST("/user/saved-places", userHandler.SavePlace)
			protected.DELETE("/user/saved-places/:place_id", userHandler.UnsavePlace)

			// Itineraries
			protected.GET("/itineraries", itineraryHandler.GetMyItineraries)
			protected.POST("/itineraries", itineraryHandler.Create)
			protected.GET("/itineraries/:id", itineraryHandler.GetOne)
			protected.PATCH("/itineraries/:id", itineraryHandler.Update)
			protected.DELETE("/itineraries/:id", itineraryHandler.Delete)
			protected.POST("/itineraries/:id/clone", itineraryHandler.Clone)
			protected.PATCH("/itineraries/:id/publish", itineraryHandler.Publish)

			// Activities
			protected.POST("/activities", activityHandler.Create)
			protected.PATCH("/activities/:id", activityHandler.Update)
			protected.DELETE("/activities/:id", activityHandler.Delete)
			protected.PATCH("/activities/reorder", activityHandler.Reorder)

			// Places — write operations
			protected.POST("/places", placeHandler.Create)
			protected.PATCH("/places/:id", placeHandler.Update)
			protected.DELETE("/places/:id", placeHandler.Delete)

			// Combos — write operations
			protected.POST("/combos", comboHandler.Create)
			protected.PATCH("/combos/:id", comboHandler.Update)
			protected.DELETE("/combos/:id", comboHandler.Delete)

			// Knowledge Base seed — protected (bulk data import)
			protected.POST("/knowledge-base/seed", seedHandler.BulkSeed)
		}

		// ── Admin routes (JWT + future role check) ──────────────────
		admin := api.Group("/admin")
		admin.Use(middleware.JWTAuth(cfg.JWTSecret))
		{
			admin.DELETE("/planner/cache", plannerHandler.FlushCache)
		}
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Server chạy tại port %s", cfg.Port)
		if err := r.Run(":" + cfg.Port); err != nil {
			log.Fatal("Lỗi khi chạy server:", err)
		}
	}()

	<-quit
	log.Println("Shutting down server...")
	redisPubSub.Close()
	log.Println("Cleanup complete.")
}
