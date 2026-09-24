import { useRef, useEffect } from "react";
import { Editor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { MonacoBinding, bindMonacoToReplica } from "../editor/MonacoBinding";
import { RemoteCursorRenderer, cursorFromSelection } from "../editor/RemoteCursor";
import { YjsReplica } from "../crdt/clientReplica";
import { wsConnection } from "../ws/connection";

export function EditorGroups() {
    const bindingRef = useRef<MonacoBinding | null>(null);
    const cursorsRef = useRef<RemoteCursorRenderer | null>(null);
    const replicaRef = useRef<YjsReplica | null>(null);

    function handleEditorDidMount(editor: monaco.editor.ICodeEditor) {
        const actorId = "user-" + Math.random().toString(36).substring(7);
        const userName = "User " + actorId.split("-")[1];
        
        const replica = new YjsReplica(actorId);
        replicaRef.current = replica;

        // 1. Initialize Binding
        bindingRef.current = bindMonacoToReplica(editor, replica, (op) => {
            wsConnection.sendOp(op);
        });

        // 2. Initialize Cursors
        cursorsRef.current = new RemoteCursorRenderer(editor, actorId);

        // 3. Handle incoming operations
        wsConnection.onOP((op) => {
            if (op.actor !== actorId) {
                bindingRef.current?.applyRemote(op);
            }
        });

        // 4. Handle presence and snapshots
        wsConnection.onPresence((users, kind) => {
            const cursors = cursorsRef.current;
            if (!cursors) return;
            if (kind === "snapshot") {
                cursors.setAll(users);
            } else if (kind === "leave") {
                for (const user of users) cursors.remove(user.userId);
            } else {
                for (const user of users) cursors.upsert(user);
            }
        });

        // 5. Handle initial snapshot to sync text
        wsConnection.onSnapshot((snapshot) => {
            if (snapshot.text) {
                // This is a simplified approach: replacing the entire text on snapshot.
                // In a full Yjs implementation, we would apply a state vector update.
                const currentText = replica.getText();
                if (currentText !== snapshot.text) {
                    // We simulate a remote update to the replica and editor
                    // for the initial snapshot.
                    bindingRef.current?.applyRemote({
                        type: "insert",
                        position: 0,
                        text: snapshot.text,
                        opId: "snapshot-" + Date.now(),
                        actor: "server"
                    });
                }
            }
        });

        // 6. Setup cursor tracking
        editor.onDidChangeCursorSelection(() => {
            const model = editor.getModel();
            const selection = editor.getSelection();
            if (!model || !selection) return;
            wsConnection.sendCursor(cursorFromSelection(model, selection));
        });

        // 7. Join the document
        wsConnection.join("test-document", actorId, userName);
    }

    return (
        <div className="col-start-3 row-start-1 flex h-full flex-col overflow-hidden bg-vscode-bg">
            <div className="flex-shrink-0 bg-vscode-sidebar text-[13px]">
                <div className="cursor-pointer border-t border-vscode-border bg-vscode-active-tab px-[15px] py-[8px] text-white">
                    document.ts
                </div>
            </div>

            <div className="h-full w-full grow">
                <Editor
                    height="100%"
                    width="100%"
                    defaultLanguage="typescript"
                    theme="vs-dark"
                    onMount={handleEditorDidMount}
                    options={{ minimap: { enabled: false }, padding: { top: 15 } }}
                />
            </div>
        </div>
    );
}

