package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"tripcompass-backend/internal/models"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AIChatHandler struct {
	db           *gorm.DB
	plannerAIURL string
	httpClient   *http.Client
}

func NewAIChatHandler(db *gorm.DB, plannerAIURL string) *AIChatHandler {
	return &AIChatHandler{
		db:           db,
		plannerAIURL: strings.TrimRight(plannerAIURL, "/"),
		// No hard Timeout — streaming requests run for minutes; we rely on
		// the request context (cancels when the browser disconnects) and the
		// transport's per-read deadline to bound idle stalls.
		httpClient: &http.Client{
			Transport: &http.Transport{
				ResponseHeaderTimeout: 30 * time.Second,
				IdleConnTimeout:       90 * time.Second,
			},
		},
	}
}

type aiChatSessionResponse struct {
	SessionID    string  `json:"session_id"`
	CreatedAt    string  `json:"created_at,omitempty"`
	LastActive   string  `json:"last_active,omitempty"`
	MessageCount int     `json:"message_count"`
	Destination  *string `json:"destination,omitempty"`
	Title        string  `json:"title,omitempty"`
}

type aiChatMessageResponse struct {
	Role      string          `json:"role"`
	Content   string          `json:"content"`
	ToolCalls []string        `json:"tool_calls,omitempty"`
	Plan      json.RawMessage `json:"plan,omitempty"`
	CreatedAt string          `json:"created_at"`
}

type aiChatStreamRequest struct {
	SessionID   *string `json:"session_id"`
	ItineraryID *string `json:"itinerary_id"`
	Message     string  `json:"message" binding:"required"`
}

type aiChatProxyRequest struct {
	SessionID        string              `json:"session_id"`
	Message          string              `json:"message"`
	ItineraryContext *aiItineraryContext `json:"itinerary_context,omitempty"`
}

type aiItineraryContext struct {
	ID          string                       `json:"id"`
	Title       string                       `json:"title"`
	Destination string                       `json:"destination"`
	StartDate   string                       `json:"start_date"`
	EndDate     string                       `json:"end_date"`
	Budget      float64                      `json:"budget"`
	GuestCount  int                          `json:"guest_count"`
	Tags        []string                     `json:"tags,omitempty"`
	Activities  []aiItineraryContextActivity `json:"activities"`
}

type aiItineraryContextActivity struct {
	ID            string   `json:"id"`
	DayNumber     int      `json:"day_number"`
	OrderIndex    int      `json:"order_index"`
	Title         string   `json:"title"`
	Category      string   `json:"category"`
	StartTime     *string  `json:"start_time,omitempty"`
	EndTime       *string  `json:"end_time,omitempty"`
	EstimatedCost float64  `json:"estimated_cost"`
	Notes         *string  `json:"notes,omitempty"`
	PlaceID       *string  `json:"place_id,omitempty"`
	PlaceName     string   `json:"place_name,omitempty"`
	Location      string   `json:"location,omitempty"`
	Area          string   `json:"area,omitempty"`
	Lat           *float64 `json:"lat,omitempty"`
	Lng           *float64 `json:"lng,omitempty"`
}

func (h *AIChatHandler) ListSessions(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	userID, err := uuid.Parse(uid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
		return
	}

	var sessions []models.AIChatSession
	if err := h.db.
		Where("user_id = ?", userID).
		Order("updated_at DESC").
		Find(&sessions).Error; err != nil {
		respondInternalError(c, err)
		return
	}

	out := make([]aiChatSessionResponse, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, sessionResponse(s))
	}
	c.JSON(http.StatusOK, out)
}

func (h *AIChatHandler) GetHistory(c *gin.Context) {
	session, ok := h.mustOwnedSession(c, c.Param("id"))
	if !ok {
		return
	}

	var messages []models.AIChatMessage
	if err := h.db.
		Where("session_id = ?", session.ID).
		Order("created_at ASC").
		Find(&messages).Error; err != nil {
		respondInternalError(c, err)
		return
	}

	out := make([]aiChatMessageResponse, 0, len(messages))
	for _, m := range messages {
		out = append(out, messageResponse(m))
	}
	c.JSON(http.StatusOK, gin.H{
		"session_id":    session.ID.String(),
		"messages":      out,
		"message_count": len(out),
		"meta":          sessionResponse(session),
	})
}

