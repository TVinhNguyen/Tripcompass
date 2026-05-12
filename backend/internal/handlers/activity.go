package handlers

import (
	"net/http"
	"tripcompass-backend/internal/models"
	"tripcompass-backend/internal/services"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ActivityHandler struct {
	db  *gorm.DB
	svc *services.ActivityService
	pub ws.Publisher
}

// NewActivityHandler wires the activity service and a WS publisher. The db
// handle is kept so each mutation can run inside a single transaction that
// also enqueues the WS event into the outbox (commit 6684226 — atomic
// at-least-once delivery). The publisher can be nil in tests; the outbox
// enqueue is a no-op then.
func NewActivityHandler(db *gorm.DB, pub ws.Publisher) *ActivityHandler {
	return &ActivityHandler{
		db:  db,
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

	var act *models.Activity
	err := h.db.Transaction(func(tx *gorm.DB) error {
		a, err := h.svc.WithTx(tx).Create(uid, input)
		if err != nil {
			return err
		}
		act = a
		if h.pub != nil {
			return h.pub.PublishInTx(tx, act.ItineraryID.String(), ws.EventActivityCreated, gin.H{"activity": act})
		}
		return nil
	})
	if err != nil {
		handleServiceError(c, err)
		return
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

	var act *models.Activity
	err := h.db.Transaction(func(tx *gorm.DB) error {
		a, err := h.svc.WithTx(tx).Update(c.Param("id"), uid, input)
		if err != nil {
			return err
		}
		act = a
		if h.pub != nil {
			return h.pub.PublishInTx(tx, act.ItineraryID.String(), ws.EventActivityUpdated, gin.H{"activity": act})
		}
		return nil
	})
	if err != nil {
		handleServiceError(c, err)
		return
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

	var itineraryID string
	err := h.db.Transaction(func(tx *gorm.DB) error {
		itID, err := h.svc.WithTx(tx).Delete(activityID, uid)
		if err != nil {
			return err
		}
		itineraryID = itID.String()
		if h.pub != nil {
			return h.pub.PublishInTx(tx, itineraryID, ws.EventActivityDeleted, gin.H{"activity_id": activityID})
		}
		return nil
	})
	if err != nil {
		handleServiceError(c, err)
		return
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

	var itineraryID string
	err := h.db.Transaction(func(tx *gorm.DB) error {
		itID, err := h.svc.WithTx(tx).Reorder(uid, input.Items)
		if err != nil {
			return err
		}
		// Empty items slice produces uuid.Nil — nothing to broadcast.
		if itID == [16]byte{} {
			return nil
		}
		itineraryID = itID.String()
		if h.pub != nil {
			return h.pub.PublishInTx(tx, itineraryID, ws.EventActivityReordered, gin.H{"items": input.Items})
		}
		return nil
	})
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "reordered successfully"})
}
