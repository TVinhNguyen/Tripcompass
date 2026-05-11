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
// Invite either binds an existing User to the itinerary as PENDING or, if
// no user with that email exists yet, records a pending invite carrying the
// email. The pending row is converted to a real user link by
// LinkPendingInvites the next time someone registers with that email.
func (s *CollaboratorService) Invite(itineraryID, ownerID string, input InviteInput) (*models.Collaborator, error) {
	role := strings.ToUpper(strings.TrimSpace(input.Role))
	if role == "" {
		role = "VIEWER"
	}
	if !validRole(role) {
		return nil, fmt.Errorf("%w: role must be EDITOR or VIEWER", apperror.ErrInvalidInput)
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if email == "" {
		return nil, fmt.Errorf("%w: email is required", apperror.ErrInvalidInput)
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

	// Owner can't invite themselves regardless of whether they registered with
	// the supplied email or not.
	if strings.EqualFold(owner.Email, email) {
		return nil, fmt.Errorf("%w: owner cannot be invited as collaborator", apperror.ErrInvalidInput)
	}

	// Look up the invitee. Absence is fine — we create a pending-by-email row.
	var invitee models.User
	var inviteeExists bool
	if err := s.db.First(&invitee, "lower(email) = ?", email).Error; err == nil {
		inviteeExists = true
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// Conflict check covers both (itinerary_id, user_id) for registered users
	// and (itinerary_id, lower(email)) for pending-by-email rows.
	var existing models.Collaborator
	q := s.db.Where("itinerary_id = ?", it.ID)
	if inviteeExists {
		q = q.Where("user_id = ? OR lower(email) = ?", invitee.ID, email)
	} else {
		q = q.Where("lower(email) = ?", email)
	}
	if err := q.First(&existing).Error; err == nil {
		return nil, fmt.Errorf("%w: invitee already on this itinerary (status=%s)", apperror.ErrConflict, existing.Status)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	collab := models.Collaborator{
		ItineraryID: it.ID,
		InvitedBy:   it.OwnerID,
		Role:        role,
		Status:      "PENDING",
	}
	if inviteeExists {
		uid := invitee.ID
		collab.UserID = &uid
		collab.User = &invitee
	} else {
		em := email
		collab.Email = &em
	}
	if err := s.db.Create(&collab).Error; err != nil {
		return nil, fmt.Errorf("create collaborator: %w", err)
	}

	// Email goes out to the supplied address regardless of registration.
	if s.email != nil {
		var toName string
		toEmail := email
		if inviteeExists {
			toEmail = invitee.Email
			toName = invitee.FullName
		}
		go func(to, name, inviter, title, role string) {
			defer func() {
				if r := recover(); r != nil {
					slog.Warn("[email] panic sending invite", "err", r)
				}
			}()
			if err := s.email.SendCollaboratorInvite(to, name, inviter, title, role); err != nil {
				slog.Warn("send invite email failed", "to", to, "err", err)
			}
		}(toEmail, toName, owner.FullName, it.Title, role)
	}

	return &collab, nil
}

// LinkPendingInvites attaches any pending-by-email Collaborator rows to a
// newly-registered user. Called from the auth Register flow inside the same
// transaction that creates the user.
//
// Returns the number of rows linked so callers (or tests) can verify the
// attachment without a follow-up SELECT.
func (s *CollaboratorService) LinkPendingInvites(tx *gorm.DB, userID uuid.UUID, email string) (int64, error) {
	em := strings.ToLower(strings.TrimSpace(email))
	if em == "" {
		return 0, nil
	}
	db := tx
	if db == nil {
		db = s.db
	}
	res := db.Model(&models.Collaborator{}).
		Where("user_id IS NULL AND lower(email) = ?", em).
		Updates(map[string]interface{}{
			"user_id": userID,
			"email":   nil,
		})
	return res.RowsAffected, res.Error
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

// ListPending returns PENDING invitations for the requester. Matches both
// user_id-bound rows AND pending-by-email rows where the email equals the
// requester's account email (covers the race window between Register's
// LinkPendingInvites and a refresh).
func (s *CollaboratorService) ListPending(userID string) ([]models.Collaborator, error) {
	var user models.User
	if err := s.db.Select("id", "email").First(&user, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}
	email := strings.ToLower(user.Email)

	var list []models.Collaborator
	err := s.db.
		Preload("User").
		Where("status = ? AND (user_id = ? OR (user_id IS NULL AND lower(email) = ?))",
			"PENDING", userID, email).
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
	if collab.UserID == nil || collab.UserID.String() != userID {
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
	if collab.UserID == nil || collab.UserID.String() != userID {
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
	isSelf := collab.UserID != nil && collab.UserID.String() == requesterID
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