func (h *AIChatHandler) DeleteSession(c *gin.Context) {
	session, ok := h.mustOwnedSession(c, c.Param("id"))
	if !ok {
		return
	}
	if err := h.db.Delete(&session).Error; err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true, "session_id": session.ID.String()})
}

func (h *AIChatHandler) Stream(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	userID, err := uuid.Parse(uid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
		return
	}
	if h.plannerAIURL == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "planner-ai is not configured"})
		return
	}

	var req aiChatStreamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}

	sessionID := uuid.New()
	if req.SessionID != nil && strings.TrimSpace(*req.SessionID) != "" {
		parsed, err := uuid.Parse(strings.TrimSpace(*req.SessionID))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session_id"})
			return
		}
		if _, ok := h.ownedSession(c.Request.Context(), parsed, userID); !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}
		sessionID = parsed
	}

	var itineraryContext *aiItineraryContext
	if req.ItineraryID != nil && strings.TrimSpace(*req.ItineraryID) != "" {
		var ok bool
		itineraryContext, ok = h.loadItineraryContext(c, userID, strings.TrimSpace(*req.ItineraryID))
		if !ok {
			return
		}
	}

	proxyBody, err := json.Marshal(aiChatProxyRequest{
		SessionID:        sessionID.String(),
		Message:          req.Message,
		ItineraryContext: itineraryContext,
	})
	if err != nil {
		respondInternalError(c, err)
		return
	}

	httpReq, err := http.NewRequestWithContext(
		c.Request.Context(),
		http.MethodPost,
		h.plannerAIURL+"/chat/stream",
		bytes.NewReader(proxyBody),
	)
	if err != nil {
		respondInternalError(c, err)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	// Propagate request_id so planner-ai logs line up with backend logs.
	if rid := c.GetHeader("X-Request-Id"); rid != "" {
		httpReq.Header.Set("X-Request-Id", rid)
	} else {
		httpReq.Header.Set("X-Request-Id", uuid.NewString())
	}

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		respondInternalError(c, fmt.Errorf("proxy to planner-ai chat: %w", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		c.JSON(resp.StatusCode, gin.H{"error": string(body)})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	done := streamDonePayload{}
	if err := h.proxySSE(c, resp.Body, &done); err != nil && !errors.Is(err, context.Canceled) {
		return
	}

	if done.Type == "done" {
		if err := h.persistExchange(c.Request.Context(), userID, sessionID, req.Message, done); err != nil {
			// Streaming has already completed; log through gin error channel instead of corrupting SSE.
			_ = c.Error(err)
		}
	}
}

func (h *AIChatHandler) loadItineraryContext(c *gin.Context, userID uuid.UUID, rawID string) (*aiItineraryContext, bool) {
	itineraryID, err := uuid.Parse(rawID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid itinerary_id"})
		return nil, false
	}

	// The AI may propose edits via edit_itinerary; the FE applies them through
	// the activity write endpoints. Gate the context on the SAME permission
	// those endpoints use (owner OR accepted EDITOR collaborator) so the
	// assistant can edit exactly when the user can — not owner-only. Viewers
	// (and non-collaborators) get ErrForbidden → no context. CheckEditAccess
	// also returns ErrNotFound for a missing itinerary; handleServiceError maps
	// both to the right status without leaking existence to outsiders.
	if err := services.CheckEditAccess(h.db.WithContext(c.Request.Context()), rawID, userID.String()); err != nil {
		handleServiceError(c, err)
		return nil, false
	}

	var itinerary models.Itinerary
	err = h.db.WithContext(c.Request.Context()).
		Preload("Activities", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_number ASC, order_index ASC").Preload("Place")
		}).
		Where("id = ?", itineraryID).
		First(&itinerary).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "itinerary not found"})
		return nil, false
	}
	if err != nil {
		respondInternalError(c, err)
		return nil, false
	}

	activities := make([]aiItineraryContextActivity, 0, len(itinerary.Activities))
	for _, activity := range itinerary.Activities {
		item := aiItineraryContextActivity{
			ID:            activity.ID.String(),
			DayNumber:     activity.DayNumber,
			OrderIndex:    activity.OrderIndex,
			Title:         activity.Title,
			Category:      activity.Category,
			StartTime:     activity.StartTime,
			EndTime:       activity.EndTime,
			EstimatedCost: activity.EstimatedCost,
			Notes:         activity.Notes,
			Lat:           activity.Lat,
			Lng:           activity.Lng,
		}
		if activity.PlaceID != nil {
			placeID := activity.PlaceID.String()
			item.PlaceID = &placeID
		}
		if activity.Place != nil {
			item.PlaceName = activity.Place.Name
			if item.Location == "" && activity.Place.Address != nil {
				item.Location = *activity.Place.Address
			}
			if item.Area == "" && activity.Place.Area != nil {
				item.Area = *activity.Place.Area
			}
			if item.Lat == nil {
				item.Lat = activity.Place.Latitude
			}
			if item.Lng == nil {
				item.Lng = activity.Place.Longitude
			}
			if item.Location == "" {
				item.Location = activity.Place.Name
			}
		}
		activities = append(activities, item)
	}

	return &aiItineraryContext{
		ID:          itinerary.ID.String(),
		Title:       itinerary.Title,
		Destination: itinerary.Destination,
		StartDate:   itinerary.StartDate.Format("2006-01-02"),
		EndDate:     itinerary.EndDate.Format("2006-01-02"),
		Budget:      itinerary.Budget,
		GuestCount:  itinerary.GuestCount,
		Tags:        []string(itinerary.Tags),
		Activities:  activities,
	}, true
}

