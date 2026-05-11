package ws

import (
	"encoding/json"
	"log/slog"
)

// Publisher fans an event out to a room over both the in-memory hub and Redis
// pub/sub so peers on other backend instances receive it too.
//
// Used by HTTP handlers after a successful mutation, so collaborative editing
// no longer depends on the client looping the event back through WebSocket.
type Publisher interface {
	PublishEvent(roomID, eventType string, payload any)
}

// NewPublisher wires the hub (local fan-out) and pubsub (cross-instance) into
// the Publisher interface. Either can be nil for testing.
func NewPublisher(hub *Hub) Publisher {
	return &hubPublisher{hub: hub}
}

type hubPublisher struct {
	hub *Hub
}

func (p *hubPublisher) PublishEvent(roomID, eventType string, payload any) {
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
