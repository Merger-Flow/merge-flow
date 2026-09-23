import assert from "node:assert/strict";
import test from "node:test";

import { parseServerMessage } from "./protocol.ts";

test("parses a snapshot with document text and presence users", () => {
    const message = parseServerMessage(
        JSON.stringify({
            type: "snapshot",
            docId: "doc-1",
            text: "hello",
            users: [
                {
                    userId: "alice",
                    name: "Alice",
                    cursor: { offset: 5, selectionLength: 0 },
                },
            ],
        }),
    );

    assert.deepEqual(message, {
        type: "snapshot",
        docId: "doc-1",
        text: "hello",
        users: [
            {
                userId: "alice",
                name: "Alice",
                cursor: { offset: 5, selectionLength: 0 },
            },
        ],
    });
});

test("parses server errors without treating them as presence events", () => {
    assert.deepEqual(parseServerMessage('{"type":"error","text":"invalid operation"}'), {
        type: "error",
        text: "invalid operation",
    });
});

test("rejects unknown and malformed server messages", () => {
    assert.equal(parseServerMessage('{"type":"ack"}'), null);
    assert.equal(parseServerMessage('{"type":"presence","users":[{"userId":3}]}'), null);
    assert.equal(parseServerMessage("not-json"), null);
});
