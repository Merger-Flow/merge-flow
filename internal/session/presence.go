package session

import "sort"

// Cursor is a document-relative collaborator cursor and selection.
type Cursor struct {
	Offset          int `json:"offset"`
	SelectionLength int `json:"selectionLength"`
}

// Presence identifies a connected collaborator and their latest cursor.
type Presence struct {
	UserID string  `json:"userId"`
	Name   string  `json:"name"`
	Cursor *Cursor `json:"cursor,omitempty"`
}

type presenceBook struct {
	users map[string]Presence
}

func newPresenceBook() *presenceBook {
	return &presenceBook{users: make(map[string]Presence)}
}

func (p *presenceBook) upsert(user Presence) {
	if user.UserID == "" {
		return
	}
	existing := p.users[user.UserID]
	if user.Name == "" {
		user.Name = existing.Name
	}
	if user.Cursor == nil {
		user.Cursor = existing.Cursor
	}
	p.users[user.UserID] = user
}

func (p *presenceBook) remove(userID string) {
	delete(p.users, userID)
}

func (p *presenceBook) list() []Presence {
	users := make([]Presence, 0, len(p.users))
	for _, user := range p.users {
		users = append(users, user)
	}
	sort.Slice(users, func(i, j int) bool { return users[i].UserID < users[j].UserID })
	return users
}