type streamDonePayload struct {
	Type      string          `json:"type"`
	SessionID string          `json:"session_id"`
	FullText  string          `json:"full_text"`
	Plan      json.RawMessage `json:"plan"`
	ToolCalls []string        `json:"tool_calls"`
}

// streamIdleTimeout caps the gap between two upstream chunks. Without this,
// a planner-ai that ships headers and then stalls would hold the backend
// goroutine open indefinitely. Two minutes is generous — minimax thinking
// time on a fresh plan can hit 90s.
const streamIdleTimeout = 2 * time.Minute

// chunkResult carries an OWNED byte slice (allocated per-read) so the main
// loop can safely write/parse it while the reader goroutine moves on to the
// next Read into a brand-new buffer.
type chunkResult struct {
	data []byte
	err  error
}

func (h *AIChatHandler) proxySSE(c *gin.Context, body io.Reader, done *streamDonePayload) error {
	flusher, _ := c.Writer.(http.Flusher)
	var pending string

	ctx := c.Request.Context()
	results := make(chan chunkResult, 1)
	// Background reader. Each iteration allocates its own buffer so the main
	// loop can keep using the previous slice while the reader fills the next.
	// Allocation cost is negligible (~100 chunks per chat).
	go func() {
		for {
			buf := make([]byte, 4096)
			n, err := body.Read(buf)
			out := chunkResult{err: err}
			if n > 0 {
				out.data = buf[:n]
			}
			results <- out
			if err != nil {
				return
			}
		}
	}()

	idle := time.NewTimer(streamIdleTimeout)
	defer idle.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-idle.C:
			return fmt.Errorf("upstream stream idle for %s", streamIdleTimeout)
		case r := <-results:
			if len(r.data) > 0 {
				if _, writeErr := c.Writer.Write(r.data); writeErr != nil {
					return writeErr
				}
				if flusher != nil {
					flusher.Flush()
				}
				pending += string(r.data)
				pending = parseSSEBuffer(pending, done)
			}
			if r.err != nil {
				if errors.Is(r.err, io.EOF) {
					return nil
				}
				return r.err
			}
			if !idle.Stop() {
				select {
				case <-idle.C:
				default:
				}
			}
			idle.Reset(streamIdleTimeout)
		}
	}
}

func parseSSEBuffer(pending string, done *streamDonePayload) string {
	for {
		idx := strings.Index(pending, "\n\n")
		if idx < 0 {
			return pending
		}
		event := pending[:idx]
		pending = pending[idx+2:]
		for _, line := range strings.Split(event, "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			var payload streamDonePayload
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &payload); err == nil && payload.Type == "done" {
				*done = payload
			}
		}
	}
}

