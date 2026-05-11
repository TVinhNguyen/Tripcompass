package ws

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ─── Message protocol ─────────────────────────────────────────────────────────
// Event types match docs/integration/04-ITINERARY-COLLAB-FLOW.md §5 — and the
// WSEventType union in frontend/lib/types.ts. Anything emitted from the server
// MUST match a case in that union or the FE will silently drop it.

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Sender  *SenderInfo     `json:"sender,omitempty"`
}

type SenderInfo struct {
	UserID   string `json:"user_id"`
	FullName string `json:"full_name"`
}

const (
	EventPresenceJoin   = "presence.join"
	EventPresenceLeave  = "presence.leave"
	EventPresenceOnline = "presence.online" // initial roster sent to the joiner

	EventActivityCreated   = "activity.created"
	EventActivityUpdated   = "activity.updated"
	EventActivityDeleted   = "activity.deleted"
	EventActivityReordered = "activity.reordered"
	EventItineraryUpdated  = "itinerary.updated"
	EventError             = "error"
)

// ─── Client ───────────────────────────────────────────────────────────────────

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 8192
)

type Client struct {
	ID        string
	UserID    string
	FullName  string
	RoomID    string
	Hub       *Hub
	Conn      *websocket.Conn
	Send      chan []byte
	closeOnce sync.Once
}

func NewClient(hub *Hub, conn *websocket.Conn, roomID, userID, fullName string) *Client {
	return &Client{
		ID:       uuid.New().String(),
		UserID:   userID,
		FullName: fullName,
		RoomID:   roomID,
		Hub:      hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
	}
}

// ReadPump đọc messages từ WebSocket connection
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("ws read error", "client", c.UserID, "err", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.sendError("invalid JSON format")
			continue
		}

		// Attach sender info
		msg.Sender = &SenderInfo{
			UserID:   c.UserID,
			FullName: c.FullName,
		}

		// Marshal message
		data, _ := json.Marshal(msg)

		// Broadcast to room (excluding sender) - in-memory
		c.Hub.BroadcastToRoom(c.RoomID, data, c)

		// Publish to Redis for cross-server broadcasting
		if c.Hub.redisPubSub != nil {
			c.Hub.redisPubSub.Publish(c.Hub.redisPubSub.ctx, c.RoomID, data)
		}
	}
}

// WritePump gửi messages ra WebSocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) sendError(msg string) {
	payload, _ := json.Marshal(map[string]string{"message": msg})
	errMsg := Message{
		Type:    "error",
		Payload: json.RawMessage(payload),
	}
	data, _ := json.Marshal(errMsg)
	select {
	case c.Send <- data:
	default:
	}
}

// closeSend closes the Client.Send channel exactly once, preventing double-close panics.
// Use this instead of close(c.Send) everywhere.
func (c *Client) closeSend() {
	c.closeOnce.Do(func() { close(c.Send) })
}

// ─── Room ────────────────────────────────────────────────────────────────────

type Room struct {
	ID      string
	Clients map[*Client]bool
	mu      sync.RWMutex
}

func NewRoom(id string) *Room {
	return &Room{
		ID:      id,
		Clients: make(map[*Client]bool),
	}
}

func (r *Room) AddClient(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Clients[c] = true
}

func (r *Room) RemoveClient(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Clients, c)
}

func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Clients) == 0
}

// Broadcast sends data to every client in the room except `exclude`.
//
// The hot path takes only a read lock while iterating clients — a write lock
// is only taken after the loop, and only if buffer-full evictions are needed.
// Without this split a 50-client room would serialise every broadcast.
func (r *Room) Broadcast(data []byte, exclude *Client) {
	r.mu.RLock()
	var toClose []*Client
	for client := range r.Clients {
		if client == exclude {
			continue
		}
		select {
		case client.Send <- data:
		default:
			// Buffer full — close send channel and queue for eviction.
			client.closeSend()
			toClose = append(toClose, client)
		}
	}
	r.mu.RUnlock()

	if len(toClose) == 0 {
		return
	}
	r.mu.Lock()
	for _, client := range toClose {
		delete(r.Clients, client)
	}
	r.mu.Unlock()
}

func (r *Room) OnlineUsers() []SenderInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	// Deduplicate by userID (same user may have multiple tabs)
	seen := make(map[string]bool)
	var users []SenderInfo
	for client := range r.Clients {
		if !seen[client.UserID] {
			seen[client.UserID] = true
			users = append(users, SenderInfo{
				UserID:   client.UserID,
				FullName: client.FullName,
			})
		}
	}
	return users
}

// ─── Hub ─────────────────────────────────────────────────────────────────────

