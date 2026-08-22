import ReconnectingWebSocket from "reconnecting-websocket";
import type { CrdtOp } from "../editor/MonacoBinding";
import type { Cursor, PresenceUser } from "../editor/RemoteCursor";

type PresenceKind = "cursor" | "presence" | "snapshot" | "leave";

type WsMessage ={
    type:"op" | PresenceKind | "error";
    payLoad?:CrdtOp;
    payload?:CrdtOp;
    users?:PresenceUser[];
    cursor?:Cursor;
};


class WsConnection{
    private rws : ReconnectingWebSocket;

    private opListeners: Array<(op:CrdtOp) => void >=[];
    private presenceListeners: Array<(users:PresenceUser[], kind:PresenceKind) => void >=[];

    constructor(url: string){
        this.rws=new ReconnectingWebSocket(url,[],{
            connectionTimeout:2000,
            maxRetries:10,
        });

        this.rws.addEventListener("message",(event)=>{
            try {
                const msg:WsMessage=JSON.parse(event.data);

                if(msg.type==="op"){
                    const op=msg.payload ?? msg.payLoad;
                    if(!op) return;
                    for(const listener of this.opListeners){
                        listener(op);
                    }
                }
                else if(msg.type==="cursor" || msg.type==="presence" || msg.type==="snapshot" || msg.type==="leave"){
                    const users=msg.users ?? [];
                    for(const listener of this.presenceListeners){
                        listener(users, msg.type);
                    }
                }
            } catch (error) {
                console.error("Failed to parse WS message",error);
            }
        });

        this.rws.addEventListener("open",() => {

            console.log("Web socket connected to backend")
        
            this.join("test-document", "user-1", "Electrical Student");});
        this.rws.addEventListener("close",() => console.log("Web socket disconnected"));
    }
    join(documentId: string, userId: string, userName: string) {
        const msg = {
            type: "join",
            docId: documentId,
            userId: userId,
            name: userName,
        };

        if (this.rws.readyState === WebSocket.OPEN) {
            this.rws.send(JSON.stringify(msg));
        } else {
            console.warn("Socket not connected yet");
    }
}
    sendOp(op:CrdtOp){
        if(this.rws.readyState===WebSocket.OPEN){
            const msg:WsMessage={type:"op",payload:op};
            this.rws.send(JSON.stringify(msg));
        }
        else{
            console.warn("Socket disconnected,connection dropping:",op);
        }
    }

    sendCursor(cursor:Cursor){
        if(this.rws.readyState===WebSocket.OPEN){
            this.rws.send(JSON.stringify({type:"cursor",cursor}));
        }
    }

    onOP(callback: (Op:CrdtOp) =>void){
        this.opListeners.push(callback);
    }

    onPresence(callback: (users:PresenceUser[], kind:PresenceKind) =>void){
        this.presenceListeners.push(callback);
    }
}

export const wsConnection = new WsConnection("ws://localhost:8080/ws");
