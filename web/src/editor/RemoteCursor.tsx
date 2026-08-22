import { useEffect, useRef } from "react";
import type * as monaco from "monaco-editor";

export type Cursor = {
    offset: number;
    selectionLength: number;
};

export type PresenceUser = {
    userId: string;
    name: string;
    cursor?: Cursor | null;
};

const PALETTE = [
    "#f44747",
    "#4ec9b0",
    "#569cd6",
    "#c586c0",
    "#dcdcaa",
    "#ce9178",
    "#9cdcfe",
    "#d7ba7d",
];

function colorForUser(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
}

function cssSafeId(userId: string): string {
    return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Paints other collaborators' carets and selections as Monaco decorations.
 * Labels are injected via CSS so they scroll with the text.
 */
export class RemoteCursorRenderer {
    private editor: monaco.editor.ICodeEditor;
    private decorations = new Map<string, string[]>();
    private users = new Map<string, PresenceUser>();
    private style: HTMLStyleElement;
    private localUserId?: string;

    constructor(editor: monaco.editor.ICodeEditor, localUserId?: string) {
        this.editor = editor;
        this.localUserId = localUserId;
        this.style = document.createElement("style");
        this.style.dataset.mergeflowRemoteCursors = "true";
        document.head.appendChild(this.style);
    }

    setLocalUserId(userId: string) {
        this.localUserId = userId;
        if (this.users.has(userId)) {
            this.remove(userId);
        }
    }

    upsert(user: PresenceUser) {
        if (!user.userId || user.userId === this.localUserId) return;
        this.users.set(user.userId, {
            ...this.users.get(user.userId),
            ...user,
            cursor: user.cursor ?? this.users.get(user.userId)?.cursor,
        });
        this.paint(user.userId);
    }

    setAll(users: PresenceUser[]) {
        const keep = new Set<string>();
        for (const user of users) {
            if (!user.userId || user.userId === this.localUserId) continue;
            keep.add(user.userId);
            this.users.set(user.userId, user);
            this.paint(user.userId);
        }
        for (const userId of [...this.users.keys()]) {
            if (!keep.has(userId)) this.remove(userId);
        }
    }

    remove(userId: string) {
        const ids = this.decorations.get(userId);
        if (ids) {
            this.editor.deltaDecorations(ids, []);
            this.decorations.delete(userId);
        }
        this.users.delete(userId);
        this.rewriteStyles();
    }

    dispose() {
        for (const ids of this.decorations.values()) {
            this.editor.deltaDecorations(ids, []);
        }
        this.decorations.clear();
        this.users.clear();
        this.style.remove();
    }

    private paint(userId: string) {
        const model = this.editor.getModel();
        const user = this.users.get(userId);
        if (!model || !user?.cursor) return;

        const maxOffset = model.getValueLength();
        const start = clamp(user.cursor.offset, 0, maxOffset);
        const end = clamp(start + Math.max(0, user.cursor.selectionLength), 0, maxOffset);
        const startPos = model.getPositionAt(start);
        const endPos = model.getPositionAt(end);
        const id = cssSafeId(userId);
        const color = colorForUser(userId);

        const next: monaco.editor.IModelDeltaDecoration[] = [];

        if (end > start) {
            next.push({
                range: {
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column,
                },
                options: {
                    className: `mf-remote-sel-${id}`,
                    stickiness: 1,
                },
            });
        }

        next.push({
            range: {
                startLineNumber: endPos.lineNumber,
                startColumn: endPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column,
            },
            options: {
                afterContentClassName: `mf-remote-caret-${id}`,
                stickiness: 1,
            },
        });

        const prev = this.decorations.get(userId) ?? [];
        this.decorations.set(userId, this.editor.deltaDecorations(prev, next));
        this.ensureUserStyle(id, user.name || userId, color);
    }

    private ensureUserStyle(id: string, name: string, color: string) {
        const label = JSON.stringify(name);
        const rule = `
.mf-remote-caret-${id} {
  position: relative;
  border-left: 2px solid ${color};
  margin-left: -1px;
  height: 100%;
  pointer-events: none;
}
.mf-remote-caret-${id}::after {
  content: ${label};
  position: absolute;
  top: -1.2em;
  left: -2px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 1.4;
  color: #fff;
  background: ${color};
  border-radius: 2px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
.mf-remote-sel-${id} {
  background: ${color}55;
}
`;
        const marker = `/* ${id} */`;
        if (!this.style.textContent?.includes(marker)) {
            this.style.textContent += `\n${marker}\n${rule}`;
        } else {
            this.rewriteStyles();
        }
    }

    private rewriteStyles() {
        const chunks: string[] = [];
        for (const user of this.users.values()) {
            const id = cssSafeId(user.userId);
            const color = colorForUser(user.userId);
            const label = JSON.stringify(user.name || user.userId);
            chunks.push(`/* ${id} */
.mf-remote-caret-${id} {
  position: relative;
  border-left: 2px solid ${color};
  margin-left: -1px;
  height: 100%;
  pointer-events: none;
}
.mf-remote-caret-${id}::after {
  content: ${label};
  position: absolute;
  top: -1.2em;
  left: -2px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 1.4;
  color: #fff;
  background: ${color};
  border-radius: 2px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
.mf-remote-sel-${id} {
  background: ${color}55;
}`);
        }
        this.style.textContent = chunks.join("\n");
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function cursorFromSelection(
    model: monaco.editor.ITextModel,
    selection: monaco.Selection,
): Cursor {
    const start = model.getOffsetAt(selection.getStartPosition());
    const end = model.getOffsetAt(selection.getEndPosition());
    return { offset: start, selectionLength: Math.max(0, end - start) };
}

type RemoteCursorsProps = {
    editor: monaco.editor.ICodeEditor | null;
    users: PresenceUser[];
    localUserId?: string;
};

/** React wrapper: re-paints whenever the presence list changes. */
export function RemoteCursors({ editor, users, localUserId }: RemoteCursorsProps) {
    const rendererRef = useRef<RemoteCursorRenderer | null>(null);

    useEffect(() => {
        if (!editor) return;
        const renderer = new RemoteCursorRenderer(editor, localUserId);
        rendererRef.current = renderer;
        return () => {
            renderer.dispose();
            rendererRef.current = null;
        };
    }, [editor, localUserId]);

    useEffect(() => {
        rendererRef.current?.setAll(users);
    }, [users]);

    return null;
}
