import assert from "node:assert/strict";
import test from "node:test";

import { WsConnection, wsConnection } from "./connection.ts";

test.after(() => wsConnection.dispose());

class FakeSocket {
    readyState = 0;
    sent = [];
    listeners = new Map();

    addEventListener(type, listener) {
        const callbacks = this.listeners.get(type) ?? [];
        callbacks.push(listener);
        this.listeners.set(type, callbacks);
    }

    send(data) {
        this.sent.push(JSON.parse(data));
    }

    close() {
        this.readyState = 3;
    }

    emit(type, event = {}) {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }
}

function createConnection() {
    let socket;
    const connection = new WsConnection(
        {
            url: "ws://test",
            documentId: "doc-1",
            userId: "alice",
            userName: "Alice",
        },
        () => {
            socket = new FakeSocket();
            return socket;
        },
    );
    return { connection, getSocket: () => socket };
}

test("sends join before messages queued before the first connection", () => {
    const { connection, getSocket } = createConnection();

    connection.sendOp({
        type: "insert",
        position: 0,
        text: "A",
        opId: "op-1",
        actor: "alice",
    });
    getSocket().readyState = 1;
    getSocket().emit("open");

    assert.deepEqual(getSocket().sent, [
        { type: "join", docId: "doc-1", userId: "alice", name: "Alice" },
        {
            type: "op",
            payload: {
                type: "insert",
                position: 0,
                text: "A",
                opId: "op-1",
                actor: "alice",
            },
        },
    ]);
});

test("uses an updated join identity once when configured before connecting", () => {
    const { connection, getSocket } = createConnection();

    connection.join("doc-2", "bob", "Bob");
    getSocket().readyState = 1;
    getSocket().emit("open");

    assert.deepEqual(getSocket().sent, [
        { type: "join", docId: "doc-2", userId: "bob", name: "Bob" },
    ]);
});

test("rejoins before flushing messages collected during a disconnect", () => {
    const { connection, getSocket } = createConnection();
    const socket = getSocket();

    socket.readyState = 1;
    socket.emit("open");
    socket.sent.length = 0;
    socket.readyState = 0;
    connection.sendCursor({ offset: 4, selectionLength: 2 });
    socket.readyState = 1;
    socket.emit("open");

    assert.deepEqual(socket.sent, [
        { type: "join", docId: "doc-1", userId: "alice", name: "Alice" },
        { type: "cursor", cursor: { offset: 4, selectionLength: 2 } },
    ]);
});

test("unsubscribe removes an operation listener", () => {
    const { connection, getSocket } = createConnection();
    const received = [];
    const unsubscribe = connection.onOP((op) => received.push(op));

    getSocket().emit("message", {
        data: JSON.stringify({
            type: "op",
            payload: {
                type: "insert",
                position: 0,
                text: "A",
                opId: "op-1",
                actor: "bob",
            },
        }),
    });
    unsubscribe();
    getSocket().emit("message", {
        data: JSON.stringify({
            type: "op",
            payload: {
                type: "insert",
                position: 1,
                text: "B",
                opId: "op-2",
                actor: "bob",
            },
        }),
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].opId, "op-1");
});

test("dispatches snapshots and errors through dedicated listeners", () => {
    const { connection, getSocket } = createConnection();
    const snapshots = [];
    const errors = [];
    connection.onSnapshot((snapshot) => snapshots.push(snapshot));
    connection.onError((error) => errors.push(error));

    getSocket().emit("message", {
        data: JSON.stringify({
            type: "snapshot",
            docId: "doc-1",
            text: "hello",
            users: [{ userId: "alice", name: "Alice" }],
        }),
    });
    getSocket().emit("message", {
        data: JSON.stringify({ type: "error", text: "invalid operation" }),
    });

    assert.deepEqual(snapshots, [
        {
            type: "snapshot",
            docId: "doc-1",
            text: "hello",
            users: [{ userId: "alice", name: "Alice" }],
        },
    ]);
    assert.deepEqual(errors, [{ type: "error", text: "invalid operation" }]);
});
