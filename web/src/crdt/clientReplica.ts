import * as Y from "yjs";
import type { CrdtOp,ReplicaLike } from "../editor/MonacoBinding";

export class YjsReplica implements ReplicaLike{
    private Doc : Y.Doc;
    private text: Y.Text;
    private actorId: string;

    constructor(actorId:string){
        this.Doc = new Y.Doc();
        this.text=this.Doc.getText("monaco");
        this.actorId=actorId;
    }

    applyLocal(change: {rangeOffset:number,rangeLength:number,text:string}): CrdtOp[]{
        const ops: CrdtOp[] = [];

        if(change.rangeLength>0){
            this.text.delete(change.rangeOffset,change.rangeLength);

            ops.push({
                type:"delete",
                position:change.rangeOffset,
                length:change.rangeLength,
                opId:crypto.randomUUID(),
                actor:this.actorId,
            });
        }
        
        if(change.text.length>0){
            this.text.insert(change.rangeOffset,change.text);

            ops.push({
                type:"insert",
                position:change.rangeOffset,
                text:change.text,
                opId:crypto.randomUUID(),
                actor:this.actorId
            });
        }
        return ops;
    }

    applyRemote(op:CrdtOp):{rangeOffset:number,rangeLength:number,text:string}[]{
        if(op.type==="insert"){
            this.text.insert(op.position,op.text);
            return [{rangeOffset:op.position,rangeLength:0,text:op.text}];
        }
        else if(op.type==="delete"){
            this.text.delete(op.position,op.length);
            return[{rangeOffset:op.position,rangeLength:op.length,text:""}];
        }
        return [];
    }

    getText():string{
        return this.text.toString();
    }
}