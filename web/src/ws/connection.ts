import ReconnectingWebSocket, {
    type Options as ReconnectingWebSocketOptions,
} from "reconnecting-websocket";
import type { CrdtOp } from "../editor/MonacoBinding";
import type { Cursor, PresenceUser } from "../editor/RemoteCursor";
import { OutboundMessageQueue } from "./messageQueue.ts";
import {
    parseServerMessage,
    type ErrorMessage,
    type JoinMessage,
    type SnapshotMessage,
    type WsClientMessage,
} from "./protocol.ts";

export type PresenceKind = "cursor" | "presence" | "snapshot" | "leave";

export type WsConnectionConfig = {
    url: string;
    documentId: string;
    userId: string;
    userName: string;
};

type SocketLike = {
    readyState: number;
    send(data: string): void;
    close(): void;
    addEventListener(type: string, listener: (event: { data?: string }) => void): void;
};

type SocketFactory = (url: string, options: ReconnectingWebSocketOptions) => SocketLike;

const OPEN_STATE = 1;
const defaultSocketFactory: SocketFactory = (url, options) =>
    new ReconnectingWebSocket(url, [], options);

export class WsConnection {
    private readonly socket: SocketLike;
    private readonly pending = new OutboundMessageQueue<string>();
    private readonly opListeners = new Set<(op: CrdtOp) => void>();
    private readonly presenceListeners = new Set<
        (users: PresenceUser[], kind: PresenceKind) => void
    >();
    private readonly snapshotListeners = new Set<(snapshot: SnapshotMessage) => void>();
    private readonly errorListeners = new Set<(error: ErrorMessage) => void>();
    private config: WsConnectionConfig;

    constructor(config: WsConnectionConfig, socketFactory: SocketFactory = defaultSocketFactory) {
        this.config = config;
        this.socket = socketFactory(config.url, {
            connectionTimeout: 2000,
            maxRetries: 10,
        });

        this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
        this.socket.addEventListener("open", () => this.handleOpen());
        this.socket.addEventListener("close", () => console.log("Web socket disconnected"));
    }

    join(documentId: string, userId: string, userName: string): void {
        this.config = { url: this.config.url, documentId, userId, userName };
        if (this.socket.readyState === OPEN_STATE) this.sendNow(this.joinMessage());
    }

    sendOp(op: CrdtOp): void {
        this.sendNowOrQueue({ type: "op", payload: op });
    }

    sendCursor(cursor: Cursor): void {
        this.sendNowOrQueue({ type: "cursor", cursor });
    }

    onOP(callback: (op: CrdtOp) => void): () => void {
        this.opListeners.add(callback);
        return () => this.opListeners.delete(callback);
    }

    onPresence(callback: (users: PresenceUser[], kind: PresenceKind) => void): () => void {
        this.presenceListeners.add(callback);
        return () => this.presenceListeners.delete(callback);
    }

    onSnapshot(callback: (snapshot: SnapshotMessage) => void): () => void {
        this.snapshotListeners.add(callback);
        return () => this.snapshotListeners.delete(callback);
    }

    onError(callback: (error: ErrorMessage) => void): () => void {
        this.errorListeners.add(callback);
        return () => this.errorListeners.delete(callback);
    }

    dispose(): void {
        this.opListeners.clear();
        this.presenceListeners.clear();
        this.snapshotListeners.clear();
        this.errorListeners.clear();
        this.pending.flush();
        this.socket.close();
    }

    private handleOpen(): void {
        console.log("Web socket connected to backend");
        this.sendNow(this.joinMessage());
        for (const message of this.pending.flush()) {
            this.sendNow(JSON.parse(message) as WsClientMessage);
        }
    }

    private handleMessage(data: string | undefined): void {
        if (!data) return;
        const msg = parseServerMessage(data);
        if (!msg) return;

        if (msg.type === "op") {
            for (const listener of this.opListeners) listener(msg.payload);
        } else if (msg.type === "snapshot") {
            for (const listener of this.snapshotListeners) listener(msg);
            for (const listener of this.presenceListeners) listener(msg.users, msg.type);
        } else if (msg.type === "presence" || msg.type === "cursor" || msg.type === "leave") {
            for (const listener of this.presenceListeners) listener(msg.users, msg.type);
        } else if (msg.type === "error") {
            for (const listener of this.errorListeners) listener(msg);
        }
    }

    private joinMessage(): JoinMessage {
        const { documentId, userId, userName } = this.config;
        return { type: "join", docId: documentId, userId, name: userName };
    }

    private sendNowOrQueue(message: WsClientMessage): void {
        if (this.socket.readyState === OPEN_STATE) {
            this.sendNow(message);
            return;
        }
        this.pending.enqueue(JSON.stringify(message));
    }

    private sendNow(message: WsClientMessage): void {
        this.socket.send(JSON.stringify(message));
    }
}

export const wsConnection = new WsConnection({
    url: "ws://localhost:8080/ws",
    documentId: "test-document",
    userId: "user-1",
    userName: "Electrical Student",
});
