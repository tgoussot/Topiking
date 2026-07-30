import express from "express";
import {Session} from "../entities/Session";
import {RequeteAuthentifiee} from "../middlewares/VerifAuth";
import {
    MANCHE_MORT_SUBITE,
    ResultatMortSubite,
    cloturerMortSubite,
    egaliteEnTete,
    ouvrirMortSubite,
    repondreMortSubite,
} from "../services/Jeux/MortSubiteService";
import {dureeDeBaseMs, masquerReponse} from "../services/Jeux/QuestionRunnerService";

function messageDe(erreur: unknown): string {
    if (erreur instanceof Error) {
        return erreur.message;
    }

    return "Erreur inattendue";
}

async function sessionDeLAnimateur(
    idSession: number,
    idAnimateur: number,
    res: express.Response
): Promise<Session | null> {
    const session = await Session.findOneBy({id: idSession});

    if (!session) {
        res.status(404).json({erreur: "Session introuvable"});
        return null;
    }

    if (session.id_animateur !== idAnimateur) {
        res.status(403).json({erreur: "Seul l'animateur de la session peut faire cela"});
        return null;
    }

    return session;
}

function presenterResultat(resultat: ResultatMortSubite) {
    return {
        id_question: resultat.idQuestion,
        id_vainqueur: resultat.idVainqueur,
        pseudo_vainqueur: resultat.pseudoVainqueur,
    };
}

export async function verifierEgalite(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    const exAequo = await egaliteEnTete(id);

    return res.status(200).json({
        egalite: exAequo.length >= 2,
        joueurs: exAequo.map((joueur) => ({
            id_participant: joueur.idParticipant,
            pseudo: joueur.pseudo,
            points: joueur.points,
        })),
    });
}

export async function lancerMortSubite(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    try {
        const question = await ouvrirMortSubite(id);

        const affichee = masquerReponse(question, MANCHE_MORT_SUBITE, 1, dureeDeBaseMs(question));

        return res.status(200).json({
            id_question: affichee.idQuestion,
            numero_manche: affichee.numeroManche,
            ordre: affichee.ordre,
            enonce: affichee.enonce,
            propositions: affichee.propositions,
            duree_timer_ms: affichee.dureeTimerMs,
        });
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function repondreDepartage(req: express.Request, res: express.Response) {
    const idParticipant = Number(req.params.idParticipant);

    if (!Number.isInteger(idParticipant)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const {id_question, index_choisi} = req.body;

    try {
        const resultat = await repondreMortSubite(idParticipant, id_question, index_choisi);

        return res.status(200).json(presenterResultat(resultat));
    } catch (erreur) {
        const message = messageDe(erreur);

        if (message === "La réponse doit être un index entre 1 et 4") {
            return res.status(400).json({erreur: message});
        }

        if (message === "Vous n'êtes pas concerné par ce départage") {
            return res.status(403).json({erreur: message});
        }

        if (
            message === "Participant introuvable" ||
            message === "Session introuvable" ||
            message === "Question introuvable"
        ) {
            return res.status(404).json({erreur: message});
        }

        return res.status(409).json({erreur: message});
    }
}

export async function cloturerDepartage(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    try {
        const resultat = await cloturerMortSubite(id);

        return res.status(200).json(presenterResultat(resultat));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}
