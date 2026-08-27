// Package session provides the single-writer document owners used by the
// collaboration backend. One Owner serializes all state changes for one
// document and publishes the resulting events to connected gateways.
package session

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/nowinav/merge-flow/internal/crdt"
)

var ErrOwnerClosed = errors.New("session owner is closed")

type EventType string

const (
	SnapshotEvent  EventType = "snapshot"
	OperationEvent EventType = "op"
	PresenceEvent  EventType = "presence"
	LeaveEvent     EventType = "leave"
)

// Event is emitted after a successful state change. Gateways translate it to
// their wire protocol; session code never depends on WebSocket types.
type Event struct {
	Type       EventType       `json:"type"`
	DocumentID string          `json:"docId"`
	Operation  *crdt.Operation `json:"operation,omitempty"`
	Snapshot   *Snapshot       `json:"snapshot,omitempty"`
	Users      []Presence      `json:"users,omitempty"`
}

// Subscriber must return promptly. A production gateway should enqueue the
// event to its client write loop rather than write to a socket directly.
type Subscriber func(Event)

type Snapshot struct {
	Document crdt.Snapshot `json:"document"`
	Users    []Presence    `json:"users"`
}

// Owner is an actor: its loop is the only writer of its document and presence
// state. Its public methods submit commands to that loop and wait for a result.
type Owner struct {
	documentID string
	document   *crdt.Document

	commands  chan any
	stop      chan struct{}
	done      chan struct{}
	closeOnce sync.Once
}

func NewOwner(documentID, actorID string) (*Owner, error) {
	if documentID == "" {
		return nil, fmt.Errorf("document ID is required")
	}
	document, err := crdt.NewDocument(actorID)
	if err != nil {
		return nil, err
	}
	owner := &Owner{
		documentID: documentID,
		document:   document,
		commands:   make(chan any),
		stop:       make(chan struct{}),
		done:       make(chan struct{}),
	}
	go owner.run()
	return owner, nil
}

func (o *Owner) DocumentID() string { return o.documentID }

func (o *Owner) Apply(ctx context.Context, operation crdt.Operation) (bool, error) {
	response := make(chan applyResult, 1)
	if err := o.send(ctx, applyCommand{operation: operation, response: response}); err != nil {
		return false, err
	}
	select {
	case result := <-response:
		return result.applied, result.err
	case <-ctx.Done():
		return false, ctx.Err()
	case <-o.done:
		return false, ErrOwnerClosed
	}
}

// Subscribe registers a gateway subscriber and immediately sends it a complete
// document/presence snapshot. The returned function is safe to call repeatedly.
func (o *Owner) Subscribe(ctx context.Context, subscriber Subscriber) (func(), error) {
	if subscriber == nil {
		return nil, fmt.Errorf("subscriber is required")
	}
	response := make(chan subscribeResult, 1)
	if err := o.send(ctx, subscribeCommand{subscriber: subscriber, response: response}); err != nil {
		return nil, err
	}
	select {
	case result := <-response:
		if result.err != nil {
			return nil, result.err
		}
		var once sync.Once
		return func() { once.Do(func() { o.unsubscribe(result.id) }) }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-o.done:
		return nil, ErrOwnerClosed
	}
}

func (o *Owner) UpsertPresence(ctx context.Context, user Presence) error {
	return o.request(ctx, presenceCommand{user: user, leave: false, response: make(chan error, 1)})
}

func (o *Owner) RemovePresence(ctx context.Context, userID string) error {
	return o.request(ctx, presenceCommand{user: Presence{UserID: userID}, leave: true, response: make(chan error, 1)})
}

func (o *Owner) Snapshot(ctx context.Context) (Snapshot, error) {
	response := make(chan snapshotResult, 1)
	if err := o.send(ctx, snapshotCommand{response: response}); err != nil {
		return Snapshot{}, err
	}
	select {
	case result := <-response:
		return result.snapshot, result.err
	case <-ctx.Done():
		return Snapshot{}, ctx.Err()
	case <-o.done:
		return Snapshot{}, ErrOwnerClosed
	}
}

func (o *Owner) Close() {
	o.closeOnce.Do(func() {
		close(o.stop)
		<-o.done
	})
}

type applyCommand struct {
	operation crdt.Operation
	response  chan applyResult
}
type applyResult struct {
	applied bool
	err     error
}
type subscribeCommand struct {
	subscriber Subscriber
	response   chan subscribeResult
}
type subscribeResult struct {
	id  uint64
	err error
}
type unsubscribeCommand struct{ id uint64 }
type presenceCommand struct {
	user     Presence
	leave    bool
	response chan error
}
type snapshotCommand struct{ response chan snapshotResult }
type snapshotResult struct {
	snapshot Snapshot
	err      error
}

func (o *Owner) run() {
	defer close(o.done)
	presence := newPresenceBook()
	subscribers := make(map[uint64]Subscriber)
	var nextSubscriberID uint64
	publish := func(event Event) {
		for _, subscriber := range subscribers {
			subscriber(event)
		}
	}
	for {
		select {
		case <-o.stop:
			return
		case raw := <-o.commands:
			switch command := raw.(type) {
			case applyCommand:
				applied, err := o.document.Apply(command.operation)
				command.response <- applyResult{applied: applied, err: err}
				if err == nil && applied {
					op := command.operation
					publish(Event{Type: OperationEvent, DocumentID: o.documentID, Operation: &op})
				}
			case subscribeCommand:
				nextSubscriberID++
				subscribers[nextSubscriberID] = command.subscriber
				snapshot := Snapshot{Document: o.document.Snapshot(), Users: presence.list()}
				command.subscriber(Event{Type: SnapshotEvent, DocumentID: o.documentID, Snapshot: &snapshot})
				command.response <- subscribeResult{id: nextSubscriberID}
			case unsubscribeCommand:
				delete(subscribers, command.id)
			case presenceCommand:
				if command.user.UserID == "" {
					command.response <- fmt.Errorf("user ID is required")
					continue
				}
				if command.leave {
					presence.remove(command.user.UserID)
					publish(Event{Type: LeaveEvent, DocumentID: o.documentID, Users: []Presence{{UserID: command.user.UserID}}})
				} else {
					presence.upsert(command.user)
					publish(Event{Type: PresenceEvent, DocumentID: o.documentID, Users: []Presence{command.user}})
				}
				command.response <- nil
			case snapshotCommand:
				command.response <- snapshotResult{snapshot: Snapshot{Document: o.document.Snapshot(), Users: presence.list()}}
			}
		}
	}
}

func (o *Owner) request(ctx context.Context, command presenceCommand) error {
	if err := o.send(ctx, command); err != nil {
		return err
	}
	select {
	case err := <-command.response:
		return err
	case <-ctx.Done():
		return ctx.Err()
	case <-o.done:
		return ErrOwnerClosed
	}
}

func (o *Owner) unsubscribe(id uint64) {
	select {
	case <-o.done:
		return
	case o.commands <- unsubscribeCommand{id: id}:
	}
}

func (o *Owner) send(ctx context.Context, command any) error {
	select {
	case <-o.done:
		return ErrOwnerClosed
	case <-ctx.Done():
		return ctx.Err()
	case o.commands <- command:
		return nil
	}
}
