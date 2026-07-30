import { Participant } from "../entities/Participant";
import { WebSocket }from "ws";
import {DonneesMessage, encoderMessage, TypeMessage} from "./Message";

type Connexion = {
    ws:WebSocket
    participant:Participant
}

const connexions: Map<number, Set<Connexion>> = new Map();

export function inscrire(ws:WebSocket, participant:Participant){
    let membreSession = connexions.get(participant.id_session)

    // 1er participant
    if(!membreSession){
        const nouvellesConnexions = new Set<Connexion>();
        connexions.set(participant.id_session, nouvellesConnexions);
        membreSession = nouvellesConnexions;
    }

    membreSession.add({ ws, participant });
    console.log("Session", participant.id_session, ":", membreSession.size, "connecté(s)");
}

export function retirer(ws:WebSocket, participant:Participant){
    const membreSession = connexions.get(participant.id_session)
    if(!membreSession){
        return;
    }

    for (const connexion of membreSession) {
        if (connexion.ws === ws) {
            membreSession.delete(connexion);
            break;
        }
    }

    if (membreSession.size === 0) {
        connexions.delete(participant.id_session);
    }

    console.log("Session", participant.id_session, ":", membreSession.size, "connecté(s)");
}

function envoyer(connexion:Connexion, message:string){
    // Socket prêt
    if (connexion.ws.readyState === WebSocket.OPEN) {
        connexion.ws.send(message);
    }
}

export function versSession(idSession: number, type: TypeMessage, donnees: DonneesMessage){
    const membreSession = connexions.get(idSession);
    if(!membreSession){
        return;
    }
    const message = encoderMessage(type, donnees);

    // A toute la session
    for (const connexion of membreSession) {
        envoyer(connexion,message);
    }
}

export function versParticipant(idSession: number, idParticipant: number, type: TypeMessage, donnees: DonneesMessage){
    const membreSession = connexions.get(idSession);
    if(!membreSession){
        return;
    }
    const message = encoderMessage(type, donnees);

    // A un participant
    for (const connexion of membreSession) {
        if(connexion.participant.id === idParticipant){
            envoyer(connexion,message);
        }
    }
}

// READONLY POUR LES TESTS
// Nombre de connexions d'une session
export function compterConnexions(idSession: number): number {
    return connexions.get(idSession)?.size ?? 0;
}

// Les clés présentes dans la Map
export function sessionsEnregistrees(): number[] {
    return [...connexions.keys()];
}