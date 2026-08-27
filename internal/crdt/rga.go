package crdt

import (
	"fmt"
	"sort"
)

// RGA is a Replicated Growable Array. Elements are inserted after a stable
// element ID rather than at a mutable character offset. Concurrent inserts at
// the same position are ordered by ID, so all replicas converge.
type RGA struct {
	elements       map[ID]element
	children       map[ID][]ID
	pendingInserts map[ID][]Operation
	pendingDeletes map[ID]struct{}
}

type element struct {
	After     ID
	Value     rune
	Tombstone bool
}

func NewRGA() *RGA {
	return &RGA{
		elements:       make(map[ID]element),
		children:       make(map[ID][]ID),
		pendingInserts: make(map[ID][]Operation),
		pendingDeletes: make(map[ID]struct{}),
	}
}

// Apply applies an operation exactly once. It returns false only when the
// operation was already known. Inserts whose predecessor has not arrived are
// buffered and become visible once the dependency is applied.
func (r *RGA) Apply(op Operation) (bool, error) {
	if err := op.Validate(); err != nil {
		return false, err
	}
	switch op.Type {
	case Insert:
		return r.applyInsert(op)
	case Delete:
		return r.applyDelete(op), nil
	default:
		return false, fmt.Errorf("unknown operation type %q", op.Type)
	}
}

func (r *RGA) applyInsert(op Operation) (bool, error) {
	if _, exists := r.elements[op.ID]; exists {
		return false, nil
	}
	if !op.After.IsZero() {
		if _, parentExists := r.elements[op.After]; !parentExists {
			r.pendingInserts[op.After] = append(r.pendingInserts[op.After], op)
			return true, nil
		}
	}

	runes := []rune(op.Value)
	r.elements[op.ID] = element{After: op.After, Value: runes[0]}
	r.children[op.After] = append(r.children[op.After], op.ID)
	sort.Slice(r.children[op.After], func(i, j int) bool {
		return r.children[op.After][i].Compare(r.children[op.After][j]) < 0
	})
	if _, deleted := r.pendingDeletes[op.ID]; deleted {
		entry := r.elements[op.ID]
		entry.Tombstone = true
		r.elements[op.ID] = entry
		delete(r.pendingDeletes, op.ID)
	}

	for _, child := range r.pendingInserts[op.ID] {
		if _, err := r.applyInsert(child); err != nil {
			return false, err
		}
	}
	delete(r.pendingInserts, op.ID)
	return true, nil
}

func (r *RGA) applyDelete(op Operation) bool {
	changed := false
	for _, target := range op.Targets {
		entry, exists := r.elements[target]
		if !exists {
			if _, pending := r.pendingDeletes[target]; !pending {
				r.pendingDeletes[target] = struct{}{}
				changed = true
			}
			continue
		}
		if !entry.Tombstone {
			entry.Tombstone = true
			r.elements[target] = entry
			changed = true
		}
	}
	return changed
}

func (r *RGA) String() string {
	value := make([]rune, 0, len(r.elements))
	var visit func(ID)
	visit = func(parent ID) {
		for _, child := range r.children[parent] {
			entry := r.elements[child]
			if !entry.Tombstone {
				value = append(value, entry.Value)
			}
			visit(child)
		}
	}
	visit(ID{})
	return string(value)
}

func (r *RGA) VisibleIDs() []ID {
	ids := make([]ID, 0, len(r.elements))
	var visit func(ID)
	visit = func(parent ID) {
		for _, child := range r.children[parent] {
			entry := r.elements[child]
			if !entry.Tombstone {
				ids = append(ids, child)
			}
			visit(child)
		}
	}
	visit(ID{})
	return ids
}

func (r *RGA) unresolvedInsertCount() int {
	count := 0
	for _, operations := range r.pendingInserts {
		count += len(operations)
	}
	return count
}
