package main

import (
	"log"
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

	// Handlers
	authHandler := handlers.NewAuthHandler(db, cfg)
	itineraryHandler := handlers.NewItineraryHandler(db)
	activityHandler := handlers.NewActivityHandler(db)
	placeHandler := handlers.NewPlaceHandler(db)
	comboHandler := handlers.NewComboHandler(db)
	lookupHandler := handlers.NewLookupHandler(db)
	seedHandler := handlers.NewSeedHandler(db)
	wsHandler := handlers.NewWSHandler(db, hub, cfg.JWTSecret)

	// Routes
	api := r.Group("/api/v1")
	{
		// Auth — public
		auth := api.Group("/auth")
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)

		// Explore — public
		api.GET("/explore", itineraryHandler.Explore)

		// Knowledge Base — public (used by ai-service)
		api.GET("/knowledge-base/lookup", lookupHandler.Lookup)
		api.POST("/knowledge-base/seed", seedHandler.BulkSeed)

		// WebSocket — auth via query param ?token=xxx
		api.GET("/ws/itinerary/:id", wsHandler.HandleWebSocket)

		// Protected routes
		protected := api.Group("/")
		protected.Use(middleware.JWTAuth(cfg.JWTSecret))
		{
			protected.GET("/itineraries", itineraryHandler.GetMyItineraries)
			protected.POST("/itineraries", itineraryHandler.Create)
			protected.GET("/itineraries/:id", itineraryHandler.GetOne)
			protected.PATCH("/itineraries/:id", itineraryHandler.Update)
			protected.DELETE("/itineraries/:id", itineraryHandler.Delete)
			protected.POST("/itineraries/:id/clone", itineraryHandler.Clone)
			protected.PATCH("/itineraries/:id/publish", itineraryHandler.Publish)

			protected.POST("/activities", activityHandler.Create)
			protected.PATCH("/activities/:id", activityHandler.Update)
			protected.DELETE("/activities/:id", activityHandler.Delete)
			protected.PATCH("/activities/reorder", activityHandler.Reorder)

			// Places CRUD
			places := protected.Group("/places")
			{
				places.GET("", placeHandler.List)
				places.GET("/:id", placeHandler.Get)
				places.POST("", placeHandler.Create)
				places.PATCH("/:id", placeHandler.Update)
				places.DELETE("/:id", placeHandler.Delete)
			}

			// Combos CRUD
			combos := protected.Group("/combos")
			{
				combos.GET("", comboHandler.List)
				combos.GET("/:id", comboHandler.Get)
				combos.POST("", comboHandler.Create)
				combos.PATCH("/:id", comboHandler.Update)
				combos.DELETE("/:id", comboHandler.Delete)
			}
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
