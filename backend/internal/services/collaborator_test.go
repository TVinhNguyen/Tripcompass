package services

import (
	"strings"
	"sync"
	"testing"

	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

// stubPub records calls to PublishToUser / PublishToUserInTx so the tests
// can assert what events were emitted without spinning up the hub.
type stubPub struct {
	mu       sync.Mutex
	direct   []stubCall
	enqueued []stubCall
}

type stubCall struct {
	UserID    string
	EventType string
}

func (p *stubPub) PublishToUser(userID, eventType string, _ any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.direct = append(p.direct, stubCall{UserID: userID, EventType: eventType})
}

func (p *stubPub) PublishToUserInTx(_ *gorm.DB, userID, eventType string, _ any) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.enqueued = append(p.enqueued, stubCall{UserID: userID, EventType: eventType})
	return nil
}

// ─── Invite — registered user happy path ─────────────────────────────────────

func TestCollaboratorService_Invite_RegisteredUser(t *testing.T) {
	db := setupTestDB(t)
	owner := createTestUser(t, db)
	invitee := createTestUserWith(t, db, "invitee@example.com")
	it := createTestItinerary(t, db, owner.ID)

	pub := &stubPub{}
	svc := NewCollaboratorService(db, nil).WithPublisher(pub)

	collab, err := svc.Invite(it.ID.String(), owner.ID.String(), InviteInput{
		Email: "invitee@example.com",
		Role:  "EDITOR",
	})
	assert.NoError(t, err)
	if assert.NotNil(t, collab) {
		assert.NotNil(t, collab.UserID)
		assert.Equal(t, invitee.ID, *collab.UserID)
		assert.Nil(t, collab.Email)
		assert.Equal(t, "PENDING", collab.Status)
		assert.Equal(t, "EDITOR", collab.Role)
	}

	// Event went through the outbox path (transactional).
	assert.Len(t, pub.enqueued, 1)
	assert.Equal(t, invitee.ID.String(), pub.enqueued[0].UserID)
	assert.Equal(t, "collaborator.invited", pub.enqueued[0].EventType)
	// Nothing went through the direct path.
	assert.Empty(t, pub.direct)
}

// ─── Invite — pending by email when invitee has no account ───────────────────

func TestCollaboratorService_Invite_PendingByEmail(t *testing.T) {
	db := setupTestDB(t)
	owner := createTestUser(t, db)
	it := createTestItinerary(t, db, owner.ID)

	pub := &stubPub{}
	svc := NewCollaboratorService(db, nil).WithPublisher(pub)

	collab, err := svc.Invite(it.ID.String(), owner.ID.String(), InviteInput{
		Email: "future-user@example.com",
		Role:  "VIEWER",
	})
	assert.NoError(t, err)
	if assert.NotNil(t, collab) {
		assert.Nil(t, collab.UserID, "user_id should be NULL until LinkPendingInvites runs")
		if assert.NotNil(t, collab.Email) {
			assert.Equal(t, "future-user@example.com", *collab.Email)
		}
		assert.Equal(t, "PENDING", collab.Status)
	}

	// No notification fired yet — there's no user to reach. LinkPendingInvites
	// will emit one when the address registers.
	assert.Empty(t, pub.enqueued)
	assert.Empty(t, pub.direct)
}

// ─── Invite — conflict on second invite with same email ──────────────────────

func TestCollaboratorService_Invite_RejectsDuplicateEmail(t *testing.T) {
	db := setupTestDB(t)
	owner := createTestUser(t, db)
	it := createTestItinerary(t, db, owner.ID)

	svc := NewCollaboratorService(db, nil)

	_, err := svc.Invite(it.ID.String(), owner.ID.String(), InviteInput{
		Email: "dup@example.com",
		Role:  "EDITOR",
	})
	assert.NoError(t, err)

	_, err = svc.Invite(it.ID.String(), owner.ID.String(), InviteInput{
		Email: "DUP@example.com", // same address, different case
		Role:  "EDITOR",
	})
	assert.Error(t, err, "second invite to same email should conflict")
}

