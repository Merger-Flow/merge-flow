package crdt

import "testing"

func TestConcurrentInsertsConverge(t *testing.T) {
	left, _ := NewDocument("alice")
	right, _ := NewDocument("bob")
	a, _ := left.InsertAt(0, "A")
	b, _ := right.InsertAt(0, "B")

	for _, op := range append(b, a...) {
		if _, err := left.Apply(op); err != nil {
			t.Fatal(err)
		}
	}
	for _, op := range append(a, b...) {
		if _, err := right.Apply(op); err != nil {
			t.Fatal(err)
		}
	}
	if left.Text() != right.Text() || left.Text() != "AB" {
		t.Fatalf("replicas diverged: left=%q right=%q", left.Text(), right.Text())
	}
}

func TestOutOfOrderInsertAndDelete(t *testing.T) {
	doc, _ := NewDocument("receiver")
	first := Operation{Type: Insert, ID: ID{Actor: "alice", Counter: 1}, Value: "a"}
	second := Operation{Type: Insert, ID: ID{Actor: "alice", Counter: 2}, After: first.ID, Value: "b"}
	remove := Operation{Type: Delete, ID: ID{Actor: "bob", Counter: 1}, Targets: []ID{second.ID}}

	for _, op := range []Operation{remove, second, first} {
		if _, err := doc.Apply(op); err != nil {
			t.Fatal(err)
		}
	}
	if got := doc.Text(); got != "a" {
		t.Fatalf("got %q, want %q", got, "a")
	}
}

func TestSnapshotRoundTrip(t *testing.T) {
	source, _ := NewDocument("alice")
	if _, err := source.InsertAt(0, "hello"); err != nil {
		t.Fatal(err)
	}
	if _, err := source.DeleteAt(1, 2); err != nil {
		t.Fatal(err)
	}
	target, _ := NewDocument("bob")
	if err := target.LoadSnapshot(source.Snapshot()); err != nil {
		t.Fatal(err)
	}
	if got := target.Text(); got != "hlo" {
		t.Fatalf("got %q, want %q", got, "hlo")
	}
}
