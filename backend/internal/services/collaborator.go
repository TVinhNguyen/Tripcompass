package services

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CollaboratorService struct {
	db    *gorm.DB
	email *EmailService
}

func NewCollaboratorService(db *gorm.DB, emailSvc *EmailService) *CollaboratorService {
	return &CollaboratorService{db: db, email: emailSvc}
}

type InviteInput struct {
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role"` // EDITOR | VIEWER, default VIEWER
}

func validRole(role string) bool {
	return role == "EDITOR" || role == "VIEWER"
}

// Invite creates a PENDING collaborator entry and sends an invite email.
// Only the itinerary owner can invite. The invitee must be an existing user.
func (s *CollaboratorService) Invite(itineraryID, ownerID string, input InviteInput) (*models.Collaborator, error) {
	role := strings.ToUpper(strings.TrimSpace(input.Role))
	if role == "" {
		role = "VIEWER"
	}
	if !validRole(role) {
		return nil, fmt.Errorf("%w: role must be EDITOR or VIEWER", apperror.ErrInvalidInput)
	}

	var it models.Itinerary
	if err := s.db.First(&it, "id = ?", itineraryID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}
	if it.OwnerID.String() != ownerID {
		return nil, apperror.ErrForbidden
	}

	var owner models.User
	if err := s.db.First(&owner, "id = ?", it.OwnerID).Error; err != nil {
		return nil, err
	}

	var invitee models.User
	if err := s.db.First(&invitee, "lower(email) = lower(?)", input.Email).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("%w: no user with that email", apperror.ErrNotFound)
		}
		return nil, err
	}
	if invitee.ID == it.OwnerID {
		return nil, fmt.Errorf("%w: owner cannot be invited as collaborator", apperror.ErrInvalidInput)
	}

	var existing models.Collaborator
	err := s.db.Where("itinerary_id = ? AND user_id = ?", it.ID, invitee.ID).First(&existing).Error
	if err == nil {
		return nil, fmt.Errorf("%w: user already invited (status=%s)", apperror.ErrConflict, existing.Status)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	collab := models.Collaborator{
		ItineraryID: it.ID,
		UserID:      invitee.ID,
		InvitedBy:   it.OwnerID,
		Role:        role,
		Status:      "PENDING",
	}
	if err := s.db.Create(&collab).Error; err != nil {
		return nil, fmt.Errorf("create collaborator: %w", err)
	}

	if s.email != nil {
		go func(to, name, inviter, title, role string) {
			defer func() {
				if r := recover(); r != nil {
					slog.Warn("[email] panic sending invite", "err", r)
				}
			}()
			if err := s.email.SendCollaboratorInvite(to, name, inviter, title, role); err != nil {
				slog.Warn("send invite email failed", "to", to, "err", err)
			}
		}(invitee.Email, invitee.FullName, owner.FullName, it.Title, role)
	}

	collab.User = &invitee
	return &collab, nil
}

// List returns all collaborators of an itinerary.
// Owner or any ACCEPTED collaborator can view.
func (s *CollaboratorService) List(itineraryID, requesterID string) ([]models.Collaborator, error) {
	var it models.Itinerary
	if err := s.db.First(&it, "id = ?", itineraryID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}
	if it.OwnerID.String() != requesterID {
		var collab models.Collaborator
		if err := s.db.Where("itinerary_id = ? AND user_id = ? AND status = ?",
			itineraryID, requesterID, "ACCEPTED").First(&collab).Error; err != nil {
			return nil, apperror.ErrForbidden
		}
	}

	var list []models.Collaborator
	if err := s.db.Preload("User").Where("itinerary_id = ?", itineraryID).
		Order("joined_at ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}

// ListPending returns invitations where the requester is the invitee and status=PENDING.
func (s *CollaboratorService) ListPending(userID string) ([]models.Collaborator, error) {
	var list []models.Collaborator
	err := s.db.
		Preload("User").
		Where("user_id = ? AND status = ?", userID, "PENDING").
		Order("id DESC").
		Find(&list).Error
	return list, err
}

// Accept transitions a PENDING invite to ACCEPTED. Only the invitee may accept.
func (s *CollaboratorService) Accept(collabID, userID string) (*models.Collaborator, error) {
	var collab models.Collaborator
	if err := s.db.First(&collab, "id = ?", collabID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}
	if collab.UserID.String() != userID {
		return nil, apperror.ErrForbidden
	}
	if collab.Status != "PENDING" {
		return nil, fmt.Errorf("%w: invite is not pending", apperror.ErrConflict)
	}

	now := time.Now()
	if err := s.db.Model(&collab).Updates(map[string]interface{}{
		"status":    "ACCEPTED",
		"joined_at": now,
	}).Error; err != nil {
		return nil, err
	}
	return &collab, nil
}

// Decline deletes a PENDING invite. Only the invitee may decline.
func (s *CollaboratorService) Decline(collabID, userID string) error {
	var collab models.Collaborator
	if err := s.db.First(&collab, "id = ?", collabID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperror.ErrNotFound
		}
		return err
	}
	if collab.UserID.String() != userID {
		return apperror.ErrForbidden
	}
	if collab.Status != "PENDING" {
		return fmt.Errorf("%w: invite is not pending", apperror.ErrConflict)
	}
	return s.db.Delete(&collab).Error
}

// Remove deletes a collaborator entry.
// Allowed for the itinerary owner (kicking someone out) or the collaborator themselves (leaving).
func (s *CollaboratorService) Remove(collabID, requesterID string) error {
	var collab models.Collaborator
	if err := s.db.First(&collab, "id = ?", collabID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperror.ErrNotFound
		}
		return err
	}

	var it models.Itinerary
	if err := s.db.First(&it, "id = ?", collab.ItineraryID).Error; err != nil {
		return apperror.ErrNotFound
	}

	isOwner := it.OwnerID.String() == requesterID
	isSelf := collab.UserID.String() == requesterID
	if !isOwner && !isSelf {
		return apperror.ErrForbidden
	}
	return s.db.Delete(&collab).Error
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission helpers used by other services to authorize itinerary actions.
// ─────────────────────────────────────────────────────────────────────────────

// CheckEditAccess returns nil if userID is the owner OR an ACCEPTED collaborator with role=EDITOR.
// Used by activity write endpoints to allow editors to modify activities.
func CheckEditAccess(db *gorm.DB, itineraryID, userID string) error {
	itID, err := uuid.Parse(itineraryID)
	if err != nil {
		return apperror.ErrNotFound
	}
	var it models.Itinerary
	if err := db.Select("id", "owner_id").First(&it, "id = ?", itID).Error; err != nil {
		return apperror.ErrNotFound
	}
	if it.OwnerID.String() == userID {
		return nil
	}
	var collab models.Collaborator
	err = db.Where("itinerary_id = ? AND user_id = ? AND status = ? AND role = ?",
		itID, userID, "ACCEPTED", "EDITOR").First(&collab).Error
	if err == nil {
		return nil
	}
	return apperror.ErrForbidden
}
