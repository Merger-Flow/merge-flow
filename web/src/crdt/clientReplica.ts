import * as Y from "yjs";
import { CrdtOp,ReplicaLike } from "../editor/MonacoBinding";

export class YjsReplica implements ReplicaLike{
    private Doc : Y.Doc;
    private text: Y.Text;
    private actorId: string;

    constructor(actorId:string){
        this.Doc = new Y.Doc();
        this.text=this.Doc.getText("monaco");
        this.actorId=actorId;
    }


}