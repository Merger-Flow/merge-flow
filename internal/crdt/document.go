package crdt

import (
	"fmt"
	"sort"
	"sync"
)

// Document owns one RGA replica and exposes convenient local editing methods.
// Session owners should serialize Apply calls through their actor loop; the
// mutex also makes snapshots and read APIs safe for observers.
type Document struct {
	mu      sync.RWMutex
	actorID string
	counter uint64
	rga     *RGA
}

func NewDocument(actorID string) (*Document, error) {
	if actorID == "" {
		return nil, fmt.Errorf("actor ID is required")
	}
	return &Document{actorID: actorID, rga: NewRGA()}, nil
}

func (d *Document) Text() string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.rga.String()
}

func (d *Document) Apply(op Operation) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if op.ID.Actor == d.actorID && op.ID.Counter > d.counter {
		d.counter = op.ID.Counter
	}
	return d.rga.Apply(op)
}

func (d *Document) InsertAt(position int, text string) ([]Operation, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	ids := d.rga.VisibleIDs()
	if position < 0 || position > len(ids) {
		return nil, fmt.Errorf("insert position %d outside document", position)
	}
	after := ID{}
	if position > 0 {
		after = ids[position-1]
	}
	ops := make([]Operation, 0, len([]rune(text)))
	for _, char := range []rune(text) {
		d.counter++
		op := Operation{Type: Insert, ID: ID{Actor: d.actorID, Counter: d.counter}, After: after, Value: string(char)}
		if _, err := d.rga.Apply(op); err != nil {
			return nil, err
		}
		ops = append(ops, op)
		after = op.ID
	}
	return ops, nil
}

func (d *Document) DeleteAt(position, length int) (Operation, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	ids := d.rga.VisibleIDs()
	if position < 0 || length < 0 || position+length > len(ids) {
		return Operation{}, fmt.Errorf("delete range [%d:%d] outside document", position, position+length)
	}
	d.counter++
	op := Operation{Type: Delete, ID: ID{Actor: d.actorID, Counter: d.counter}, Targets: append([]ID(nil), ids[position:position+length]...)}
	if len(op.Targets) == 0 {
		return Operation{}, fmt.Errorf("delete length must be positive")
	}
	_, err := d.rga.Apply(op)
	return op, err
}

type Snapshot struct {
	ActorID  string         `json:"actorId"`
	Counter  uint64         `json:"counter"`
	Elements []SnapshotNode `json:"elements"`
}

type SnapshotNode struct {
	ID        ID     `json:"id"`
	After     ID     `json:"after,omitempty"`
	Value     string `json:"value"`
	Tombstone bool   `json:"tombstone"`
}

func (d *Document) Snapshot() Snapshot {
	d.mu.RLock()
	defer d.mu.RUnlock()
	nodes := make([]SnapshotNode, 0, len(d.rga.elements))
	for id, entry := range d.rga.elements {
		nodes = append(nodes, SnapshotNode{ID: id, After: entry.After, Value: string(entry.Value), Tombstone: entry.Tombstone})
	}
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].ID.Compare(nodes[j].ID) < 0
	})
	return Snapshot{ActorID: d.actorID, Counter: d.counter, Elements: nodes}
}

// LoadSnapshot replaces the document state. Snapshot nodes may be in any
// order; RGA's pending-insert queue resolves their dependencies.
func (d *Document) LoadSnapshot(snapshot Snapshot) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if snapshot.ActorID == "" {
		return fmt.Errorf("snapshot actor ID is required")
	}
	next := NewRGA()
	for _, node := range snapshot.Elements {
		if _, err := next.Apply(Operation{Type: Insert, ID: node.ID, After: node.After, Value: node.Value}); err != nil {
			return fmt.Errorf("load snapshot insert %s: %w", node.ID, err)
		}
	}
	if unresolved := next.unresolvedInsertCount(); unresolved != 0 {
		return fmt.Errorf("snapshot contains %d elements with missing predecessors", unresolved)
	}
	for _, node := range snapshot.Elements {
		if node.Tombstone {
			_, _ = next.Apply(Operation{Type: Delete, ID: ID{Actor: "snapshot", Counter: node.ID.Counter}, Targets: []ID{node.ID}})
		}
	}
	d.actorID, d.counter, d.rga = snapshot.ActorID, snapshot.Counter, next
	return nil
}
