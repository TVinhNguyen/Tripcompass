package ws

import (
	"encoding/json"
	"log/slog"

	"gorm.io/gorm"
)

// Publisher fans an event out to a room over both the in-memory hub and Redis
// pub/sub so peers on other backend instances receive it too.
//
// Two dispatch paths:
//   - PublishEvent / PublishToUser: direct, lossy if the server crashes between
//     the call and the broadcast. Used for ephemeral events with no DB write
//     to be paired with (hub presence join/leave).
//   - PublishInTx / PublishToUserInTx: writes the event into the outbox table
//     within the caller's gorm transaction. A crash here loses the event iff
//     the same Tx also failed. The Worker drains the outbox asynchronously,
//     trading a few-hundred-ms latency for at-least-once delivery.
//
// Used by HTTP handlers after a successful mutation, so collaborative editing
// no longer depends on the client looping the event back through WebSocket.
type Publisher interface {
	PublishEvent(roomID, eventType string, payload any)
	PublishToUser(userID, eventType string, payload any)

	PublishInTx(tx *gorm.DB, roomID, eventType string, payload any) error
	PublishToUserInTx(tx *gorm.DB, userID, eventType string, payload any) error
}

// NewPublisher wires the hub (local fan-out) and pubsub (cross-instance) into
// the Publisher interface. Either can be nil for testing.
func NewPublisher(hub *Hub) Publisher {
	return &hubPublisher{hub: hub}
}

type hubPublisher struct {
	hub *Hub
}

func (p *hubPublisher) publish(roomID, eventType string, payload any) {
	if p.hub == nil || roomID == "" {
		return
	}
	body, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("ws publish: marshal payload", "event", eventType, "err", err)
		return
	}
	msg := Message{
		Type:    eventType,
		Payload: json.RawMessage(body),
		// Server-originated event — no sender info attached.
	}
	data, err := json.Marshal(msg)
	if err != nil {
		slog.Warn("ws publish: marshal envelope", "event", eventType, "err", err)
		return
	}
	p.hub.BroadcastToRoom(roomID, data, nil)
	if p.hub.redisPubSub != nil {
		p.hub.redisPubSub.Publish(p.hub.redisPubSub.ctx, roomID, data)
	}
}

func (p *hubPublisher) PublishEvent(roomID, eventType string, payload any) {
	p.publish(roomID, eventType, payload)
}

func (p *hubPublisher) PublishToUser(userID, eventType string, payload any) {
	if userID == "" {
		return
	}
	p.publish(UserRoomPrefix+userID, eventType, payload)
}

// PublishInTx writes the event into the outbox table so it commits atomically
// with the caller's mutation. The Worker drains the table and performs the
// actual broadcast within a few ticker cycles.
func (p *hubPublisher) PublishInTx(tx *gorm.DB, roomID, eventType string, payload any) error {
	return Enqueue(tx, eventType, roomID, payload)
}

func (p *hubPublisher) PublishToUserInTx(tx *gorm.DB, userID, eventType string, payload any) error {
	if userID == "" {
		return nil
	}
	return Enqueue(tx, eventType, UserRoomPrefix+userID, payload)
}
