import assert from "node:assert/strict";
import test from "node:test";

import { OutboundMessageQueue } from "./messageQueue.ts";

test("queues messages while disconnected and flushes them in order", () => {
    const queue = new OutboundMessageQueue();

    queue.enqueue("join");
    queue.enqueue("cursor");

    assert.deepEqual(queue.flush(), ["join", "cursor"]);
    assert.deepEqual(queue.flush(), []);
});

test("does not retain messages after a successful flush", () => {
    const queue = new OutboundMessageQueue();

    queue.enqueue("op");

    const firstFlush = queue.flush();
    firstFlush.push("mutated outside queue");

    assert.deepEqual(queue.flush(), []);
});
