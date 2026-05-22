package ws

import (
	"encoding/json"
	"fmt"

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
// The synchronous methods return (acked, err). "Acked" means:
//   - Local hub broadcast succeeded, AND
//   - If Redis is configured, Redis PUBLISH succeeded.
//
// The outbox worker uses this signal to decide whether to mark a row as
// dispatched or to retry — without it (the previous API was fire-and-forget)
// a Redis outage would silently lose events to other instances.
type Publisher interface {
	PublishEvent(roomID, eventType string, payload any) (acked bool, err error)
	PublishToUser(userID, eventType string, payload any) (acked bool, err error)

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

// publish performs both the local broadcast and the Redis fan-out, returning
// acked=true only when every configured path succeeded. A nil Redis pubsub
// (test wiring, or single-instance deploys) is treated as "not configured"
// and doesn't gate the ack.
func (p *hubPublisher) publish(roomID, eventType string, payload any) (bool, error) {
	if p.hub == nil || roomID == "" {
		// Nothing to publish to; treat as ack so the outbox doesn't loop on
		// rows aimed at an unconfigured destination.
		return true, nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return false, fmt.Errorf("marshal payload: %w", err)
	}
	msg := Message{
		Type:    eventType,
		Payload: json.RawMessage(body),
		// Server-originated event — no sender info attached.
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return false, fmt.Errorf("marshal envelope: %w", err)
	}

	// Local broadcast is in-memory; failures here would indicate a hub bug,
	// not a transient condition. Hub.BroadcastToRoom doesn't return an error.
	p.hub.BroadcastToRoom(roomID, data, nil)

	// Cross-instance: only ack if Redis is configured AND publish succeeded.
	if p.hub.redisPubSub != nil {
		if err := p.hub.redisPubSub.Publish(p.hub.redisPubSub.ctx, roomID, data); err != nil {
			return false, fmt.Errorf("redis publish: %w", err)
		}
	}
	return true, nil
}

func (p *hubPublisher) PublishEvent(roomID, eventType string, payload any) (bool, error) {
	return p.publish(roomID, eventType, payload)
}

func (p *hubPublisher) PublishToUser(userID, eventType string, payload any) (bool, error) {
	if userID == "" {
		return true, nil
	}
	return p.publish(UserRoomPrefix+userID, eventType, payload)
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