func (h *AIChatHandler) persistExchange(ctx context.Context, userID, sessionID uuid.UUID, userMessage string, done streamDonePayload) error {
	return h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var session models.AIChatSession
		err := tx.First(&session, "id = ? AND user_id = ?", sessionID, userID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			session = models.AIChatSession{
				ID:     sessionID,
				UserID: userID,
				Title:  chatTitle(userMessage),
			}
			if dest := destinationFromPlan(done.Plan); dest != "" {
				session.Destination = &dest
			}
			if err := tx.Create(&session).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}

		metadata, err := assistantMetadata(done.ToolCalls, done.Plan)
		if err != nil {
			return err
		}
		messages := []models.AIChatMessage{
			{SessionID: &sessionID, Role: "USER", Content: userMessage},
			{SessionID: &sessionID, Role: "ASSISTANT", Content: done.FullText, Metadata: metadata},
		}
		if err := tx.Create(&messages).Error; err != nil {
			return err
		}

		updates := map[string]interface{}{
			"message_count": gorm.Expr("message_count + ?", len(messages)),
			"updated_at":    time.Now(),
		}
		if session.Destination == nil {
			if dest := destinationFromPlan(done.Plan); dest != "" {
				updates["destination"] = dest
			}
		}
		return tx.Model(&models.AIChatSession{}).
			Where("id = ? AND user_id = ?", sessionID, userID).
			Updates(updates).Error
	})
}

func (h *AIChatHandler) mustOwnedSession(c *gin.Context, rawID string) (models.AIChatSession, bool) {
	uid, ok := mustUserID(c)
	if !ok {
		return models.AIChatSession{}, false
	}
	userID, err := uuid.Parse(uid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
		return models.AIChatSession{}, false
	}
	sessionID, err := uuid.Parse(rawID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return models.AIChatSession{}, false
	}
	session, ok := h.ownedSession(c.Request.Context(), sessionID, userID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return models.AIChatSession{}, false
	}
	return session, true
}

func (h *AIChatHandler) ownedSession(ctx context.Context, sessionID, userID uuid.UUID) (models.AIChatSession, bool) {
	var session models.AIChatSession
	if err := h.db.WithContext(ctx).First(&session, "id = ? AND user_id = ?", sessionID, userID).Error; err != nil {
		return models.AIChatSession{}, false
	}
	return session, true
}

func sessionResponse(s models.AIChatSession) aiChatSessionResponse {
	return aiChatSessionResponse{
		SessionID:    s.ID.String(),
		CreatedAt:    s.CreatedAt.Format(time.RFC3339),
		LastActive:   s.UpdatedAt.Format(time.RFC3339),
		MessageCount: s.MessageCount,
		Destination:  s.Destination,
		Title:        s.Title,
	}
}

func messageResponse(m models.AIChatMessage) aiChatMessageResponse {
	resp := aiChatMessageResponse{
		Role:      strings.ToLower(m.Role),
		Content:   m.Content,
		CreatedAt: m.CreatedAt.Format(time.RFC3339),
	}
	if len(m.Metadata) == 0 {
		return resp
	}
	var meta struct {
		ToolCalls []string        `json:"tool_calls"`
		Plan      json.RawMessage `json:"plan"`
	}
	if err := json.Unmarshal(m.Metadata, &meta); err == nil {
		resp.ToolCalls = meta.ToolCalls
		resp.Plan = meta.Plan
	}
	return resp
}

func assistantMetadata(toolCalls []string, plan json.RawMessage) (json.RawMessage, error) {
	meta := map[string]interface{}{}
	if len(toolCalls) > 0 {
		meta["tool_calls"] = toolCalls
	}
	if len(plan) > 0 && string(plan) != "null" {
		meta["plan"] = json.RawMessage(plan)
	}
	if len(meta) == 0 {
		return nil, nil
	}
	return json.Marshal(meta)
}

func destinationFromPlan(plan json.RawMessage) string {
	if len(plan) == 0 || string(plan) == "null" {
		return ""
	}
	var payload struct {
		Days []struct {
			PrimaryArea string `json:"primary_area"`
		} `json:"days"`
	}
	if err := json.Unmarshal(plan, &payload); err != nil || len(payload.Days) == 0 {
		return ""
	}
	return strings.TrimSpace(payload.Days[0].PrimaryArea)
}

func chatTitle(message string) string {
	msg := strings.TrimSpace(message)
	if len([]rune(msg)) <= 80 {
		return msg
	}
	runes := []rune(msg)
	return string(runes[:80]) + "..."
}
