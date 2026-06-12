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

// WSPublisher decouples this package from internal/ws (which would create an
// import cycle: ws → services for GetCollaboratorRole). Any implementation
// that emits an event to a user channel satisfies it. internal/ws's
// hubPublisher implements this directly.
//
// PublishToUser returns (acked, err) for parity with ws.Publisher — callers
// that publish outside a Tx log the ack signal but don't block on it.
type WSPublisher interface {
	PublishToUser(userID, eventType string, payload any) (acked bool, err error)
	PublishToUserInTx(tx *gorm.DB, userID, eventType string, payload any) error
}

type CollaboratorService struct {
	db    *gorm.DB
	email *EmailService
	pub   WSPublisher // optional; nil-safe
}

func NewCollaboratorService(db *gorm.DB, emailSvc *EmailService) *CollaboratorService {
	return &CollaboratorService{db: db, email: emailSvc}
}

// WithPublisher injects the WS publisher so Invite / Accept /
// LinkPendingInvites can emit per-user notification events. Chainable.
func (s *CollaboratorService) WithPublisher(pub WSPublisher) *CollaboratorService {
	s.pub = pub
	return s
}

type InviteInput struct {
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role"` // EDITOR | VIEWER, default VIEWER
}

type UpdateCollaboratorRoleInput struct {
	Role string `json:"role" binding:"required"` // EDITOR | VIEWER
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

	// Wrap the INSERT + outbox enqueue in a single transaction so a crash
	// between them can't leave us with an invite row that no notification
	// will ever fire for. The email is fire-and-forget below (see comment).
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&collab).Error; err != nil {
			return fmt.Errorf("create collaborator: %w", err)
		}
		if s.pub != nil && inviteeExists {
			return s.pub.PublishToUserInTx(tx, invitee.ID.String(), "collaborator.invited", map[string]any{
				"invite":         collab,
				"inviter_name":   owner.FullName,
				"itinerary_id":   it.ID.String(),
				"itinerary_name": it.Title,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
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

	// Notification was already enqueued inside the Tx above.
	return &collab, nil
}

// LinkPendingInvites attaches any pending-by-email Collaborator rows to a
// newly-registered user. Called from the auth Register flow inside the same
// transaction that creates the user.
//
// Returns the number of rows linked so callers (or tests) can verify the
// attachment without a follow-up SELECT. If a publisher is wired, one
// collaborator.invited event is emitted per linked invite so the new user
// sees the pending list in real time.
func (s *CollaboratorService) LinkPendingInvites(tx *gorm.DB, userID uuid.UUID, email string) (int64, error) {
	em := strings.ToLower(strings.TrimSpace(email))
	if em == "" {
		return 0, nil
	}
	db := tx
	if db == nil {
		db = s.db
	}

	// Capture the rows we're about to link so we can replay them as
	// notifications after the UPDATE commits.
	var pending []models.Collaborator
	if s.pub != nil {
		_ = db.Where("user_id IS NULL AND lower(email) = ?", em).Find(&pending).Error
	}

	res := db.Model(&models.Collaborator{}).
		Where("user_id IS NULL AND lower(email) = ?", em).
		Updates(map[string]interface{}{
			"user_id": userID,
			"email":   nil,
		})
	if res.Error != nil {
		return 0, res.Error
	}

	uidStr := userID.String()
	for _, p := range pending {
		p.UserID = &userID
		p.Email = nil
		payload := map[string]any{
			"invite":       p,
			"itinerary_id": p.ItineraryID.String(),
		}
		// Route through the outbox if we have a transaction — atomic with the
		// UPDATE above. Fall back to direct publish when called outside a Tx.
		if tx != nil {
			if err := s.pub.PublishToUserInTx(tx, uidStr, "collaborator.invited", payload); err != nil {
				slog.Warn("outbox enqueue (invite link) failed", "user_id", uidStr, "err", err)
			}
		} else {
			// Direct path: log if the broadcast didn't ack. This is the
			// best-effort flow — invite link link-pending claim runs outside
			// any Tx, so we can't enqueue. A non-ack here means a future
			// invite-status reconciliation pass would still resolve it.
			if _, perr := s.pub.PublishToUser(uidStr, "collaborator.invited", payload); perr != nil {
				slog.Warn("invite link publish not acked", "user_id", uidStr, "err", perr)
			}
		}
	}
	return res.RowsAffected, nil
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

// UpdateRole changes a collaborator's permission on an itinerary.
// Only the itinerary owner can change collaborator roles.
func (s *CollaboratorService) UpdateRole(collabID, requesterID string, input UpdateCollaboratorRoleInput) (*models.Collaborator, error) {
	role := strings.ToUpper(strings.TrimSpace(input.Role))
	if !validRole(role) {
		return nil, fmt.Errorf("%w: role must be EDITOR or VIEWER", apperror.ErrInvalidInput)
	}

	var collab models.Collaborator
	if err := s.db.First(&collab, "id = ?", collabID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}

	var it models.Itinerary
	if err := s.db.Select("id", "owner_id").First(&it, "id = ?", collab.ItineraryID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}
	if it.OwnerID.String() != requesterID {
		return nil, apperror.ErrForbidden
	}

	if err := s.db.Model(&collab).Update("role", role).Error; err != nil {
		return nil, err
	}
	collab.Role = role

	if err := s.db.Preload("User").First(&collab, "id = ?", collab.ID).Error; err != nil {
		return nil, err
	}
	return &collab, nil
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
//
// Kept as a standalone function (rather than wrapping GetCollaboratorRole)
// so callers along the hot HTTP path don't pay the extra branch / interface
// surface — it has been in the codebase since the original collaborator
// migration and its semantics are stable.
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

// GetCollaboratorRole returns the role a user holds on an itinerary, or
// ErrForbidden if they have no ACCEPTED relationship. The string is one of
// "OWNER" / "EDITOR" / "VIEWER".
//
// Used both by HTTP access checks (CheckEditAccess) and the WebSocket layer
// to gate which message types a connected client may send.
func GetCollaboratorRole(db *gorm.DB, itineraryID, userID string) (string, error) {
	itID, err := uuid.Parse(itineraryID)
	if err != nil {
		return "", apperror.ErrNotFound
	}
	var it models.Itinerary
	if err := db.Select("id", "owner_id").First(&it, "id = ?", itID).Error; err != nil {
		return "", apperror.ErrNotFound
	}
	if it.OwnerID.String() == userID {
		return "OWNER", nil
	}
	var collab models.Collaborator
	err = db.Where("itinerary_id = ? AND user_id = ? AND status = ?",
		itID, userID, "ACCEPTED").First(&collab).Error
	if err != nil {
		return "", apperror.ErrForbidden
	}
	return collab.Role, nil
}
