import { Session } from "../entities/Session";
import { Question } from "../entities/Question";
import { Participant } from "../entities/Participant";
import { ReponseParticipant } from "../entities/ReponseParticipant";
import { questionsDeLaManche, ouvrirFenetreCartes, fenetreCartesOuverte } from "./SessionService";
import { distribuerFinManche, DistributionManche } from "./DistributionCarteService";
import { calculerPoints } from "./ScoringService";
import { ajouterPoints } from "./ParticipantService";
import { effetsPourJoueur, appliquerDureeTimer, aBonusElan, preparerQuestionPourJoueur } from "./EffetsService";


export type QuestionAffichee = {
    idQuestion: number;
    numeroManche: number;
    ordre: number;
    enonce: string;
    propositions: string[];
    dureeTimerMs: number;
};


export type CorrectionQuestion = {
    idQuestion: number;
    indexBonneReponse: number;
    explication: string | null;
    // TODO : enrichir avec le détail par joueur (qui a répondu juste, combien de points),
    // quand un consommateur de l'API en aura besoin.
};


// Payload sans sol
export function masquerReponse(question: Question, numeroManche: number, ordre: number, dureeTimerMs: number): QuestionAffichee {
    const propositions: string[] = [];

    propositions.push(question.proposition_1);
    propositions.push(question.proposition_2);
    propositions.push(question.proposition_3);
    propositions.push(question.proposition_4);

    return {
        idQuestion: question.id,
        numeroManche: numeroManche,
        ordre: ordre,
        enonce: question.enonce,
        propositions: propositions,
        dureeTimerMs: dureeTimerMs,
    };
}


// Durée de base, sans aucune carte. Sert de référence commune.
export function dureeDeBaseMs(question: Question): number {
    return question.duree_s * 1000;
}


export async function calculerDureeTimerMs(question: Question, idParticipant: number, numeroManche: number): Promise<number> {
    const effets = await effetsPourJoueur(idParticipant, question, numeroManche);

    return appliquerDureeTimer(question, effets);
}


// Retrouve la question à l'ordre demandé dans une manche.
export async function questionAPoser(idSession: number, numeroManche: number, ordre: number): Promise<Question | null> {
    const tirage = await questionsDeLaManche(idSession, numeroManche);

    for (let i = 0; i < tirage.length; i++) {
        const ligne = tirage[i];

        if (ligne === undefined) {
            continue;
        }

        if (ligne.ordre === ordre) {
            return ligne.question;
        }
    }

    return null;
}

export async function ouvrirQuestion(idSession: number, numeroManche: number, ordre: number): Promise<QuestionAffichee> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.statut !== "en_cours") {
        throw new Error(`Impossible d'ouvrir une question : session ${session.statut}`);
    }

    if (session.id_question_courante !== null) {
        throw new Error("Une question est déjà ouverte, il faut la clôturer d'abord");
    }

    const question = await questionAPoser(idSession, numeroManche, ordre);

    if (question === null) {
        throw new Error(`Aucune question tirée en manche ${numeroManche}, position ${ordre}`);
    }

    session.id_question_courante = question.id;
    session.numero_manche_courante = numeroManche;
    session.date_debut_question = new Date();

    await session.save();

    // TODO : diffuser les payloads par WebSocket en une seule émission, pour que le timer parte du même instant pour tout le monde.
    // Attention : chaque joueur reçoit une version différente, ses cartes lui étant propres.
    return masquerReponse(question, numeroManche, ordre, dureeDeBaseMs(question));
}


// Qst pour joueur précis
export async function questionPourJoueur(idParticipant: number, idSession: number, numeroManche: number, ordre: number): Promise<QuestionAffichee> {
    const question = await questionAPoser(idSession, numeroManche, ordre);

    if (question === null) {
        throw new Error(`Aucune question tirée en manche ${numeroManche}, position ${ordre}`);
    }

    const prepare = await preparerQuestionPourJoueur(idParticipant, question, numeroManche);

    const affichee = masquerReponse(question, numeroManche, ordre, prepare.dureeTimerMs);

    // Les propositions sont réordonnées selon les cartes du joueur.
    const propositions: string[] = [];

    for (let i = 0; i < prepare.ordre.length; i++) {
        const index = prepare.ordre[i];

        if (index === undefined) {
            continue;
        }

        const texte = affichee.propositions[index - 1];

        if (texte === undefined) {
            continue;
        }

        propositions.push(texte);
    }

    affichee.propositions = propositions;

    return affichee;
}


