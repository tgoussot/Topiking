import { Not, In } from "typeorm";
import { Session } from "../entities/Session";
import { Question } from "../entities/Question";
import { Theme } from "../entities/Theme";
import { Participant } from "../entities/Participant";
import { SessionQuestion } from "../entities/SessionQuestion";
import { ReponseParticipant } from "../entities/ReponseParticipant";
import { classementGeneral, exAequoEnTete, ScoreParticipant } from "./ClassementService";
import { melangerQuestions } from "./SessionService";
import { NOMBRE_MANCHES } from "../config";

export const MANCHE_MORT_SUBITE = NOMBRE_MANCHES + 1;

export type ResultatMortSubite = {
    idQuestion: number;
    idVainqueur: number | null;
    pseudoVainqueur: string | null;
};

export async function egaliteEnTete(idSession: number): Promise<ScoreParticipant[]> {
    const classement = await classementGeneral(idSession);

    const exAequo = exAequoEnTete(classement);

    // Un seul joueur en tête
    if (exAequo.length < 2) {
        return [];
    }

    return exAequo;
}


// Identifiants des questions déjà tirées dans cette session.
export async function questionsDejaPosees(idSession: number): Promise<number[]> {
    const tirages = await SessionQuestion.findBy({ id_session: idSession });

    const ids: number[] = [];

    for (let i = 0; i < tirages.length; i++) {
        const tirage = tirages[i];

        if (tirage === undefined) {
            continue;
        }

        ids.push(tirage.id_question);
    }

    return ids;
}


// Nouvelle question@
export async function choisirQuestionInedite(idSession: number): Promise<Question | null> {
    const dejaPosees = await questionsDejaPosees(idSession);

    const tirages = await SessionQuestion.find({
        where: { id_session: idSession },
        relations: { question: true },
    });

    // Thèmes sur lesquels la partie a porté.
    const idsThemes: number[] = [];

    for (let i = 0; i < tirages.length; i++) {
        const tirage = tirages[i];

        if (tirage === undefined) {
            continue;
        }

        let connu = false;

        for (let j = 0; j < idsThemes.length; j++) {
            if (idsThemes[j] === tirage.question.id_theme) {
                connu = true;
            }
        }

        if (connu === false) {
            idsThemes.push(tirage.question.id_theme);
        }
    }

    if (idsThemes.length === 0) {
        return null;
    }

    const candidates = await Question.find({
        where: {
            id_theme: In(idsThemes),
            id: dejaPosees.length > 0 ? Not(In(dejaPosees)) : undefined,
        },
    });

    if (candidates.length > 0) {
        const melangees = melangerQuestions(candidates);

        const choisie = melangees[0];

        if (choisie !== undefined) {
            return choisie;
        }
    }

    return await choisirDansOrganisation(idSession, dejaPosees);
}


// Cherche une question inédite (orga)
export async function choisirDansOrganisation(idSession: number, dejaPosees: number[]): Promise<Question | null> {
    const session = await Session.findOne({
        where: { id: idSession },
        relations: { animateur: true },
    });

    if (session === null) {
        return null;
    }

    const themes = await Theme.findBy({
        id_organisation: session.animateur.id_organisation,
        actif: true,
    });

    const idsThemes: number[] = [];

    for (let i = 0; i < themes.length; i++) {
        const theme = themes[i];

        if (theme === undefined) {
            continue;
        }

        idsThemes.push(theme.id);
    }

    if (idsThemes.length === 0) {
        return null;
    }

    const candidates = await Question.find({
        where: {
            id_theme: In(idsThemes),
            id: dejaPosees.length > 0 ? Not(In(dejaPosees)) : undefined,
        },
    });

    if (candidates.length === 0) {
        return null;
    }

    const melangees = melangerQuestions(candidates);

    const choisie = melangees[0];

    if (choisie === undefined) {
        return null;
    }

    return choisie;
}


// Ouvre la question de mort subite.
export async function ouvrirMortSubite(idSession: number): Promise<Question> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.statut !== "en_cours") {
        throw new Error(`Impossible de lancer une mort subite : session ${session.statut}`);
    }

    const exAequo = await egaliteEnTete(idSession);

    if (exAequo.length < 2) {
        throw new Error("Pas d'égalité en tête, la mort subite n'a pas lieu d'être");
    }

    const question = await choisirQuestionInedite(idSession);

    if (question === null) {
        throw new Error("Aucune question inédite disponible pour départager");
    }

    const tirage = new SessionQuestion();
    tirage.id_session = idSession;
    tirage.id_question = question.id;
    tirage.numero_manche = MANCHE_MORT_SUBITE;
    tirage.ordre = 1;

    await tirage.save();

    session.id_question_courante = question.id;
    session.numero_manche_courante = MANCHE_MORT_SUBITE;
    session.date_debut_question = new Date();

    await session.save();

    return question;
}


