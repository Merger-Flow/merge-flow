package transport

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	maxMessage = 1 << 20
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(*http.Request) bool { return true },
}

type hub struct {
	mu    sync.Mutex
	rooms map[string]*room
}

type room struct {
	mu      sync.Mutex
	text    []rune
	clients map[*client]struct{}
	seenOps map[string]struct{}
}

type client struct {
	conn   *websocket.Conn
	send   chan []byte
	room   *room
	userID string
	name   string
	cursor *Cursor
}

var documents = &hub{rooms: make(map[string]*room)}

func WSHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{conn: conn, send: make(chan []byte, 32)}
	go c.writePump()
	c.readPump()
}

func (c *client) readPump() {
	defer func() {
		if c.room != nil {
			removeClient(c)
		}
		close(c.send)
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessage)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var message Message
		if err := json.Unmarshal(data, &message); err != nil {
			sendError(c, "invalid message")
			continue
		}
		switch message.Type {
		case "join":
			c.join(message)
		case "op":
			c.applyOp(message.Payload)
		case "cursor":
			c.updateCursor(message.Cursor)
		default:
			sendError(c, "unknown message type")
		}
	}
}

func (c *client) join(message Message) {
	if c.room != nil || message.DocID == "" || message.UserID == "" {
		sendError(c, "join requires a document and user id")
		return
	}
	documents.mu.Lock()
	r := documents.rooms[message.DocID]
	if r == nil {
		r = &room{clients: make(map[*client]struct{}), seenOps: make(map[string]struct{})}
		documents.rooms[message.DocID] = r
	}
	documents.mu.Unlock()
	c.room, c.userID, c.name = r, message.UserID, message.Name
	r.mu.Lock()
	r.clients[c] = struct{}{}
	presence := r.presenceLocked()
	snapshot := Message{Type: "snapshot", DocID: message.DocID, Text: string(r.text), Users: presence}
	r.mu.Unlock()
	c.sendJSON(snapshot)
	r.broadcastExcept(c, Message{Type: "presence", Users: []Presence{{UserID: c.userID, Name: c.name}}})
}

func (c *client) applyOp(raw json.RawMessage) {
	if c.room == nil || len(raw) == 0 {
		return
	}
	var op struct {
		Type     string `json:"type"`
		Position int    `json:"position"`
		Length   int    `json:"length"`
		Text     string `json:"text"`
		OpID     string `json:"opId"`
		Actor    string `json:"actor"`
	}
	if err := json.Unmarshal(raw, &op); err != nil || op.OpID == "" || op.Actor != c.userID {
		sendError(c, "invalid operation")
		return
	}
	c.room.mu.Lock()
	if _, exists := c.room.seenOps[op.OpID]; exists {
		c.room.mu.Unlock()
		return
	}
	op.Position = max(0, min(op.Position, len(c.room.text)))
	switch op.Type {
	case "insert":
		c.room.text = insertAt(c.room.text, op.Position, []rune(op.Text))
	case "delete":
		op.Length = max(0, min(op.Length, len(c.room.text)-op.Position))
		c.room.text = append(c.room.text[:op.Position], c.room.text[op.Position+op.Length:]...)
	default:
		c.room.mu.Unlock()
		sendError(c, "unsupported operation")
		return
	}
	c.room.seenOps[op.OpID] = struct{}{}
	c.room.mu.Unlock()
	c.room.broadcast(Message{Type: "op", Payload: raw})
}

func (c *client) updateCursor(cursor *Cursor) {
	if c.room == nil || cursor == nil {
		return
	}
	c.room.mu.Lock()
	c.cursor = cursor
	c.room.mu.Unlock()
	c.room.broadcastExcept(c, Message{Type: "cursor", Users: []Presence{{UserID: c.userID, Name: c.name, Cursor: cursor}}})
}

func removeClient(c *client) {
	c.room.mu.Lock()
	delete(c.room.clients, c)
	c.room.mu.Unlock()
	c.room.broadcast(Message{Type: "leave", Users: []Presence{{UserID: c.userID}}})
}

func (r *room) presenceLocked() []Presence {
	users := make([]Presence, 0, len(r.clients))
	for c := range r.clients {
		users = append(users, Presence{UserID: c.userID, Name: c.name, Cursor: c.cursor})
	}
	return users
}

func (r *room) broadcast(message Message) { r.broadcastExcept(nil, message) }

func (r *room) broadcastExcept(skip *client, message Message) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("marshal websocket message: %v", err)
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for c := range r.clients {
		if c != skip {
			select {
			case c.send <- data:
			default:
				log.Printf("dropping slow websocket client %s", c.userID)
			}
		}
	}
}

func (c *client) sendJSON(message Message) {
	data, err := json.Marshal(message)
	if err == nil {
		c.send <- data
	}
}

func sendError(c *client, text string) { c.sendJSON(Message{Type: "error", Text: text}) }

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	for {
		select {
		case data, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// insertAt returns text with value inserted at position (rune offset).
// Caller is responsible for clamping position to [0, len(text)].
func insertAt(text []rune, position int, value []rune) []rune {
	result := make([]rune, 0, len(text)+len(value))
	result = append(result, text[:position]...)
	result = append(result, value...)
	return append(result, text[position:]...)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