export async function enregistrerReponse(idParticipant: number, idQuestion: number, indexChoisi: number): Promise<ReponseParticipant> {
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

    const question = await Question.findOneBy({ id: idQuestion });

    if (question === null) {
        throw new Error("Question introuvable");
    }

    const maintenant = new Date();
    const tempsReponseMs = maintenant.getTime() - session.date_debut_question.getTime();

    const numeroManche = session.numero_manche_courante ?? 1;

    const dureeTimerMs = await calculerDureeTimerMs(question, idParticipant, numeroManche);

    if (tempsReponseMs > dureeTimerMs) {
        throw new Error("Trop tard, le temps est écoulé");
    }

    const dejaRepondu = await ReponseParticipant.findOneBy({
        id_participant: idParticipant,
        id_question: idQuestion,
    });

    if (dejaRepondu !== null) {
        throw new Error("Vous avez déjà répondu à cette question");
    }

    const estCorrect = indexChoisi === question.index_bonne_reponse;

    const bonusElan = await aBonusElan(idParticipant, numeroManche);

    const points = calculerPoints({
        estCorrect: estCorrect,
        tempsReponseMs: tempsReponseMs,
        dureeTimerMs: dureeTimerMs,
        bonusElan: bonusElan,
    });

    const reponse = new ReponseParticipant();
    reponse.id_participant = idParticipant;
    reponse.id_question = idQuestion;
    reponse.reponse_choisie = indexChoisi;
    reponse.temps_reponse_ms = tempsReponseMs;
    reponse.points = points;

    await reponse.save();

    await ajouterPoints(idParticipant, points);

    return reponse;
}

export async function enregistrerAbsents(idSession: number, idQuestion: number): Promise<number> {
    const participants = await Participant.findBy({ id_session: idSession });

    let nombreAbsents = 0;

    for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];

        if (participant === undefined) {
            continue;
        }

        const reponse = await ReponseParticipant.findOneBy({
            id_participant: participant.id,
            id_question: idQuestion,
        });

        if (reponse !== null) {
            continue;
        }

        const absente = new ReponseParticipant();
        absente.id_participant = participant.id;
        absente.id_question = idQuestion;
        absente.reponse_choisie = null;
        absente.temps_reponse_ms = 0;
        absente.points = 0;

        await absente.save();

        nombreAbsents = nombreAbsents + 1;
    }

    return nombreAbsents;
}

export async function cloturerQuestion(idSession: number): Promise<CorrectionQuestion> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.id_question_courante === null) {
        throw new Error("Aucune question ouverte à clôturer");
    }

    const idQuestion = session.id_question_courante;

    const question = await Question.findOneBy({ id: idQuestion });

    if (question === null) {
        throw new Error("Question introuvable");
    }

    await enregistrerAbsents(idSession, idQuestion);

    session.id_question_courante = null;
    session.date_debut_question = null;

    await session.save();

    // TODO : diffuser la correction aux joueurs par WebSocket.
    return {
        idQuestion: question.id,
        indexBonneReponse: question.index_bonne_reponse,
        explication: question.explication ?? null,
    };
}


export async function mancheTerminee(idSession: number, numeroManche: number): Promise<boolean> {
    const tirage = await questionsDeLaManche(idSession, numeroManche);

    for (let i = 0; i < tirage.length; i++) {
        const ligne = tirage[i];

        if (ligne === undefined) {
            continue;
        }

        const nombreReponses = await ReponseParticipant.countBy({ id_question: ligne.id_question });

        if (nombreReponses === 0) {
            return false;
        }
    }

    return true;
}


// Clôt une manche
export async function cloturerManche(idSession: number): Promise<DistributionManche> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.numero_manche_courante === null) {
        throw new Error("La partie n'a pas démarré");
    }

    if (session.id_question_courante !== null) {
        throw new Error("Une question est encore ouverte");
    }

    const numeroManche = session.numero_manche_courante;

    const terminee = await mancheTerminee(idSession, numeroManche);

    if (terminee === false) {
        throw new Error(`Toutes les questions de la manche ${numeroManche} n'ont pas été posées`);
    }

    const distribution = await distribuerFinManche(idSession, numeroManche);

    await ouvrirFenetreCartes(idSession);

    // TODO : diffuser le classement de manche et les cartes distribuées par WebSocket.
    return distribution;
}


export async function passerAMancheSuivante(idSession: number): Promise<Session> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.numero_manche_courante === null) {
        throw new Error("La partie n'a pas démarré");
    }

    if (session.id_question_courante !== null) {
        throw new Error("Une question est encore ouverte");
    }

    if (fenetreCartesOuverte(session) === true) {
        throw new Error("La fenêtre de jeu des cartes est encore ouverte");
    }

    session.date_debut_fenetre_cartes = null;
    session.numero_manche_courante = session.numero_manche_courante + 1;

    await session.save();

    return session;
}