type Hub struct {
	Rooms       map[string]*Room
	Register    chan *Client
	Unregister  chan *Client
	mu          sync.RWMutex
	redisPubSub *RedisPubSub
	instanceID  string
	stop        chan struct{}

	// Track which rooms have Redis subscriptions
	subscribedRooms map[string]bool
	subscribeMu     sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		Rooms:           make(map[string]*Room),
		Register:        make(chan *Client),
		Unregister:      make(chan *Client),
		instanceID:      uuid.New().String(),
		stop:            make(chan struct{}),
		subscribedRooms: make(map[string]bool),
	}
}

// SetRedisPubSub sets the RedisPubSub instance for this hub
func (h *Hub) SetRedisPubSub(rps *RedisPubSub) {
	h.redisPubSub = rps
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.addClient(client)
		case client := <-h.Unregister:
			h.removeClient(client)
		case <-h.stop:
			return
		}
	}
}

// Stop signals the Hub.Run goroutine to exit.
func (h *Hub) Stop() {
	close(h.stop)
}

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	room, ok := h.Rooms[c.RoomID]
	if !ok {
		room = NewRoom(c.RoomID)
		h.Rooms[c.RoomID] = room
		// Subscribe to Redis channel for this room (cross-server messages)
		if h.redisPubSub != nil {
			h.redisPubSub.SubscribeRoom(h.redisPubSub.ctx, c.RoomID)
			h.subscribeMu.Lock()
			h.subscribedRooms[c.RoomID] = true
			h.subscribeMu.Unlock()
		}
	}
	// M5: AddClient inside hub lock — prevents room deletion race between Unlock and AddClient
	room.AddClient(c)
	h.mu.Unlock()

	// Track user online in Redis
	if h.redisPubSub != nil {
		h.redisPubSub.TrackOnline(h.redisPubSub.ctx, c.RoomID, c.UserID)
	}

	// Notify room: user joined. Payload mirrors the FE's WSEvent shape so
	// frontend/app/itinerary/[id]/edit/_hooks/use-editor-state.ts handles it
	// directly (it switches on type === "presence.join").
	joinPayload, _ := json.Marshal(map[string]string{
		"user_id":   c.UserID,
		"full_name": c.FullName,
	})
	joinMsg := Message{
		Type:    EventPresenceJoin,
		Payload: joinPayload,
		Sender:  &SenderInfo{UserID: c.UserID, FullName: c.FullName},
	}
	data, _ := json.Marshal(joinMsg)
	room.Broadcast(data, c)

	// Also publish to Redis for cross-server
	if h.redisPubSub != nil {
		h.redisPubSub.Publish(h.redisPubSub.ctx, c.RoomID, data)
	}

	// Send the current roster to the new joiner. presence.online is the
	// initial snapshot; subsequent join/leave events keep it in sync.
	users := room.OnlineUsers()
	usersData, _ := json.Marshal(users)
	onlineData, _ := json.Marshal(Message{
		Type:    EventPresenceOnline,
		Payload: usersData,
	})
	select {
	case c.Send <- onlineData:
	default:
	}

	slog.Info("ws client joined", "user_id", c.UserID, "name", c.FullName, "room", c.RoomID)
}

func (h *Hub) removeClient(c *Client) {
	h.mu.RLock()
	room, ok := h.Rooms[c.RoomID]
	h.mu.RUnlock()
	if !ok {
		return
	}

	room.RemoveClient(c)
	c.closeSend()

	// Track user offline in Redis
	if h.redisPubSub != nil {
		h.redisPubSub.TrackOffline(h.redisPubSub.ctx, c.RoomID, c.UserID)
	}

	// Notify room: user left
	leavePayload, _ := json.Marshal(map[string]string{"user_id": c.UserID})
	leaveMsg := Message{
		Type:    EventPresenceLeave,
		Payload: leavePayload,
		Sender:  &SenderInfo{UserID: c.UserID, FullName: c.FullName},
	}
	data, _ := json.Marshal(leaveMsg)
	room.Broadcast(data, nil)

	// Also publish to Redis for cross-server
	if h.redisPubSub != nil {
		h.redisPubSub.Publish(h.redisPubSub.ctx, c.RoomID, data)
	}

	// Cleanup empty rooms
	if room.IsEmpty() {
		h.mu.Lock()
		delete(h.Rooms, c.RoomID)
		h.mu.Unlock()

		// Cancel per-room Redis subscription
		if h.redisPubSub != nil {
			h.redisPubSub.UnsubscribeRoom(c.RoomID)
		}
		h.subscribeMu.Lock()
		delete(h.subscribedRooms, c.RoomID)
		h.subscribeMu.Unlock()
	}

	slog.Info("ws client left", "user_id", c.UserID, "name", c.FullName, "room", c.RoomID)
}

func (h *Hub) BroadcastToRoom(roomID string, data []byte, exclude *Client) {
	h.mu.RLock()
	room, ok := h.Rooms[roomID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	room.Broadcast(data, exclude)
}

func (h *Hub) GetRoom(roomID string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.Rooms[roomID]
}
