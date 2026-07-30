import {WebSocketServer} from "ws";
import {Server} from "http";
import { parse } from "cookie";
import {authentifierParticipant} from "../services/AuthService";
import {inscrire, retirer} from "./Registre";
export function GestionWebSocket(httpServer: Server){
    // TODO : à comprendre
    const serveur = new WebSocketServer({noServer:true});

    // Requête upgrade arrive
    httpServer.on("upgrade", async (request, socket, head) => {
        if(request.url !== "/ws"){
            socket.destroy();
            return
        }
        if(!(request.headers.cookie)){
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return
        }

        const cookies = parse(request.headers.cookie);
        if(!cookies.token_participant){
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return
        }
        const participant = await authentifierParticipant(cookies.token_participant);
        if(!participant){
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return
        }

        // Transfo
        serveur.handleUpgrade(request, socket, head, (ws)=>{
            serveur.emit("connection", ws, request, participant);

            console.log(participant.pseudo,' a rejoint la session !')
            inscrire(ws,participant);

            ws.on("close", ()=>{
                console.log(participant.pseudo,' a quitté la session !')
                retirer(ws,participant);
            });
        })
    })
}