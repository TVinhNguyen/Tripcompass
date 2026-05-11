package handlers

import (
	"net/http"
	"tripcompass-backend/internal/services"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ActivityHandler struct {
	svc *services.ActivityService
	pub ws.Publisher
}

// NewActivityHandler wires the activity service and a WS publisher so mutations
// broadcast a server-authoritative event to every connected collaborator. The
// publisher can be nil in tests / migration paths — broadcasting is a no-op then.
func NewActivityHandler(db *gorm.DB, pub ws.Publisher) *ActivityHandler {
	return &ActivityHandler{
		svc: services.NewActivityService(db),
		pub: pub,
	}
}

// POST /activities
func (h *ActivityHandler) Create(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.CreateActivityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	act, err := h.svc.Create(uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	if h.pub != nil {
		h.pub.PublishEvent(act.ItineraryID.String(), ws.EventActivityCreated, gin.H{"activity": act})
	}
	c.JSON(http.StatusCreated, act)
}

// PATCH /activities/:id
func (h *ActivityHandler) Update(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.UpdateActivityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	act, err := h.svc.Update(c.Param("id"), uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	if h.pub != nil {
		h.pub.PublishEvent(act.ItineraryID.String(), ws.EventActivityUpdated, gin.H{"activity": act})
	}
	c.JSON(http.StatusOK, act)
}

// DELETE /activities/:id
func (h *ActivityHandler) Delete(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	activityID := c.Param("id")
	itineraryID, err := h.svc.Delete(activityID, uid)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	if h.pub != nil {
		h.pub.PublishEvent(itineraryID.String(), ws.EventActivityDeleted, gin.H{"activity_id": activityID})
	}
	c.JSON(http.StatusNoContent, nil)
}

// PATCH /activities/reorder
func (h *ActivityHandler) Reorder(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input struct {
		Items []services.ReorderItem `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	itineraryID, err := h.svc.Reorder(uid, input.Items)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	if h.pub != nil && itineraryID != [16]byte{} {
		h.pub.PublishEvent(itineraryID.String(), ws.EventActivityReordered, gin.H{"items": input.Items})
	}
	c.JSON(http.StatusOK, gin.H{"message": "reordered successfully"})
}
