package main

import (
	"log"
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

	rdb, err := database.ConnectRedis(cfg)
	if err != nil {
		log.Fatal("Không kết nối được Redis:", err)
	}
	log.Println("Kết nối Redis thành công:", cfg.RedisAddr)
	_ = rdb // sẽ dùng khi scale multi-instance

	// WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()

	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")
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
	wsHandler := handlers.NewWSHandler(db, hub, cfg.JWTSecret)

	// Routes
	api := r.Group("/api/v1")
	{
		// Auth — không cần JWT
		auth := api.Group("/auth")
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)

		// Explore — public
		api.GET("/explore", itineraryHandler.Explore)

		// WebSocket — xác thực qua query param ?token=xxx
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
		}
	}

	log.Printf("Server chạy tại port %s", cfg.Port)
	r.Run(":" + cfg.Port)
}
