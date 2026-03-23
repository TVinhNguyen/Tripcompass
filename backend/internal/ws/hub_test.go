package ws

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Room ────────────────────────────────────────────────────────────────────

func TestNewRoom(t *testing.T) {
	r := NewRoom("room-1")
	assert.Equal(t, "room-1", r.ID)
	assert.NotNil(t, r.Clients)
	assert.Len(t, r.Clients, 0)
}

func TestRoom_AddClient(t *testing.T) {
	r := NewRoom("room-1")
	hub := NewHub()
	c := NewClient(hub, nil, "room-1", "user-1", "User One")

	r.AddClient(c)
	assert.Len(t, r.Clients, 1)
	assert.True(t, r.Clients[c])
}

func TestRoom_RemoveClient(t *testing.T) {
	r := NewRoom("room-1")
	hub := NewHub()
	c := NewClient(hub, nil, "room-1", "user-1", "User One")

	r.AddClient(c)
	r.RemoveClient(c)
	assert.Len(t, r.Clients, 0)
}

func TestRoom_RemoveClient_NotInRoom(t *testing.T) {
	r := NewRoom("room-1")
	hub := NewHub()
	c := NewClient(hub, nil, "room-1", "user-1", "User One")

	// Should not panic
	r.RemoveClient(c)
	assert.Len(t, r.Clients, 0)
}

func TestRoom_IsEmpty(t *testing.T) {
	r := NewRoom("room-1")
	assert.True(t, r.IsEmpty())

	hub := NewHub()
	c := NewClient(hub, nil, "room-1", "user-1", "User One")
	r.AddClient(c)
	assert.False(t, r.IsEmpty())

	r.RemoveClient(c)
	assert.True(t, r.IsEmpty())
}

func TestRoom_Broadcast(t *testing.T) {
	r := NewRoom("room-1")
	hub := NewHub()

	c1 := NewClient(hub, nil, "room-1", "user-1", "User One")
	c2 := NewClient(hub, nil, "room-1", "user-2", "User Two")
	c3 := NewClient(hub, nil, "room-1", "user-3", "User Three")

	r.AddClient(c1)
	r.AddClient(c2)
	r.AddClient(c3)

	msg := []byte(`{"type":"message","payload":"hello"}`)

	// Broadcast excluding c1
	r.Broadcast(msg, c1)

	// c2 and c3 should receive the message
	got2 := <-c2.Send
	assert.Equal(t, msg, got2)
	got3 := <-c3.Send
	assert.Equal(t, msg, got3)

	// c1 should NOT receive anything (non-blocking check)
	select {
	case <-c1.Send:
		t.Fatal("excluded client should not receive broadcast")
	default:
		// expected
	}
}

func TestRoom_Broadcast_BufferFull(t *testing.T) {
	r := NewRoom("room-1")
	hub := NewHub()

	// Create client with a channel that's already full
	c := &Client{
		ID:       "client-1",
		UserID:   "user-1",
		FullName: "User One",
		RoomID:   "room-1",
		Hub:      hub,
		Send:     make(chan []byte, 1),
	}
	// Fill the buffer
	c.Send <- []byte("fill")

	r.AddClient(c)
	assert.Len(t, r.Clients, 1)

	// Broadcast should trigger buffer overflow → client removed
	r.Broadcast([]byte("new message"), nil)

	assert.Len(t, r.Clients, 0)
}

func TestRoom_BroadcastToEmptyRoom(t *testing.T) {
	r := NewRoom("room-1")
	// Should not panic
	r.Broadcast([]byte("hello"), nil)
}

func TestRoom_OnlineUsers(t *testing.T) {
	r := NewRoom("room-1")
	hub := NewHub()

	c1 := NewClient(hub, nil, "room-1", "user-1", "User One")
	c2 := NewClient(hub, nil, "room-1", "user-2", "User Two")

	r.AddClient(c1)
	r.AddClient(c2)

	users := r.OnlineUsers()
	assert.Len(t, users, 2)

	userIDs := make(map[string]bool)
	for _, u := range users {
		userIDs[u.UserID] = true
	}
	assert.True(t, userIDs["user-1"])
	assert.True(t, userIDs["user-2"])
}

func TestRoom_OnlineUsers_Dedup(t *testing.T) {
	r := NewRoom("room-1")
	hub := NewHub()

	// Same user with two connections (multiple tabs)
	c1 := NewClient(hub, nil, "room-1", "user-1", "User One")
	c2 := NewClient(hub, nil, "room-1", "user-1", "User One")

	r.AddClient(c1)
	r.AddClient(c2)

	users := r.OnlineUsers()
	assert.Len(t, users, 1)
	assert.Equal(t, "user-1", users[0].UserID)
}

