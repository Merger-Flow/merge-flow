import ReconnectingWebSocket from "reconnecting-websocket";
import type { CrdtOp } from "../editor/MonacoBinding";

type WsMessage ={
    type:"op";
    payLoad:CrdtOp;
};

class WsConnection{
    private rws : ReconnectingWebSocket;

    private opListeners: Array<(op:CrdtOp) => void >=[];

    constructor(url: string){
        this.rws=new ReconnectingWebSocket(url,[],{
            connectionTimeout:2000,
            maxRetries:10,
        });

        this.rws.addEventListener("message",(event)=>{
            try {
                const msg:WsMessage=JSON.parse(event.data);

                if(msg.type==="op"){
                    for(const listener of this.opListeners){
                        listener(msg.payLoad);
                    }
                }
            } catch (error) {
                console.error("Failed to parse WS message",error);
            }
        });

        this.rws.addEventListener("open",() => console.log("Web socket connected to backend"));
        this.rws.addEventListener("close",() => console.log("Web socket disconnected"));
    }

    sendOp(op:CrdtOp){
        if(this.rws.readyState===WebSocket.OPEN){
            const msg:WsMessage={type:"op",payLoad:op};
            this.rws.send(JSON.stringify(msg));
        }
        else{
            console.warn("Socket disconnected,connection dropping:",op);
        }
    }

    onOP(callback: (Op:CrdtOp) =>void){
        this.opListeners.push(callback);
    }
}

export const wsConnection = new WsConnection("ws://localhost:8080/ws");
