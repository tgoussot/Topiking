import express from "express";
import {Session} from "../entities/Session";
import {RequeteAuthentifiee} from "../middlewares/VerifAuth";
import {
    annuler,
    creer,
    demarrer,
    fenetreCartesOuverte,
    fermerFenetreCartes,
    manchesDeLaSession,
    ouvrirFenetreCartes,
    questionsDeLaManche,
    terminer,
    trouverParCode,
} from "../services/Jeux/SessionService";
import {versSession} from "../websocket/Registre";
import {FENETRE_CARTES_S} from "../config/config";

function messageDe(erreur: unknown): string {
    if (erreur instanceof Error) {
        return erreur.message;
    }

    return "Erreur inattendue";
}

function presenterSession(session: Session) {
    return {
        id: session.id,
        code_acces: session.code_acces,
        statut: session.statut,
        numero_manche_courante: session.numero_manche_courante,
        id_question_courante: session.id_question_courante,
        fenetre_cartes_ouverte: fenetreCartesOuverte(session),
        date_debut: session.date_debut,
        date_fin: session.date_fin,
        id_animateur: session.id_animateur,
    };
}

function tempsJouer(){
    return{
        duree_ms: FENETRE_CARTES_S * 1000 // 20s
    }
}

function presenterSessionPublique(session: Session){
    return{
        statut:session.statut,
        numero_manche_courante: session.numero_manche_courante
    };
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

export async function creerSession(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const {id_themes} = req.body;

    try {
        const session = await creer(req.utilisateur.id, req.utilisateur.id_organisation, id_themes);

        return res.status(201).json(presenterSession(session));
    } catch (erreur) {
        return res.status(400).json({erreur: messageDe(erreur)});
    }
}

export async function lireSession(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    return res.status(200).json(presenterSession(session));
}

export async function lireSessionParCode(req: express.Request, res: express.Response) {
    const code = Number(req.params.code);

    if (!Number.isInteger(code)) {
        return res.status(400).json({erreur: "Code d'accès invalide"});
    }

    const session = await trouverParCode(code);

    if (!session) {
        return res.status(404).json({erreur: "Aucune session active avec ce code"});
    }

    return res.status(200).json({
        id: session.id,
        code_acces: session.code_acces,
        statut: session.statut,
        numero_manche_courante: session.numero_manche_courante,
    });
}

export async function listerManches(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    const manches = await manchesDeLaSession(id);

    return res.status(200).json(
        manches.map((manche) => ({
            numero_manche: manche.numero_manche,
            id_theme: manche.id_theme,
            libelle_theme: manche.theme?.libelle ?? null,
        }))
    );
}

export async function listerQuestionsDeLaManche(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);
    const numero = Number(req.params.numero);

    if (!Number.isInteger(id) || !Number.isInteger(numero)) {
        return res.status(400).json({erreur: "Identifiant de session ou numéro de manche invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    const questions = await questionsDeLaManche(id, numero);

    return res.status(200).json(
        questions.map((tirage) => ({
            ordre: tirage.ordre,
            id_question: tirage.id_question,
            enonce: tirage.question?.enonce ?? null,
        }))
    );
}

export async function demarrerSession(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    try {
        const session = await demarrer(id, req.utilisateur.id);
        versSession(id,"session.demarree", presenterSessionPublique(session))
        return res.status(200).json(presenterSession(session));
    } catch (erreur) {
        const message = messageDe(erreur);

        if (message === "Session introuvable") {
            return res.status(404).json({erreur: message});
        }

        if (message.startsWith("Seul l'animateur")) {
            return res.status(403).json({erreur: message});
        }

        return res.status(409).json({erreur: message});
    }
}

export async function ouvrirFenetre(baseRequest: express.Request, res: express.Response) {
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
        const misAJour = await ouvrirFenetreCartes(id);

        versSession(id,'cartes.fenetre_ouverte',tempsJouer());
        return res.status(200).json(presenterSession(misAJour));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function fermerFenetre(baseRequest: express.Request, res: express.Response) {
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
        const misAJour = await fermerFenetreCartes(id);

        return res.status(200).json(presenterSession(misAJour));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function terminerSession(baseRequest: express.Request, res: express.Response) {
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
        const misAJour = await terminer(id);

        versSession(id, "session.terminee", presenterSessionPublique(misAJour));
        return res.status(200).json(presenterSession(misAJour));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function annulerSession(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    try {
        const misAJour = await annuler(id, req.utilisateur.id);

        return res.status(200).json(presenterSession(misAJour));
    } catch (erreur) {
        const message = messageDe(erreur);

        if (message === "Session introuvable") {
            return res.status(404).json({erreur: message});
        }

        if (message.startsWith("Seul l'animateur")) {
            return res.status(403).json({erreur: message});
        }

        return res.status(409).json({erreur: message});
    }
}