// Enregistre une réponse de mort subite.
export async function repondreMortSubite(
    idParticipant: number,
    idQuestion: number,
    indexChoisi: number
): Promise<ResultatMortSubite> {
    if (indexChoisi < 1 || indexChoisi > 4) {
        throw new Error("La réponse doit être un index entre 1 et 4");
    }

    const participant = await Participant.findOneBy({ id: idParticipant });

    if (participant === null) {
        throw new Error("Participant introuvable");
    }

    const session = await Session.findOneBy({ id: participant.id_session });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.id_question_courante !== idQuestion) {
        throw new Error("Cette question n'est pas ouverte");
    }

    if (session.date_debut_question === null) {
        throw new Error("Le timer de cette question n'a pas démarré");
    }

    const exAequo = await egaliteEnTete(participant.id_session);

    let concerne = false;

    for (let i = 0; i < exAequo.length; i++) {
        const joueur = exAequo[i];

        if (joueur === undefined) {
            continue;
        }

        if (joueur.idParticipant === idParticipant) {
            concerne = true;
        }
    }

    if (concerne === false) {
        throw new Error("Vous n'êtes pas concerné par ce départage");
    }

    const question = await Question.findOneBy({ id: idQuestion });

    if (question === null) {
        throw new Error("Question introuvable");
    }

    const dejaRepondu = await ReponseParticipant.findOneBy({
        id_participant: idParticipant,
        id_question: idQuestion,
    });

    if (dejaRepondu !== null) {
        throw new Error("Vous avez déjà répondu à cette question");
    }

    const vainqueur = await vainqueurMortSubite(participant.id_session, idQuestion);

    if (vainqueur !== null) {
        throw new Error("Le départage est déjà tranché");
    }

    const maintenant = new Date();
    const tempsReponseMs = maintenant.getTime() - session.date_debut_question.getTime();

    const estCorrect = indexChoisi === question.index_bonne_reponse;

    const reponse = new ReponseParticipant();
    reponse.id_participant = idParticipant;
    reponse.id_question = idQuestion;
    reponse.reponse_choisie = indexChoisi;
    reponse.temps_reponse_ms = tempsReponseMs;
    reponse.points = 0;

    await reponse.save();

    if (estCorrect === false) {
        return { idQuestion: idQuestion, idVainqueur: null, pseudoVainqueur: null };
    }

    return {
        idQuestion: idQuestion,
        idVainqueur: idParticipant,
        pseudoVainqueur: participant.pseudo,
    };
}


// Retrouve le premier joueur de CETTE session ayant répondu juste.
export async function vainqueurMortSubite(idSession: number, idQuestion: number): Promise<Participant | null> {
    const question = await Question.findOneBy({ id: idQuestion });

    if (question === null) {
        return null;
    }

    const reponses = await ReponseParticipant.find({
        where: { id_question: idQuestion, reponse_choisie: question.index_bonne_reponse },
        order: { temps_reponse_ms: "ASC" },
        relations: { participant: true },
    });

    for (let i = 0; i < reponses.length; i++) {
        const reponse = reponses[i];

        if (reponse === undefined) {
            continue;
        }

        if (reponse.participant.id_session === idSession) {
            return reponse.participant;
        }
    }

    return null;
}


export async function cloturerMortSubite(idSession: number): Promise<ResultatMortSubite> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.id_question_courante === null) {
        throw new Error("Aucune mort subite en cours");
    }

    const idQuestion = session.id_question_courante;

    const vainqueur = await vainqueurMortSubite(idSession, idQuestion);

    session.id_question_courante = null;
    session.date_debut_question = null;

    await session.save();

    if (vainqueur === null) {
        // Relancer
        return { idQuestion: idQuestion, idVainqueur: null, pseudoVainqueur: null };
    }

    return {
        idQuestion: idQuestion,
        idVainqueur: vainqueur.id,
        pseudoVainqueur: vainqueur.pseudo,
    };
}
