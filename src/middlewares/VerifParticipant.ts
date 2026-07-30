import express from "express";
import {Participant} from "../entities/Participant";
import {authentifierParticipant} from "../services/AuthService";

export interface RequeteParticipant extends express.Request { participant: Participant }

export async function verifAuthParticipant(baseRequest: express.Request, res: express.Response, next: express.NextFunction){
    const req = baseRequest as RequeteParticipant;

    const token = req.cookies.token_participant;
    if(!token){
        return res.status(401).json({erreur:"Token invalide"});
    }

    const participant = await authentifierParticipant(token);
    if(!participant){
        return res.status(401).json({erreur:"Token invalide"});
    }

    if(participant.id !== Number(req.params.idParticipant)){
        return res.status(403).json({erreur:"Vous pouvez pas répondre à la place de quelqu'un"});
    }

    req.participant = participant;
    next();
}
