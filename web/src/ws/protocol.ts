import type { CrdtOp } from "../editor/MonacoBinding";
import type { Cursor, PresenceUser } from "../editor/RemoteCursor";

export type JoinMessage = {
    type: "join";
    docId: string;
    userId: string;
    name: string;
};

export type OperationMessage = {
    type: "op";
    payload: CrdtOp;
};

export type CursorMessage = {
    type: "cursor";
    cursor: Cursor;
};

export type WsClientMessage = JoinMessage | OperationMessage | CursorMessage;

export type SnapshotMessage = {
    type: "snapshot";
    docId: string;
    text: string;
    users: PresenceUser[];
};

export type PresenceMessage = {
    type: "presence" | "cursor" | "leave";
    users: PresenceUser[];
};

export type ErrorMessage = {
    type: "error";
    text: string;
};

export type WsServerMessage = OperationMessage | SnapshotMessage | PresenceMessage | ErrorMessage;

export function parseServerMessage(data: string): WsServerMessage | null {
    let value: unknown;
    try {
        value = JSON.parse(data);
    } catch {
        return null;
    }

    if (!isRecord(value) || typeof value.type !== "string") return null;

    switch (value.type) {
        case "op":
            return isCrdtOp(value.payload) ? { type: "op", payload: value.payload } : null;
        case "snapshot":
            return typeof value.docId === "string" &&
                typeof value.text === "string" &&
                isPresenceList(value.users)
                ? { type: "snapshot", docId: value.docId, text: value.text, users: value.users }
                : null;
        case "presence":
        case "cursor":
        case "leave":
            return isPresenceList(value.users) ? { type: value.type, users: value.users } : null;
        case "error":
            return typeof value.text === "string" ? { type: "error", text: value.text } : null;
        default:
            return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresenceList(value: unknown): value is PresenceUser[] {
    return Array.isArray(value) && value.every(isPresenceUser);
}

function isPresenceUser(value: unknown): value is PresenceUser {
    if (!isRecord(value) || typeof value.userId !== "string" || typeof value.name !== "string") {
        return false;
    }
    return value.cursor === undefined || value.cursor === null || isCursor(value.cursor);
}

function isCursor(value: unknown): value is Cursor {
    return isRecord(value) &&
        isNonNegativeInteger(value.offset) &&
        isNonNegativeInteger(value.selectionLength);
}

function isCrdtOp(value: unknown): value is CrdtOp {
    if (!isRecord(value) || typeof value.type !== "string" || typeof value.opId !== "string") {
        return false;
    }
    if (typeof value.actor !== "string" || !isNonNegativeInteger(value.position)) return false;
    if (value.type === "insert") return typeof value.text === "string";
    return value.type === "delete" && isNonNegativeInteger(value.length);
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
