import ReconnectingWebSocket, {
    type Options as ReconnectingWebSocketOptions,
} from "reconnecting-websocket";
import type { CrdtOp } from "../editor/MonacoBinding";
import type { Cursor, PresenceUser } from "../editor/RemoteCursor";
import { OutboundMessageQueue } from "./messageQueue.ts";

export type PresenceKind = "cursor" | "presence" | "snapshot" | "leave";

type WsMessage = {
    type: "op" | PresenceKind | "error";
    payLoad?: CrdtOp;
    payload?: CrdtOp;
    users?: PresenceUser[];
    cursor?: Cursor;
};

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

    dispose(): void {
        this.opListeners.clear();
        this.presenceListeners.clear();
        this.pending.flush();
        this.socket.close();
    }

    private handleOpen(): void {
        console.log("Web socket connected to backend");
        this.sendNow(this.joinMessage());
        for (const message of this.pending.flush()) {
            this.sendNow(JSON.parse(message) as Record<string, unknown>);
        }
    }

    private handleMessage(data: string | undefined): void {
        if (!data) return;
        try {
            const msg: WsMessage = JSON.parse(data);

            if (msg.type === "op") {
                const op = msg.payload ?? msg.payLoad;
                if (!op) return;
                for (const listener of this.opListeners) listener(op);
            } else if (
                msg.type === "cursor" ||
                msg.type === "presence" ||
                msg.type === "snapshot" ||
                msg.type === "leave"
            ) {
                const users = msg.users ?? [];
                for (const listener of this.presenceListeners) listener(users, msg.type);
            }
        } catch (error) {
            console.error("Failed to parse WS message", error);
        }
    }

    private joinMessage(): Record<string, unknown> {
        const { documentId, userId, userName } = this.config;
        return { type: "join", docId: documentId, userId, name: userName };
    }

    private sendNowOrQueue(message: Record<string, unknown>): void {
        if (this.socket.readyState === OPEN_STATE) {
            this.sendNow(message);
            return;
        }
        this.pending.enqueue(JSON.stringify(message));
    }

    private sendNow(message: Record<string, unknown>): void {
        this.socket.send(JSON.stringify(message));
    }
}

export const wsConnection = new WsConnection({
    url: "ws://localhost:8080/ws",
    documentId: "test-document",
    userId: "user-1",
    userName: "Electrical Student",
});
