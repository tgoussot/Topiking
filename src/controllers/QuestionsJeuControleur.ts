import express from "express";
import {In} from "typeorm";
import {Session} from "../entities/Session";
import {Participant} from "../entities/Participant";
import {ReponseParticipant} from "../entities/ReponseParticipant";
import {RequeteAuthentifiee} from "../middlewares/VerifAuth";
import {NOMBRE_MANCHES} from "../config/config";
import {questionsDeLaManche} from "../services/Jeux/SessionService";
import {
    CorrectionQuestion,
    QuestionAffichee,
    cloturerManche,
    cloturerQuestion,
    enregistrerReponse,
    ouvrirQuestion,
    passerAMancheSuivante,
    questionPourJoueur,
} from "../services/Jeux/QuestionRunnerService";
import {DistributionManche} from "../services/Jeux/DistributionCarteService";
import {versParticipant, versSession} from "../websocket/Registre";

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

function presenterQuestionAffichee(question: QuestionAffichee) {
    return {
        id_question: question.idQuestion,
        numero_manche: question.numeroManche,
        ordre: question.ordre,
        enonce: question.enonce,
        propositions: question.propositions,
        duree_timer_ms: question.dureeTimerMs,
    };
}

function presenterCorrection(correction: CorrectionQuestion) {
    return {
        id_question: correction.idQuestion,
        index_bonne_reponse: correction.indexBonneReponse,
        explication: correction.explication,
    };
}

function presenterMonResultat(reponse: ReponseParticipant) {
    return {
        id_question: reponse.id_question,
        reponse_choisie: reponse.reponse_choisie,
        temps_reponse_ms: reponse.temps_reponse_ms,
        points: reponse.points,
    };
}

function presenterDistribution(distribution: DistributionManche) {
    return {
        numero_manche: distribution.numeroManche,
        classement: distribution.classement.map((score) => ({
            id_participant: score.idParticipant,
            pseudo: score.pseudo,
            points: score.points,
            temps_cumule_ms: score.tempsCumuleMs,
        })),
        malus_au_premier: distribution.malusAuPremier === null
            ? null
            : {
                id_reception: distribution.malusAuPremier.id,
                id_participant: distribution.malusAuPremier.id_participant,
                id_carte: distribution.malusAuPremier.id_carte,
            },
        bonus_au_dernier: distribution.bonusAuDernier === null
            ? null
            : {
                id_reception: distribution.bonusAuDernier.id,
                id_participant: distribution.bonusAuDernier.id_participant,
                id_carte: distribution.bonusAuDernier.id_carte,
            },
    };
}

function presenterDistributionPublic(distribution: DistributionManche) {
    return {
        numero_manche: distribution.numeroManche,
        classement: distribution.classement.map((score) => ({
            id_participant: score.idParticipant,
            pseudo: score.pseudo,
            points: score.points,
            temps_cumule_ms: score.tempsCumuleMs,
        })),
        malus_au_premier: distribution.malusAuPremier === null
            ? null
            : {
                id_participant: distribution.malusAuPremier.id_participant,
            },
        bonus_au_dernier: distribution.bonusAuDernier === null
            ? null
            : {
                id_participant: distribution.bonusAuDernier.id_participant,
            },
    };
}

