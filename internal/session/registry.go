package session

import (
	"fmt"
	"sync"
)

// Registry tracks the session owners hosted by this process. In a distributed
// deployment, routing/ownership can be backed by Redis while each node keeps
// this local registry for owners assigned to it.
type Registry struct {
	mu      sync.Mutex
	actorID func(documentID string) string
	owners  map[string]*Owner
	closed  bool
}

func NewRegistry(actorID func(documentID string) string) *Registry {
	if actorID == nil {
		actorID = func(documentID string) string { return "session:" + documentID }
	}
	return &Registry{actorID: actorID, owners: make(map[string]*Owner)}
}

func (r *Registry) GetOrCreate(documentID string) (*Owner, error) {
	if documentID == "" {
		return nil, fmt.Errorf("document ID is required")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return nil, ErrOwnerClosed
	}
	if owner := r.owners[documentID]; owner != nil {
		return owner, nil
	}
	owner, err := NewOwner(documentID, r.actorID(documentID))
	if err != nil {
		return nil, err
	}
	r.owners[documentID] = owner
	return owner, nil
}

func (r *Registry) Close() {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.closed = true
	owners := make([]*Owner, 0, len(r.owners))
	for _, owner := range r.owners {
		owners = append(owners, owner)
	}
	r.owners = make(map[string]*Owner)
	r.mu.Unlock()
	for _, owner := range owners {
		owner.Close()
	}
}
