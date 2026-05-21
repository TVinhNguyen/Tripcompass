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
	wsPublisher := ws.NewPublisher(hub)
	authHandler := handlers.NewAuthHandler(db, cfg, wsPublisher)
	userHandler := handlers.NewUserHandler(db)
	itineraryHandler := handlers.NewItineraryHandler(db, vc, wsPublisher) // H10: buffered view counter
	activityHandler := handlers.NewActivityHandler(db, wsPublisher)
	placeHandler := handlers.NewPlaceHandler(db)
	comboHandler := handlers.NewComboHandler(db)
	lookupHandler := handlers.NewLookupHandler(db)
	seedHandler := handlers.NewSeedHandler(db)
	plannerHandler := handlers.NewPlannerHandler(db, rdb, cfg)
	aiChatHandler := handlers.NewAIChatHandler(db, cfg.PlannerAIURL)
	wsHandler := handlers.NewWSHandler(db, hub, cfg.JWTSecret, cfg.AllowedOrigins)
	collabHandler := handlers.NewCollaboratorHandler(db, cfg, wsPublisher)
	adminStatsHandler := handlers.NewAdminStatsHandler(db)
	adminActivityHandler := handlers.NewAdminActivityHandler(db)
	adminUserHandler := handlers.NewAdminUserHandler(db)

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
		auth.POST("/google", middleware.RateLimitRedis(rdb, 10, 60), authHandler.GoogleLogin)
		auth.POST("/facebook", middleware.RateLimitRedis(rdb, 10, 60), authHandler.FacebookLogin)
		auth.POST("/logout", authHandler.Logout)

		api.GET("/explore", itineraryHandler.Explore)

		api.GET("/places", placeHandler.List)
		api.GET("/places/destinations", placeHandler.Destinations)
		api.GET("/places/:id", placeHandler.Get)
		api.GET("/combos", comboHandler.List)
		api.GET("/combos/:id", comboHandler.Get)

		api.GET("/itineraries/:id/public", itineraryHandler.GetPublic)

		api.GET("/knowledge-base/lookup", lookupHandler.Lookup)
		api.POST("/planner/generate", middleware.RateLimitRedis(rdb, 30, 60), plannerHandler.Generate)
		api.GET("/ws/itinerary/:id", wsHandler.HandleWebSocket)
		// Per-user notification channel. Same JWT-via-subprotocol auth path
		// as the itinerary socket, but no itinerary param — the "room" is
		// "user:<id>" so server-side publishers can target a single user.
		api.GET("/ws/user", wsHandler.HandleUserWebSocket)

		// Protected routes (JWT required) ────────────────────────────────────
		protected := api.Group("/")
		protected.Use(middleware.JWTAuth(db, cfg.JWTSecret))
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

			protected.POST("/itineraries/:id/collaborators", collabHandler.Invite)
			protected.GET("/itineraries/:id/collaborators", collabHandler.List)
			protected.GET("/collaborators/pending", collabHandler.ListPending)
			protected.POST("/collaborators/:id/accept", collabHandler.Accept)
			protected.POST("/collaborators/:id/decline", collabHandler.Decline)
			protected.DELETE("/collaborators/:id", collabHandler.Remove)

			protected.POST("/activities", activityHandler.Create)
			protected.PATCH("/activities/:id", activityHandler.Update)
			protected.DELETE("/activities/:id", activityHandler.Delete)
			protected.PATCH("/activities/reorder", activityHandler.Reorder)

			protected.GET("/ai-chat/sessions", aiChatHandler.ListSessions)
			protected.GET("/ai-chat/sessions/:id/history", aiChatHandler.GetHistory)
			protected.DELETE("/ai-chat/sessions/:id", aiChatHandler.DeleteSession)
			protected.POST("/ai-chat/stream", middleware.RateLimitRedis(rdb, 30, 60), aiChatHandler.Stream)

			// Master-catalog writes: any logged-in user must NOT be able to
			// mutate places/combos/knowledge-base. Gated by admin-email
			// allowlist on top of JWT. Paths kept under their original prefix
			// so the existing admin frontend doesn't need to switch base URL.
			adminGate := middleware.RequireAdmin(db, cfg.AdminEmails)
			protected.POST("/places", adminGate, placeHandler.Create)
			protected.PATCH("/places/:id", adminGate, placeHandler.Update)
			protected.DELETE("/places/:id", adminGate, placeHandler.Delete)

			protected.POST("/combos", adminGate, comboHandler.Create)
			protected.PATCH("/combos/:id", adminGate, comboHandler.Update)
			protected.DELETE("/combos/:id", adminGate, comboHandler.Delete)

			protected.POST("/knowledge-base/seed", adminGate, seedHandler.BulkSeed)
		}

		// Admin routes (JWT + email allowlist) ───────────────────────────────
		admin := api.Group("/admin")
		admin.Use(middleware.JWTAuth(db, cfg.JWTSecret), middleware.RequireAdmin(db, cfg.AdminEmails))
		{
			admin.DELETE("/planner/cache", plannerHandler.FlushCache)

			admin.GET("/stats", adminStatsHandler.Stats)
			admin.GET("/activity", adminActivityHandler.Recent)
			admin.GET("/users", adminUserHandler.List)
			admin.PATCH("/users/:id/role", adminUserHandler.UpdateRole)
			admin.PATCH("/users/:id/status", adminUserHandler.UpdateStatus)
		}
	}

	return r
}