export async function ouvrirQuestionCourante(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    const {numero_manche, ordre} = req.body;

    try {
        const question = await ouvrirQuestion(id, numero_manche, ordre);

        const participantSession = await Participant.find({ where: {id_session: id}})

        // Parallèle | recup info qst
        const data = await Promise.all(
            participantSession.map(p => questionPourJoueur(p.id, id, numero_manche, ordre))
        );

        const server_now = Date.now();
        for (let i = 0; i < participantSession.length; i++) {
            const participant = participantSession[i];
            if(!participant){
                continue;
            }
            const infoQuestion = data[i];
            if(!infoQuestion){
                continue;
            }
            // Prevenir les soucis d'heure
            versParticipant(id, participant.id, "question.ouverte", { ...presenterQuestionAffichee(infoQuestion), server_now })
        }
        return res.status(200).json(presenterQuestionAffichee(question));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function questionCouranteDuJoueur(req: express.Request, res: express.Response) {
    const idParticipant = Number(req.params.idParticipant);

    if (!Number.isInteger(idParticipant)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const participant = await Participant.findOneBy({id: idParticipant});

    if (!participant) {
        return res.status(404).json({erreur: "Participant introuvable"});
    }

    const session = await Session.findOneBy({id: participant.id_session});

    if (!session) {
        return res.status(404).json({erreur: "Session introuvable"});
    }

    if (session.id_question_courante === null || session.numero_manche_courante === null) {
        return res.status(409).json({erreur: "Aucune question ouverte"});
    }

    const tirage = await questionsDeLaManche(session.id, session.numero_manche_courante);

    let ordre: number | null = null;

    for (let i = 0; i < tirage.length; i++) {
        const ligne = tirage[i];

        if (ligne === undefined) {
            continue;
        }

        if (ligne.id_question === session.id_question_courante) {
            ordre = ligne.ordre;
        }
    }

    if (ordre === null) {
        return res.status(409).json({erreur: "Aucune question ouverte"});
    }

    try {
        const question = await questionPourJoueur(
            idParticipant,
            session.id,
            session.numero_manche_courante,
            ordre
        );

        return res.status(200).json(presenterQuestionAffichee(question));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function repondre(req: express.Request, res: express.Response) {
    const idParticipant = Number(req.params.idParticipant);

    if (!Number.isInteger(idParticipant)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const {id_question, index_choisi} = req.body;

    try {
        const reponse = await enregistrerReponse(idParticipant, id_question, index_choisi);

        return res.status(201).json({
            id: reponse.id,
            id_question: reponse.id_question,
            reponse_choisie: reponse.reponse_choisie,
            temps_reponse_ms: reponse.temps_reponse_ms,
        });
    } catch (erreur) {
        const message = messageDe(erreur);

        if (message === "La réponse doit être un index entre 1 et 4") {
            return res.status(400).json({erreur: message});
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

export async function cloturerQuestionCourante(baseRequest: express.Request, res: express.Response) {
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
        const correction = await cloturerQuestion(id);

        versSession(id, "question.cloturee", presenterCorrection(correction))

        // Le détail personnel part sur le canal privé : chacun ne voit que son propre score.
        // Filtre sur les participants de la session : une même question peut être tirée
        // par plusieurs sessions, ReponseParticipant ne porte que l'id de question.
        const participantsSession = await Participant.find({where: {id_session: id}});

        const reponses = await ReponseParticipant.find({
            where: {
                id_question: correction.idQuestion,
                id_participant: In(participantsSession.map((participant) => participant.id)),
            },
        });

        for (const reponse of reponses) {
            versParticipant(
                id,
                reponse.id_participant,
                "question.mon_resultat",
                presenterMonResultat(reponse)
            );
        }

        return res.status(200).json(presenterCorrection(correction));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function cloturerMancheCourante(baseRequest: express.Request, res: express.Response) {
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
        const distribution = await cloturerManche(id);

        versSession(id, "manche.cloturee", presenterDistributionPublic(distribution))

        return res.status(200).json(presenterDistribution(distribution));
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function mancheSuivante(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de session invalide"});
    }

    const session = await sessionDeLAnimateur(id, req.utilisateur.id, res);
    if (!session) {
        return;
    }

    if (session.numero_manche_courante !== null && session.numero_manche_courante >= NOMBRE_MANCHES) {
        return res.status(409).json({
            erreur: `La dernière manche est jouée, terminez la partie ou lancez une mort subite`,
        });
    }

    try {
        const misAJour = await passerAMancheSuivante(id);

        return res.status(200).json({
            id: misAJour.id,
            statut: misAJour.statut,
            numero_manche_courante: misAJour.numero_manche_courante,
        });
    } catch (erreur) {
        return res.status(409).json({erreur: messageDe(erreur)});
    }
}

export async function listerMesReponses(req: express.Request, res: express.Response) {
    const idParticipant = Number(req.params.idParticipant);

    if (!Number.isInteger(idParticipant)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const participant = await Participant.findOneBy({id: idParticipant});

    if (!participant) {
        return res.status(404).json({erreur: "Participant introuvable"});
    }

    const reponses = await ReponseParticipant.find({
        where: {id_participant: idParticipant},
        order: {id: "ASC"},
    });

    return res.status(200).json(
        reponses.map((reponse) => ({
            id: reponse.id,
            id_question: reponse.id_question,
            reponse_choisie: reponse.reponse_choisie,
            temps_reponse_ms: reponse.temps_reponse_ms,
            points: reponse.points,
        }))
    );
}