// ─── Invite — owner cannot invite themselves ─────────────────────────────────

func TestCollaboratorService_Invite_OwnerCannotInviteSelf(t *testing.T) {
	db := setupTestDB(t)
	owner := createTestUser(t, db)
	it := createTestItinerary(t, db, owner.ID)

	svc := NewCollaboratorService(db, nil)
	_, err := svc.Invite(it.ID.String(), owner.ID.String(), InviteInput{
		Email: strings.ToUpper(owner.Email),
		Role:  "VIEWER",
	})
	assert.Error(t, err)
}

// ─── LinkPendingInvites ──────────────────────────────────────────────────────

func TestCollaboratorService_LinkPendingInvites_AttachesAndNotifies(t *testing.T) {
	db := setupTestDB(t)
	owner := createTestUser(t, db)
	it := createTestItinerary(t, db, owner.ID)

	// Stage two pending invites for the same address.
	for _, dest := range []string{"a", "b"} {
		em := "newcomer@example.com"
		c := models.Collaborator{
			ItineraryID: it.ID,
			Email:       &em,
			InvitedBy:   owner.ID,
			Role:        "EDITOR",
			Status:      "PENDING",
		}
		if err := db.Create(&c).Error; err != nil {
			t.Fatalf("seed %s: %v", dest, err)
		}
		// Use both rows to defeat the unique index by varying the itinerary.
		// (Same itinerary + same email is blocked by the partial index, so
		// the second create on the same itinerary would actually fail.)
		_ = c
		break // one row is enough; the loop existed for clarity
	}

	// Now register a new user with that email and run the link.
	newUser := createTestUserWith(t, db, "newcomer@example.com")
	pub := &stubPub{}
	svc := NewCollaboratorService(db, nil).WithPublisher(pub)

	linked, err := svc.LinkPendingInvites(db, newUser.ID, newUser.Email)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), linked)

	// Row is now bound to the user, email cleared.
	var bound models.Collaborator
	if err := db.First(&bound, "itinerary_id = ?", it.ID).Error; err != nil {
		t.Fatalf("loaded linked row: %v", err)
	}
	if assert.NotNil(t, bound.UserID) {
		assert.Equal(t, newUser.ID, *bound.UserID)
	}
	assert.Nil(t, bound.Email)

	// A transaction was provided, so notifications are enqueued transactionally.
	if assert.Len(t, pub.enqueued, 1) {
		assert.Equal(t, newUser.ID.String(), pub.enqueued[0].UserID)
		assert.Equal(t, "collaborator.invited", pub.enqueued[0].EventType)
	}
	assert.Empty(t, pub.direct)
}

func TestCollaboratorService_LinkPendingInvites_EmptyEmailIsNoOp(t *testing.T) {
	db := setupTestDB(t)
	svc := NewCollaboratorService(db, nil)
	linked, err := svc.LinkPendingInvites(db, uuid.New(), "   ")
	assert.NoError(t, err)
	assert.Equal(t, int64(0), linked)
}

// ─── ListPending picks up email-only rows for the requester ──────────────────

func TestCollaboratorService_ListPending_IncludesEmailMatch(t *testing.T) {
	db := setupTestDB(t)
	owner := createTestUser(t, db)
	user := createTestUserWith(t, db, "list@example.com")
	it := createTestItinerary(t, db, owner.ID)

	// Seed a pending-by-email row that has NOT been linked yet.
	em := "list@example.com"
	if err := db.Create(&models.Collaborator{
		ItineraryID: it.ID,
		Email:       &em,
		InvitedBy:   owner.ID,
		Role:        "VIEWER",
		Status:      "PENDING",
	}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	svc := NewCollaboratorService(db, nil)
	list, err := svc.ListPending(user.ID.String())
	assert.NoError(t, err)
	assert.Len(t, list, 1, "ListPending should surface email-matching rows even without user_id")
}
