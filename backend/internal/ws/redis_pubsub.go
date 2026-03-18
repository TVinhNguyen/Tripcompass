package ws

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
)

// RedisPubSub quản lý Pub/Sub và online tracking qua Redis
type RedisPubSub struct {
	rdb *redis.Client
	hub *Hub
}

func NewRedisPubSub(rdb *redis.Client, hub *Hub) *RedisPubSub {
	return &RedisPubSub{rdb: rdb, hub: hub}
}

// ─── Online Tracking ─────────────────────────────────────────────────────────
// Lưu user đang online trong room: SET key = itinerary:{id}:online

func onlineKey(roomID string) string {
	return "itinerary:" + roomID + ":online"
}

func (ps *RedisPubSub) TrackOnline(ctx context.Context, roomID, userID string) {
	ps.rdb.SAdd(ctx, onlineKey(roomID), userID)
}

func (ps *RedisPubSub) TrackOffline(ctx context.Context, roomID, userID string) {
	ps.rdb.SRem(ctx, onlineKey(roomID), userID)
	// Cleanup key if empty
	count, _ := ps.rdb.SCard(ctx, onlineKey(roomID)).Result()
	if count == 0 {
		ps.rdb.Del(ctx, onlineKey(roomID))
	}
}

func (ps *RedisPubSub) GetOnlineUsers(ctx context.Context, roomID string) ([]string, error) {
	return ps.rdb.SMembers(ctx, onlineKey(roomID)).Result()
}

// ─── Pub/Sub ─────────────────────────────────────────────────────────────────
// Dùng để scale nhiều server instances — mỗi server subscribe channel của room

func channelKey(roomID string) string {
	return "ws:itinerary:" + roomID
}

// Publish gửi message vào Redis channel
func (ps *RedisPubSub) Publish(ctx context.Context, roomID string, data []byte) {
	ps.rdb.Publish(ctx, channelKey(roomID), data)
}

// SubscribeRoom subscribe vào Redis channel cho 1 room.
// Chạy trong goroutine, tự dọn khi room empty.
func (ps *RedisPubSub) SubscribeRoom(ctx context.Context, roomID string) {
	sub := ps.rdb.Subscribe(ctx, channelKey(roomID))
	ch := sub.Channel()

	go func() {
		defer sub.Close()
		for msg := range ch {
			// Forward message to local room clients
			var wsMsg Message
			if err := json.Unmarshal([]byte(msg.Payload), &wsMsg); err != nil {
				continue
			}

			room := ps.hub.GetRoom(roomID)
			if room == nil {
				// Room no longer exists locally, unsubscribe
				return
			}

			data := []byte(msg.Payload)
			// Broadcast to all local clients (sender is on another server)
			room.Broadcast(data, nil)
		}
	}()

	log.Printf("[Redis PubSub] Subscribed to room %s", roomID)
}
