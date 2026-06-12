package handlers

import (
	"net/http"
	"tripcompass-backend/internal/config"
	"tripcompass-backend/internal/services"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CollaboratorHandler struct {
	svc *services.CollaboratorService
}

// NewCollaboratorHandler wires the service together with a WS publisher so
// new invites trigger a per-user notification in addition to the email.
// Passing pub=nil leaves the notification path disabled (used in tests).
func NewCollaboratorHandler(db *gorm.DB, cfg *config.Config, pub ws.Publisher) *CollaboratorHandler {
	emailSvc := services.NewEmailService(cfg)
	svc := services.NewCollaboratorService(db, emailSvc)
	if pub != nil {
		svc = svc.WithPublisher(pub)
	}
	return &CollaboratorHandler{svc: svc}
}

// POST /itineraries/:id/collaborators — owner invites by email.
func (h *CollaboratorHandler) Invite(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.InviteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	collab, err := h.svc.Invite(c.Param("id"), uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, collab)
}

// GET /itineraries/:id/collaborators — owner or accepted collaborator can list.
func (h *CollaboratorHandler) List(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	list, err := h.svc.List(c.Param("id"), uid)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

// PATCH /collaborators/:id/role — owner changes a collaborator permission.
func (h *CollaboratorHandler) UpdateRole(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.UpdateCollaboratorRoleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	collab, err := h.svc.UpdateRole(c.Param("id"), uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, collab)
}

// GET /collaborators/pending — list my pending invitations.
func (h *CollaboratorHandler) ListPending(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	list, err := h.svc.ListPending(uid)
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

// POST /collaborators/:id/accept — invitee accepts.
func (h *CollaboratorHandler) Accept(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	collab, err := h.svc.Accept(c.Param("id"), uid)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, collab)
}

// POST /collaborators/:id/decline — invitee declines (deletes the pending row).
func (h *CollaboratorHandler) Decline(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	if err := h.svc.Decline(c.Param("id"), uid); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// DELETE /collaborators/:id — owner kicks out OR collaborator self-leaves.
func (h *CollaboratorHandler) Remove(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	if err := h.svc.Remove(c.Param("id"), uid); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
