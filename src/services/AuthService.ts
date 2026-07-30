import argon2 from "argon2";
import {Utilisateur} from "../entities/Utilisateur";
import jwt from "jsonwebtoken";
import {JWT_EXPIRY, JWT_EXPIRY_PARTICIPANT, JWT_SECRET} from "../config/auth.config";
import {Participant} from "../entities/Participant";

// + info : cat node_modules/argon2/argon2.d.cts
export async function hacherMotDePasse(motDePasse:string): Promise<string>{
    // TODO : Expliquer ce qu'est argon2id + pourquoi on l'a choisis
    return await argon2.hash(motDePasse, {type:argon2.argon2id});
}

export async function verifierMotDePasse(hash: string, motDePasse: string): Promise<boolean>{
    // TODO : Expliquer comment ça fonctionne ici aussi
    try {
        return await argon2.verify(hash, motDePasse)
    } catch {
        return false
    }
}

export function genererToken(utilisateur:Utilisateur): string{
    const payload = {
        "sub":utilisateur.id,
        "org":utilisateur.id_organisation
    }
    // TODO : Même chose ici
    const token = jwt.sign(payload, JWT_SECRET, {expiresIn: JWT_EXPIRY})
    return token
}

export async function authentifierParticipant(token: string): Promise<Participant | null>{
    let payload: jwt.JwtPayload;
    try{
        payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch {
        return null;
    }

    if(payload.role !== "participant"){
        return null;
    }

    return await Participant.findOneBy({id:Number(payload.sub)});
}

export function genererTokenParticipant(participant:Participant): string{
    const payload = {
        "sub":participant.id,
        "session":participant.id_session,
        "role": "participant"

    }
    const token = jwt.sign(payload, JWT_SECRET, {expiresIn: JWT_EXPIRY_PARTICIPANT})
    return token
}