import { useRef } from "react";
import { Editor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { MonacoBinding,bindMonacoToReplica } from "../editor/MonacoBinding";
import { YjsReplica } from "../crdt/clientReplica";
import { wsConnection } from "../ws/connection";

export function EditorGroups(){
    const bindingRef = useRef<MonacoBinding |null>(null);

    function handleEditorDidMount(editor: monaco.editor.ICodeEditor){
        const actorId="user-" +Math.random().toString(36).substring(7);
        const replica=new YjsReplica(actorId);
        bindingRef.current=bindMonacoToReplica(editor,replica,(op)=>{
            wsConnection.sendOp(op);
        });

        wsConnection.onOP((op)=>{
            if(op.actor!==actorId){
                bindingRef.current?.applyRemote(op);
            }
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