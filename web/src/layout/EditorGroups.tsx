import { useRef, useEffect } from "react";
import { Editor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { MonacoBinding, bindMonacoToReplica } from "../editor/MonacoBinding";
import { RemoteCursorRenderer, cursorFromSelection } from "../editor/RemoteCursor";
import { YjsReplica } from "../crdt/clientReplica";
import { wsConnection } from "../ws/connection";
import { usePresenceStore } from "../ws/presenceStore";

export function EditorGroups() {
    const bindingRef = useRef<MonacoBinding | null>(null);
    const cursorsRef = useRef<RemoteCursorRenderer | null>(null);
    const replicaRef = useRef<YjsReplica | null>(null);
    const { setUser, removeUser, setAllUsers } = usePresenceStore();

    function handleEditorDidMount(editor: monaco.editor.ICodeEditor) {
        const actorId = "user-" + Math.random().toString(36).substring(7);
        const userName = "User " + actorId.split("-")[1];
        
        const replica = new YjsReplica(actorId);
        replicaRef.current = replica;

        bindingRef.current = bindMonacoToReplica(editor, replica, (op) => {
            wsConnection.sendOp(op);
        });

        cursorsRef.current = new RemoteCursorRenderer(editor, actorId);

        wsConnection.onOP((op) => {
            if (op.actor !== actorId) {
                bindingRef.current?.applyRemote(op);
            }
        });

        wsConnection.onPresence((users, kind) => {
            const cursors = cursorsRef.current;
            if (!cursors) return;
            
            if (kind === "snapshot") {
                setAllUsers(users);
                cursors.setAll(users);
            } else if (kind === "leave") {
                for (const user of users) {
                    removeUser(user.userId);
                    cursors.remove(user.userId);
                }
            } else {
                for (const user of users) {
                    setUser(user);
                    cursors.upsert(user);
                }
            }
        });

        wsConnection.onSnapshot((snapshot) => {
            if (snapshot.text) {
                bindingRef.current?.applyRemote({
                    type: "insert",
                    position: 0,
                    text: snapshot.text,
                    opId: "snapshot-" + Date.now(),
                    actor: "server"
                });
            }
        });

        editor.onDidChangeCursorSelection(() => {
            const model = editor.getModel();
            const selection = editor.getSelection();
            if (!model || !selection) return;
            wsConnection.sendCursor(cursorFromSelection(model, selection));
        });

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

