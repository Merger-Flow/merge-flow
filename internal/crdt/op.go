// Package crdt implements the replicated document data structures used by Merge Flow session owners.
package crdt

import "fmt"

// ID uniquely identifies an element in a replicated document. Counters are
// monotonic per actor, which makes IDs deterministic and sortable.
type ID struct {
	Actor   string `json:"actor"`
	Counter uint64 `json:"counter"`
}

func (id ID) IsZero() bool { return id.Actor == "" && id.Counter == 0 }

func (id ID) String() string { return fmt.Sprintf("%s:%d", id.Actor, id.Counter) }

// Compare orders IDs consistently on every replica.
func (id ID) Compare(other ID) int {
	if id.Actor < other.Actor {
		return -1
	}
	if id.Actor > other.Actor {
		return 1
	}
	if id.Counter < other.Counter {
		return -1
	}
	if id.Counter > other.Counter {
		return 1
	}
	return 0
}

type OpType string

const (
	Insert OpType = "insert"
	Delete OpType = "delete"
)

// Operation is an idempotent CRDT mutation. Insert creates one rune after
// After; Delete tombstones all Targets. A delete can arrive before its insert
// and is retained until that element is known.
type Operation struct {
	Type    OpType `json:"type"`
	ID      ID     `json:"id"`
	After   ID     `json:"after,omitempty"`
	Value   string `json:"value,omitempty"`
	Targets []ID   `json:"targets,omitempty"`
}

func (op Operation) Validate() error {
	switch op.Type {
	case Insert:
		if op.ID.IsZero() || len([]rune(op.Value)) != 1 {
			return fmt.Errorf("insert requires an ID and exactly one rune")
		}
	case Delete:
		if op.ID.IsZero() || len(op.Targets) == 0 {
			return fmt.Errorf("delete requires an ID and at least one target")
		}
	default:
		return fmt.Errorf("unknown operation type %q", op.Type)
	}
	return nil
}
