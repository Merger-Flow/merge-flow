import type * as monaco from "monaco-editor";

export type CrdtOp=| {type:"insert";position:number,text:string,opId:string,actor:string}
|{type:"delete";position:number,length:number,opId:string,actor:string};

export interface ReplicaLike{
    applyLocal(change: {rangeOffset:number,rangeLength:number,text:string}):CrdtOp[];
    applyRemote(op:CrdtOp):{rangeOffset:number,rangeLength:number,text:string}[];
    getText():string;
}

export interface MonacoBindingOptions{
    onLocalOp:(op:CrdtOp)=> void;
}

export class MonacoBinding{
    private model:monaco.editor.ITextModel;
    private replica: ReplicaLike;
    private onLocalOp:(op:CrdtOp)=>void;
    private applyingRemote=false;
    private contentListener:monaco.IDisposable;
    
    constructor(editor:monaco.editor.ICodeEditor,replica:ReplicaLike,options:MonacoBindingOptions){
        this.replica=replica;
        this.onLocalOp=options.onLocalOp;
        const model=editor.getModel();
        if(!model){
            throw new Error("MonacoBinding: Editor has no model attached yet");
        }
        this.model=model;
        this.applyingRemote=true;
        this.model.setValue(replica.getText());        
        this.applyingRemote=false;
        this.contentListener=this.model.onDidChangeContent((e) => this.handleLocalChange(e));
    }

    private handleLocalChange(e :monaco.editor.IModelContentChangedEvent){
        if(this.applyingRemote) return ;

        for(const change of e.changes){
            const ops=this.replica.applyLocal({
                rangeOffset:change.rangeOffset,
                rangeLength:change.rangeLength,
                text:change.text,
            });
            for(const op of ops) this.onLocalOp(op);
        }
    }

    applyRemote(op:CrdtOp){
        const edits=this.replica.applyRemote(op);
        if(edits.length===0) return;

        this.applyingRemote=true;
        try{
            this.model.applyEdits(edits.map((edit) =>{
                const start=this.model.getPositionAt(edit.rangeOffset);
                const end=this.model.getPositionAt(edit.rangeOffset+edit.rangeLength);
                return{
                    range:{
                        startLineNumber:start.lineNumber,
                        startColumn:start.column,
                        endLineNumber:end.lineNumber,
                        endColumn:end.column,
                    },
                    text:edit.text,
                    forceMoveMarkers:true,
                };
            })
        );
        }finally{
            this.applyingRemote=false;
        }
    }

    dispose(){
        this.contentListener.dispose();
    }
}

export function bindMonacoToReplica(editor:monaco.editor.ICodeEditor,replica:ReplicaLike,onLocalOp:(op:CrdtOp)=> void):MonacoBinding{
    return new MonacoBinding(editor,replica,{onLocalOp});
}
