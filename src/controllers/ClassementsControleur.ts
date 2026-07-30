import express from "express";
import {Session} from "../entities/Session";
import {ScoreParticipant, classementDeLaManche, classementGeneral} from "../services/Jeux/ClassementService";

function presenterClassement(classement: ScoreParticipant[]) {
    return classement.map((score, index) => ({
        rang: index + 1,
        id_participant: score.idParticipant,
        pseudo: score.pseudo,
        points: score.points,
        temps_cumule_ms: score.tempsCumuleMs,
    }));
}

export async function classementDeLaPartie(req: express.Request, res: express.Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await Session.findOneBy({id: id});

    if (!session) {
        return res.status(404).json({erreur: "Session introuvable"});
    }

    const classement = await classementGeneral(id);

    return res.status(200).json(presenterClassement(classement));
}

export async function classementParManche(req: express.Request, res: express.Response) {
    const id = Number(req.params.id);
    const numero = Number(req.params.numero);

    if (!Number.isInteger(id) || !Number.isInteger(numero)) {
        return res.status(400).json({erreur: "Identifiant de session ou numéro de manche invalide"});
    }

    const session = await Session.findOneBy({id: id});

    if (!session) {
        return res.status(404).json({erreur: "Session introuvable"});
    }

    const classement = await classementDeLaManche(id, numero);

    return res.status(200).json(presenterClassement(classement));
}