// ─── Hub ─────────────────────────────────────────────────────────────────────

func TestNewHub(t *testing.T) {
	h := NewHub()
	assert.NotNil(t, h.Rooms)
	assert.NotNil(t, h.Register)
	assert.NotNil(t, h.Unregister)
	assert.NotNil(t, h.subscribedRooms)
	assert.Len(t, h.Rooms, 0)
}

func TestHub_GetRoom(t *testing.T) {
	h := NewHub()

	t.Run("non-existent room", func(t *testing.T) {
		r := h.GetRoom("nonexistent")
		assert.Nil(t, r)
	})

	t.Run("existing room", func(t *testing.T) {
		h.Rooms["room-1"] = NewRoom("room-1")
		r := h.GetRoom("room-1")
		require.NotNil(t, r)
		assert.Equal(t, "room-1", r.ID)
	})
}

func TestHub_BroadcastToRoom(t *testing.T) {
	h := NewHub()

	t.Run("non-existent room", func(t *testing.T) {
		// Should not panic
		h.BroadcastToRoom("nonexistent", []byte("hello"), nil)
	})

	t.Run("existing room", func(t *testing.T) {
		room := NewRoom("room-1")
		h.Rooms["room-1"] = room

		c1 := NewClient(h, nil, "room-1", "user-1", "User One")
		c2 := NewClient(h, nil, "room-1", "user-2", "User Two")
		room.AddClient(c1)
		room.AddClient(c2)

		msg := []byte("broadcast test")
		h.BroadcastToRoom("room-1", msg, c1)

		// c2 should receive
		got := <-c2.Send
		assert.Equal(t, msg, got)

		// c1 should not (excluded)
		select {
		case <-c1.Send:
			t.Fatal("excluded client should not receive")
		default:
		}
	})
}

func TestHub_AddClient_CreatesRoom(t *testing.T) {
	h := NewHub()
	c := NewClient(h, nil, "new-room", "user-1", "User One")

	h.addClient(c)

	room := h.GetRoom("new-room")
	require.NotNil(t, room)
	assert.Len(t, room.Clients, 1)
}

func TestHub_RemoveClient_CleansEmptyRoom(t *testing.T) {
	h := NewHub()
	c := NewClient(h, nil, "temp-room", "user-1", "User One")

	h.addClient(c)
	assert.NotNil(t, h.GetRoom("temp-room"))

	h.removeClient(c)
	assert.Nil(t, h.GetRoom("temp-room"))
}

func TestHub_RemoveClient_NonEmptyRoom(t *testing.T) {
	h := NewHub()
	c1 := NewClient(h, nil, "shared-room", "user-1", "User One")
	c2 := NewClient(h, nil, "shared-room", "user-2", "User Two")

	h.addClient(c1)
	h.addClient(c2)
	assert.NotNil(t, h.GetRoom("shared-room"))

	h.removeClient(c1)
	// Room should still exist with c2
	room := h.GetRoom("shared-room")
	assert.NotNil(t, room)
	assert.Len(t, room.Clients, 1)
}

func TestHub_RemoveClient_NonExistentRoom(t *testing.T) {
	h := NewHub()
	c := NewClient(h, nil, "ghost-room", "user-1", "User One")

	// Should not panic
	h.removeClient(c)
}

// ─── Client ──────────────────────────────────────────────────────────────────

func TestNewClient(t *testing.T) {
	hub := NewHub()
	c := NewClient(hub, nil, "room-1", "user-1", "User One")

	assert.NotEmpty(t, c.ID)
	assert.Equal(t, "user-1", c.UserID)
	assert.Equal(t, "User One", c.FullName)
	assert.Equal(t, "room-1", c.RoomID)
	assert.Equal(t, hub, c.Hub)
	assert.NotNil(t, c.Send)
	assert.Equal(t, 256, cap(c.Send))
}

func TestSafeClose(t *testing.T) {
	t.Run("normal close", func(t *testing.T) {
		ch := make(chan []byte, 1)
		// Should not panic
		safeClose(ch)
	})

	t.Run("double close does not panic", func(t *testing.T) {
		ch := make(chan []byte, 1)
		safeClose(ch)
		// Second close should not panic due to recover
		safeClose(ch)
	})
}
