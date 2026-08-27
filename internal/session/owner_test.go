package session

import (
	"context"
	"testing"

	"github.com/nowinav/merge-flow/internal/crdt"
)

func TestOwnerBroadcastsOperationAndPresence(t *testing.T) {
	owner, err := NewOwner("doc-1", "session-doc-1")
	if err != nil {
		t.Fatal(err)
	}
	defer owner.Close()

	events := make(chan Event, 4)
	unsubscribe, err := owner.Subscribe(context.Background(), func(event Event) { events <- event })
	if err != nil {
		t.Fatal(err)
	}
	defer unsubscribe()
	if event := <-events; event.Type != SnapshotEvent {
		t.Fatalf("got %q, want snapshot", event.Type)
	}

	if err := owner.UpsertPresence(context.Background(), Presence{UserID: "alice", Name: "Alice"}); err != nil {
		t.Fatal(err)
	}
	if event := <-events; event.Type != PresenceEvent || event.Users[0].UserID != "alice" {
		t.Fatalf("unexpected presence event: %#v", event)
	}

	op := crdt.Operation{Type: crdt.Insert, ID: crdt.ID{Actor: "alice", Counter: 1}, Value: "A"}
	applied, err := owner.Apply(context.Background(), op)
	if err != nil || !applied {
		t.Fatalf("apply = %v, %v", applied, err)
	}
	if event := <-events; event.Type != OperationEvent || event.Operation == nil || event.Operation.ID != op.ID {
		t.Fatalf("unexpected operation event: %#v", event)
	}

	snapshot, err := owner.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Users) != 1 || snapshot.Document.Elements[0].Value != "A" {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
}

func TestRegistryReturnsOneOwnerPerDocument(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Close()
	first, err := registry.GetOrCreate("doc-1")
	if err != nil {
		t.Fatal(err)
	}
	second, err := registry.GetOrCreate("doc-1")
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("same document received different owners")
	}
}
