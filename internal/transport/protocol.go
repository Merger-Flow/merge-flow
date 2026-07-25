package transport

import "encoding/json"

type Message struct {
	Type    string          `json:"type"`
	DocID   string          `json:"docId,omitempty"`
	UserID  string          `json:"userId,omitempty"`
	Name    string          `json:"name,omitempty"`
	Text    string          `json:"text,omitempty"`
	Users   []Presence      `json:"users,omitempty"`
	PayLoad json.RawMessage `json:"payLoad,omitempty"`
	Cursor  *Cursor         `json:"cursor,omitempty"`
}

type Cursor struct {
	Offset          int `json:"offset"`
	SelectionLength int `json:"selectionLength"`
}

type Presence struct {
	UserID string  `json:"userId"`
	Name   string  `json:"name"`
	Cursor *Cursor `json:"cursor,omitempty"`
}
