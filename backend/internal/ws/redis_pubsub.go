package ws

import (
	"context"
	"encoding/json"
	"log"
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
		log.Printf("[Redis PubSub] Error tracking online room=%s user=%s: %v", roomID, userID, err)
	}
}

func (ps *RedisPubSub) TrackOffline(ctx context.Context, roomID, userID string) {
	// SRem only — không cần SCard+Del vì TTL sẽ tự cleanup
	if err := ps.rdb.SRem(ctx, onlineKey(roomID), userID).Err(); err != nil {
		log.Printf("[Redis PubSub] Error tracking offline room=%s user=%s: %v", roomID, userID, err)
	}
}

func (ps *RedisPubSub) GetOnlineUsers(ctx context.Context, roomID string) ([]string, error) {
	return ps.rdb.SMembers(ctx, onlineKey(roomID)).Result()
}

// GetOnlineUsersWithDetails retrieves online users with full details
func (ps *RedisPubSub) GetOnlineUsersWithDetails(ctx context.Context, roomID string, userMap map[string]SenderInfo) ([]SenderInfo, error) {
	userIDs, err := ps.GetOnlineUsers(ctx, roomID)
	if err != nil {
		return nil, err
	}

	var users []SenderInfo
	for _, userID := range userIDs {
		if user, ok := userMap[userID]; ok {
			users = append(users, user)
		}
	}
	return users, nil
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────
// Dùng để scale nhiều server instances — mỗi server subscribe channel của room

const channelKeyPrefix = "ws:itinerary:"

func channelKey(roomID string) string {
	return channelKeyPrefix + roomID
}

// Publish gửi message vào Redis channel
func (ps *RedisPubSub) Publish(ctx context.Context, roomID string, data []byte) {
	if err := ps.rdb.Publish(ctx, channelKey(roomID), data).Err(); err != nil {
		log.Printf("[Redis PubSub] Error publishing to room=%s: %v", roomID, err)
	}
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
		log.Printf("[Redis PubSub] Subscribed to room %s (channel: %s)", roomID, channelKey(roomID))

		for {
			select {
			case <-roomCtx.Done():
				log.Printf("[Redis PubSub] Stopped subscribing to room %s", roomID)
				return
			case msg, ok := <-ch:
				if !ok {
					log.Printf("[Redis PubSub] Channel closed for room %s", roomID)
					return
				}
				if len(msg.Payload) == 0 {
					continue
				}
				room := ps.hub.GetRoom(roomID)
				if room == nil {
					log.Printf("[Redis PubSub] Room %s not found locally, skipping", roomID)
					continue
				}
				room.Broadcast([]byte(msg.Payload), nil)
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

// HealthCheck verifies Redis connection
func (ps *RedisPubSub) HealthCheck() error {
	return ps.rdb.Ping(ps.ctx).Err()
}

// PublishUserStatus broadcasts user status changes (login/logout from anywhere)
func (ps *RedisPubSub) PublishUserStatus(ctx context.Context, userID string, status string, details string) {
	payload, _ := json.Marshal(map[string]interface{}{
		"type":      "user_status",
		"user_id":   userID,
		"status":    status,
		"details":   details,
		"timestamp": time.Now().Unix(),
	})
	if err := ps.rdb.Publish(ctx, "ws:user_status", payload).Err(); err != nil {
		log.Printf("[Redis PubSub] Error publishing user status user=%s: %v", userID, err)
	}
}

// SendTypingIndicator sends typing indicator for a specific itinerary
func (ps *RedisPubSub) SendTypingIndicator(ctx context.Context, roomID, userID string, isTyping bool) {
	payload, _ := json.Marshal(map[string]interface{}{
		"type":    "typing",
		"user_id": userID,
		"typing":  isTyping,
	})
	if err := ps.rdb.Publish(ctx, channelKey(roomID), payload).Err(); err != nil {
		log.Printf("[Redis PubSub] Error sending typing indicator room=%s user=%s: %v", roomID, userID, err)
	}
}
