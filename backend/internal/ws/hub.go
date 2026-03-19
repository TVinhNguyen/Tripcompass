package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ─── Message protocol ─────────────────────────────────────────────────────────

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Sender  *SenderInfo     `json:"sender,omitempty"`
}

type SenderInfo struct {
	UserID   string `json:"user_id"`
	FullName string `json:"full_name"`
}

// ─── Client ───────────────────────────────────────────────────────────────────

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 8192
)

type Client struct {
	ID       string
	UserID   string
	FullName string
	RoomID   string
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
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
				log.Printf("[WS] Read error client=%s: %v", c.UserID, err)
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
			c.Hub.redisPubSub.Publish(context.TODO(), c.RoomID, data)
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

// safeClose closes a channel without panicking if already closed
func safeClose(ch chan []byte) {
	defer func() { recover() }()
	close(ch)
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

// Broadcast sends data to all clients except exclude client
func (r *Room) Broadcast(data []byte, exclude *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var toClose []*Client

	for client := range r.Clients {
		if client == exclude {
			continue
		}
		select {
		case client.Send <- data:
		default:
			// Buffer full, mark for closure
			safeClose(client.Send)
			toClose = append(toClose, client)
		}
	}

	// Remove closed clients after iteration
	for _, client := range toClose {
		delete(r.Clients, client)
	}
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

	// Track which rooms have Redis subscriptions
	subscribedRooms map[string]bool
	subscribeMu     sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		Rooms:           make(map[string]*Room),
		Register:        make(chan *Client),
		Unregister:      make(chan *Client),
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
		}
	}
}

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	room, ok := h.Rooms[c.RoomID]
	if !ok {
		room = NewRoom(c.RoomID)
		h.Rooms[c.RoomID] = room
		// Subscribe to Redis channel for this room (cross-server messages)
		if h.redisPubSub != nil {
			h.redisPubSub.SubscribeRoom(context.TODO(), c.RoomID)
			h.subscribeMu.Lock()
			h.subscribedRooms[c.RoomID] = true
			h.subscribeMu.Unlock()
		}
	}
	h.mu.Unlock()

	room.AddClient(c)

	// Track user online in Redis
	if h.redisPubSub != nil {
		h.redisPubSub.TrackOnline(context.TODO(), c.RoomID, c.UserID)
	}

	// Notify room: user joined
	joinMsg := Message{
		Type: "user_joined",
		Sender: &SenderInfo{
			UserID:   c.UserID,
			FullName: c.FullName,
		},
	}
	data, _ := json.Marshal(joinMsg)
	room.Broadcast(data, c)

	// Also publish to Redis for cross-server
	if h.redisPubSub != nil {
		h.redisPubSub.Publish(context.TODO(), c.RoomID, data)
	}

	// Send online users list to the new client
	onlineMsg := Message{
		Type: "online_users",
	}
	users := room.OnlineUsers()
	usersData, _ := json.Marshal(users)
	onlineMsg.Payload = usersData
	onlineData, _ := json.Marshal(onlineMsg)
	select {
	case c.Send <- onlineData:
	default:
	}

	log.Printf("[WS] User %s (%s) joined room %s", c.UserID, c.FullName, c.RoomID)
}

func (h *Hub) removeClient(c *Client) {
	h.mu.RLock()
	room, ok := h.Rooms[c.RoomID]
	h.mu.RUnlock()
	if !ok {
		return
	}

	room.RemoveClient(c)
	safeClose(c.Send)

	// Track user offline in Redis
	if h.redisPubSub != nil {
		h.redisPubSub.TrackOffline(context.TODO(), c.RoomID, c.UserID)
	}

	// Notify room: user left
	leaveMsg := Message{
		Type: "user_left",
		Sender: &SenderInfo{
			UserID:   c.UserID,
			FullName: c.FullName,
		},
	}
	data, _ := json.Marshal(leaveMsg)
	room.Broadcast(data, nil)

	// Also publish to Redis for cross-server
	if h.redisPubSub != nil {
		h.redisPubSub.Publish(context.TODO(), c.RoomID, data)
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

	log.Printf("[WS] User %s (%s) left room %s", c.UserID, c.FullName, c.RoomID)
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
