import express from "express";
import {Participant} from "../entities/Participant";
import {Session} from "../entities/Session";
import {compter, lister, quitter, rejoindre} from "../services/Jeux/ParticipantService";

function messageDe(erreur: unknown): string {
    if (erreur instanceof Error) {
        return erreur.message;
    }

    return "Erreur inattendue";
}

function presenterParticipant(participant: Participant) {
    return {
        id: participant.id,
        pseudo: participant.pseudo,
        score_total: participant.score_total,
        id_session: participant.id_session,
    };
}

export async function rejoindreSession(req: express.Request, res: express.Response) {
    const {code_acces, pseudo} = req.body;

    try {
        const participant = await rejoindre(code_acces, pseudo);

        return res.status(201).json(presenterParticipant(participant));
    } catch (erreur) {
        const message = messageDe(erreur);

        if (message === "Aucune partie ne correspond à ce code") {
            return res.status(404).json({erreur: message});
        }

        if (message.startsWith("Le pseudo doit faire") || message.startsWith("Le pseudo ne doit pas")) {
            return res.status(400).json({erreur: message});
        }

        return res.status(409).json({erreur: message});
    }
}

export async function lireParticipant(req: express.Request, res: express.Response) {
    const id = Number(req.params.idParticipant);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const participant = await Participant.findOneBy({id: id});

    if (!participant) {
        return res.status(404).json({erreur: "Participant introuvable"});
    }

    return res.status(200).json(presenterParticipant(participant));
}

export async function quitterSession(req: express.Request, res: express.Response) {
    const id = Number(req.params.idParticipant);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    try {
        await quitter(id);

        return res.status(204).send();
    } catch (erreur) {
        const message = messageDe(erreur);

        if (message === "Participant introuvable" || message === "Session introuvable") {
            return res.status(404).json({erreur: message});
        }

        return res.status(409).json({erreur: message});
    }
}

export async function listerParticipants(req: express.Request, res: express.Response) {
    const idSession = Number(req.params.id);

    if (!Number.isInteger(idSession)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await Session.findOneBy({id: idSession});

    if (!session) {
        return res.status(404).json({erreur: "Session introuvable"});
    }

    const participants = await lister(idSession);

    return res.status(200).json(participants.map(presenterParticipant));
}

export async function compterParticipants(req: express.Request, res: express.Response) {
    const idSession = Number(req.params.id);

    if (!Number.isInteger(idSession)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await Session.findOneBy({id: idSession});

    if (!session) {
        return res.status(404).json({erreur: "Session introuvable"});
    }

    const nombre = await compter(idSession);

    return res.status(200).json({nombre: nombre});
}
