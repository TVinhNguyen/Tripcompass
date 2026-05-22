package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisPubSub quản lý Pub/Sub và online tracking qua Redis
type RedisPubSub struct {
	rdb         *redis.Client
	hub         *Hub
	ctx         context.Context
	cancel      context.CancelFunc
	roomCancels map[string]context.CancelFunc
	roomMu      sync.Mutex
}

func NewRedisPubSub(rdb *redis.Client, hub *Hub) *RedisPubSub {
	ctx, cancel := context.WithCancel(context.Background())
	return &RedisPubSub{
		rdb:         rdb,
		hub:         hub,
		ctx:         ctx,
		cancel:      cancel,
		roomCancels: make(map[string]context.CancelFunc),
	}
}

// Close stops the RedisPubSub and cleans up all resources
func (ps *RedisPubSub) Close() {
	ps.cancel() // cancels all room subscriptions too (child contexts)
}

// ─── Online Tracking ─────────────────────────────────────────────────────────
// Lưu user đang online trong room: SET key = itinerary:{id}:online

const onlineKeyPrefix = "itinerary:"
const onlineKeySuffix = ":online"

func onlineKey(roomID string) string {
	return onlineKeyPrefix + roomID + onlineKeySuffix
}

func (ps *RedisPubSub) TrackOnline(ctx context.Context, roomID, userID string) {
	pipe := ps.rdb.Pipeline()
	pipe.SAdd(ctx, onlineKey(roomID), userID)
	// TTL 24h: tự expire nếu server crash mà không cleanup được
	pipe.Expire(ctx, onlineKey(roomID), 24*time.Hour)
	if _, err := pipe.Exec(ctx); err != nil {
		slog.Warn("pubsub: error tracking online", "room", roomID, "user", userID, "err", err)
	}
}

func (ps *RedisPubSub) TrackOffline(ctx context.Context, roomID, userID string) {
	// SRem only — không cần SCard+Del vì TTL sẽ tự cleanup
	if err := ps.rdb.SRem(ctx, onlineKey(roomID), userID).Err(); err != nil {
		slog.Warn("pubsub: error tracking offline", "room", roomID, "user", userID, "err", err)
	}
}

func (ps *RedisPubSub) GetOnlineUsers(ctx context.Context, roomID string) ([]string, error) {
	return ps.rdb.SMembers(ctx, onlineKey(roomID)).Result()
}



// pubEnvelope is the cross-server message wrapper used to deduplicate broadcasts.
// Messages published by this instance are ignored when received via the subscription.
type pubEnvelope struct {
	InstanceID string          `json:"_iid"`
	Data       json.RawMessage `json:"d"`
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────
// Dùng để scale nhiều server instances — mỗi server subscribe channel của room

const channelKeyPrefix = "ws:itinerary:"

func channelKey(roomID string) string {
	return channelKeyPrefix + roomID
}

// Publish wraps data with the hub's instanceID and publishes to Redis.
// The subscriber on the same instance will skip this message to avoid duplicates.
// Publish returns nil when Redis acknowledged the message. Callers (Publisher
// and the outbox worker) treat a non-nil return as "broadcast not acked
// cross-instance" — the outbox will retry rather than mark dispatched.
func (ps *RedisPubSub) Publish(ctx context.Context, roomID string, data []byte) error {
	envelope := pubEnvelope{
		InstanceID: ps.hub.instanceID,
		Data:       json.RawMessage(data),
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		slog.Warn("pubsub: marshal error", "room", roomID, "err", err)
		return err
	}
	if err := ps.rdb.Publish(ctx, channelKey(roomID), payload).Err(); err != nil {
		slog.Warn("pubsub: publish error", "room", roomID, "err", err)
		return err
	}
	return nil
}

// SubscribeRoom subscribe vào Redis channel cho 1 room với per-room context.
// Dùng UnsubscribeRoom để cancel riêng từng room mà không ảnh hưởng các room khác.
func (ps *RedisPubSub) SubscribeRoom(ctx context.Context, roomID string) {
	// Per-room context derived from hub-level context
	roomCtx, cancel := context.WithCancel(ps.ctx)
	ps.roomMu.Lock()
	ps.roomCancels[roomID] = cancel
	ps.roomMu.Unlock()

	sub := ps.rdb.Subscribe(roomCtx, channelKey(roomID))
	ch := sub.Channel()

	go func() {
		defer func() {
			sub.Close()
			ps.roomMu.Lock()
			delete(ps.roomCancels, roomID)
			ps.roomMu.Unlock()
		}()
		slog.Info("pubsub: subscribed", "room", roomID, "channel", channelKey(roomID))

		for {
			select {
			case <-roomCtx.Done():
				slog.Info("pubsub: unsubscribed", "room", roomID)
				return
			case msg, ok := <-ch:
				if !ok {
					slog.Info("pubsub: channel closed", "room", roomID)
					return
				}
				if len(msg.Payload) == 0 {
					continue
				}

				// Unwrap envelope and skip messages from this instance (already broadcast locally)
				var envelope pubEnvelope
				if err := json.Unmarshal([]byte(msg.Payload), &envelope); err != nil {
					slog.Warn("pubsub: invalid envelope", "room", roomID, "err", err)
					continue
				}
				if envelope.InstanceID == ps.hub.instanceID {
					continue // own-instance message: already broadcast in ReadPump
				}

				room := ps.hub.GetRoom(roomID)
				if room == nil {
					continue
				}
				room.Broadcast([]byte(envelope.Data), nil)
			}
		}
	}()
}

// UnsubscribeRoom cancels the subscription for a specific room
func (ps *RedisPubSub) UnsubscribeRoom(roomID string) {
	ps.roomMu.Lock()
	defer ps.roomMu.Unlock()
	if cancel, ok := ps.roomCancels[roomID]; ok {
		cancel()
	}
}


