import { useRef } from "react";
import { Editor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { MonacoBinding,bindMonacoToReplica } from "../editor/MonacoBinding";
import { RemoteCursorRenderer, cursorFromSelection } from "../editor/RemoteCursor";
import { YjsReplica } from "../crdt/clientReplica";
import { wsConnection } from "../ws/connection";

export function EditorGroups(){
    const bindingRef = useRef<MonacoBinding |null>(null);
    const cursorsRef = useRef<RemoteCursorRenderer |null>(null);

    function handleEditorDidMount(editor: monaco.editor.ICodeEditor){
        const actorId="user-" +Math.random().toString(36).substring(7);
        const replica=new YjsReplica(actorId);
        bindingRef.current=bindMonacoToReplica(editor,replica,(op)=>{
            wsConnection.sendOp(op);
        });
        cursorsRef.current=new RemoteCursorRenderer(editor, "user-1");

        wsConnection.onOP((op)=>{
            if(op.actor!==actorId){
                bindingRef.current?.applyRemote(op);
            }
        });

        wsConnection.onPresence((users, kind)=>{
            const cursors=cursorsRef.current;
            if(!cursors) return;
            if(kind==="snapshot"){
                cursors.setAll(users);
            }
            else if(kind==="leave"){
                for(const user of users) cursors.remove(user.userId);
            }
            else{
                for(const user of users) cursors.upsert(user);
            }
        });

        editor.onDidChangeCursorSelection(()=>{
            const model=editor.getModel();
            const selection=editor.getSelection();
            if(!model || !selection) return;
            wsConnection.sendCursor(cursorFromSelection(model, selection));
        });
    }

    return(
        <div className="col-start-3 row-start-1 flex h-full flex-col overflow-hidden bg-vscode-bg">
            <div className="flex-shrink-0 bg-vscode-sidebar text-[13px]">
                <div className="cursor-pointer border-t border-[] bg-vscode-active-tab px-[15px] py-[8px] text-white">
                    clientReplica.ts
                </div>
            </div>

            <div className="h-full w-full grow">
                <Editor
                    height="100%"
                    width="100%"
                    defaultLanguage="typescript"
                    theme="vs-dark"
                    onMount={handleEditorDidMount}
                    options={{minimap:{enabled:false},padding:{top:15}}}
                />
            </div>
        </div>
    );
}