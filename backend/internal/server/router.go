package server

// router.go — wires all routes onto a gin.Engine.
// main.go calls NewRouter() after infrastructure (DB, Redis, Hub) is ready.

import (
	"net/http"
	"strings"
	"tripcompass-backend/internal/config"
	"tripcompass-backend/internal/handlers"
	"tripcompass-backend/internal/middleware"
	"tripcompass-backend/internal/viewcounter"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// NewRouter constructs the gin engine with all middleware and routes registered.
// It does not start the HTTP server — that is the responsibility of main.go.
func NewRouter(db *gorm.DB, rdb *redis.Client, hub *ws.Hub, cfg *config.Config, vc *viewcounter.Counter) *gin.Engine {
	r := gin.Default()

	// ── CORS ───────────────────────────────────────────────────────────────────
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

	// ── Handlers ───────────────────────────────────────────────────────────────
	authHandler := handlers.NewAuthHandler(db, cfg)
	userHandler := handlers.NewUserHandler(db)
	itineraryHandler := handlers.NewItineraryHandler(db, vc) // H10: buffered view counter
	activityHandler := handlers.NewActivityHandler(db)
	placeHandler := handlers.NewPlaceHandler(db)
	comboHandler := handlers.NewComboHandler(db)
	lookupHandler := handlers.NewLookupHandler(db)
	seedHandler := handlers.NewSeedHandler(db)
	plannerHandler := handlers.NewPlannerHandler(db, rdb, cfg)
	wsHandler := handlers.NewWSHandler(db, hub, cfg.JWTSecret, cfg.AllowedOrigins)

	// ── Health check — public ─────────────────────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// ── API v1 ────────────────────────────────────────────────────────────────
	api := r.Group("/api/v1")
	{
		// Public routes ──────────────────────────────────────────────────────

		auth := api.Group("/auth")
		auth.POST("/register", middleware.RateLimitRedis(rdb, 5, 60), authHandler.Register)
		auth.POST("/login", middleware.RateLimitRedis(rdb, 10, 60), authHandler.Login)
		auth.POST("/verify", middleware.RateLimitRedis(rdb, 20, 60), authHandler.VerifyEmail)
		auth.POST("/resend-verification", middleware.RateLimitRedis(rdb, 3, 300), authHandler.ResendVerification)
		auth.POST("/google", authHandler.GoogleLogin)
		auth.POST("/facebook", authHandler.FacebookLogin)

		api.GET("/explore", itineraryHandler.Explore)

		api.GET("/places", placeHandler.List)
		api.GET("/places/:id", placeHandler.Get)
		api.GET("/combos", comboHandler.List)
		api.GET("/combos/:id", comboHandler.Get)

		api.GET("/itineraries/:id/public", itineraryHandler.GetPublic)

		api.GET("/knowledge-base/lookup", lookupHandler.Lookup)
		api.POST("/planner/generate", middleware.RateLimitRedis(rdb, 30, 60), plannerHandler.Generate)
		api.GET("/ws/itinerary/:id", wsHandler.HandleWebSocket)

		// Protected routes (JWT required) ────────────────────────────────────
		protected := api.Group("/")
		protected.Use(middleware.JWTAuth(cfg.JWTSecret))
		{
			protected.GET("/auth/me", authHandler.Me)

			protected.GET("/user/profile", userHandler.GetProfile)
			protected.PATCH("/user/profile", userHandler.UpdateProfile)
			protected.POST("/user/change-password", userHandler.ChangePassword)
			protected.GET("/user/saved-places", userHandler.GetSavedPlaces)
			protected.POST("/user/saved-places", userHandler.SavePlace)
			protected.DELETE("/user/saved-places/:place_id", userHandler.UnsavePlace)

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

			protected.POST("/places", placeHandler.Create)
			protected.PATCH("/places/:id", placeHandler.Update)
			protected.DELETE("/places/:id", placeHandler.Delete)

			protected.POST("/combos", comboHandler.Create)
			protected.PATCH("/combos/:id", comboHandler.Update)
			protected.DELETE("/combos/:id", comboHandler.Delete)

			protected.POST("/knowledge-base/seed", seedHandler.BulkSeed)
		}

		// Admin routes (JWT + email allowlist) ───────────────────────────────
		admin := api.Group("/admin")
		admin.Use(middleware.JWTAuth(cfg.JWTSecret), middleware.RequireAdminEmail(cfg.AdminEmails))
		{
			admin.DELETE("/planner/cache", plannerHandler.FlushCache)
		}
	}

	return r
}
