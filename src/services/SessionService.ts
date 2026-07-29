import { In, EntityManager } from "typeorm";
import { AppDataSource } from "../data-source";
import { Session } from "../entities/Session";
import { SessionTheme } from "../entities/SessionTheme";
import { SessionQuestion } from "../entities/SessionQuestion";
import { Theme } from "../entities/Theme";
import { Question } from "../entities/Question";
import { Participant } from "../entities/Participant";
import { ReceptionCarte } from "../entities/ReceptionCarte";
import {
    NOMBRE_MANCHES,
    QUESTIONS_PAR_MANCHE,
    CODE_ACCES_MINIMUM,
    CODE_ACCES_MAXIMUM,
    TENTATIVES_CODE_ACCES,
    FENETRE_CARTES_S,
} from "../config";

const STATUTS_ACTIFS = ["en_attente", "en_cours"];
const PARTICIPANTS_MINIMUM = 2;


export async function genererCodeAcces(): Promise<number> {
    for (let essai = 0; essai < TENTATIVES_CODE_ACCES; essai++) {
        const etendue = CODE_ACCES_MAXIMUM - CODE_ACCES_MINIMUM + 1;
        const code = CODE_ACCES_MINIMUM + Math.floor(Math.random() * etendue);

        const dejaPris = await Session.findOneBy({
            code_acces: code,
            statut: In(STATUTS_ACTIFS),
        });

        if (dejaPris === null) {
            return code;
        }
    }

    throw new Error("Impossible de trouver un code d'accès libre");
}

export async function verifierThemes(idsThemes: number[], idOrganisation: number): Promise<Theme[]> {
    if (idsThemes.length !== NOMBRE_MANCHES) {
        throw new Error(`Il faut choisir exactement ${NOMBRE_MANCHES} thèmes`);
    }

    // Deux manches ne peuvent pas porter sur le même thème.
    for (let i = 0; i < idsThemes.length; i++) {
        for (let j = i + 1; j < idsThemes.length; j++) {
            if (idsThemes[i] === idsThemes[j]) {
                throw new Error("Les thèmes choisis doivent être différents");
            }
        }
    }

    const themesValides: Theme[] = [];

    for (let i = 0; i < idsThemes.length; i++) {
        const idTheme = idsThemes[i];

        if (idTheme === undefined) {
            continue;
        }

        const theme = await Theme.findOneBy({ id: idTheme });

        if (theme === null) {
            throw new Error(`Thème ${idTheme} introuvable`);
        }

        // Sécu : une organisation ne joue que ses propres thèmes.
        if (theme.id_organisation !== idOrganisation) {
            throw new Error(`Thème ${idTheme} inaccessible pour cette organisation`);
        }

        if (theme.actif === false) {
            throw new Error(`Thème "${theme.libelle}" est désactivé`);
        }

        // Sans assez de questions, la manche ne pourrait pas aller au bout.
        const nombreQuestions = await Question.countBy({ id_theme: idTheme });

        if (nombreQuestions < QUESTIONS_PAR_MANCHE) {
            throw new Error(
                `Thème "${theme.libelle}" contient ${nombreQuestions} question(s), ` +
                `il en faut au moins ${QUESTIONS_PAR_MANCHE}`
            );
        }

        themesValides.push(theme);
    }

    return themesValides;
}

export function melangerQuestions(questions: Question[]): Question[] {
    const melange = [...questions];

    for (let i = melange.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        const temporaire = melange[i];
        const tire = melange[j];

        if (temporaire === undefined || tire === undefined) {
            continue;
        }

        melange[i] = tire;
        melange[j] = temporaire;
    }

    return melange;
}

// Tire au hasard les questions d'une manche et les enregistre.
export async function tirerQuestionsDeLaManche(idSession: number, idTheme: number, numeroManche: number, manager: EntityManager): Promise<SessionQuestion[]> {
    const disponibles = await manager.findBy(Question, { id_theme: idTheme });

    const melangees = melangerQuestions(disponibles);

    const tirees: SessionQuestion[] = [];

    for (let i = 0; i < QUESTIONS_PAR_MANCHE; i++) {
        const question = melangees[i];

        if (question === undefined) {
            continue;
        }

        const tirage = new SessionQuestion();
        tirage.id_session = idSession;
        tirage.id_question = question.id;
        tirage.numero_manche = numeroManche;
        tirage.ordre = i + 1;

        await manager.save(tirage);

        tirees.push(tirage);
    }

    return tirees;
}

export async function creer(idAnimateur: number, idOrganisation: number, idsThemes: number[]): Promise<Session> {
    await verifierThemes(idsThemes, idOrganisation);

    const codeAcces = await genererCodeAcces();

    // Transaction
    return await AppDataSource.transaction(async (manager) => {
        const session = new Session();
        session.code_acces = codeAcces;
        session.statut = "en_attente";
        session.date_debut = null;
        session.date_fin = null;
        session.id_question_courante = null;
        session.numero_manche_courante = null;
        session.date_debut_question = null;
        session.date_debut_fenetre_cartes = null;
        session.id_animateur = idAnimateur;

        await manager.save(session);

        // Une ligne SessionTheme par manche
        for (let i = 0; i < idsThemes.length; i++) {
            const idTheme = idsThemes[i];

            if (idTheme === undefined) {
                continue;
            }

            const numeroManche = i + 1;

            const manche = new SessionTheme();
            manche.id_session = session.id;
            manche.id_theme = idTheme;
            manche.numero_manche = numeroManche;

            await manager.save(manche);

            await tirerQuestionsDeLaManche(session.id, idTheme, numeroManche, manager);
        }

        return session;
    });
}

export async function trouverParCode(codeAcces: number): Promise<Session | null> {
    return await Session.findOneBy({
        code_acces: codeAcces,
        statut: In(STATUTS_ACTIFS),
    });
}


// Ouvre la fenêtre pendant laquelle les joueurs peuvent jouer leurs cartes.
export async function ouvrirFenetreCartes(idSession: number): Promise<Session> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.statut !== "en_cours") {
        throw new Error(`Impossible d'ouvrir la fenêtre : session ${session.statut}`);
    }

    // On ne joue pas ses cartes pendant qu'une question est en cours.
    if (session.id_question_courante !== null) {
        throw new Error("Une question est encore ouverte");
    }

    session.date_debut_fenetre_cartes = new Date();

    await session.save();

    return session;
}


// Ferme la fenêtre de jeu des cartes.
export async function fermerFenetreCartes(idSession: number): Promise<Session> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.statut !== "en_cours") {
        throw new Error(`Impossible de fermer la fenêtre : session ${session.statut}`);
    }

    session.date_debut_fenetre_cartes = null;

    await session.save();

    return session;
}


// Dit si la fenêtre de jeu des cartes est ouverte en ce moment.
export function fenetreCartesOuverte(session: Session): boolean {
    if (session.date_debut_fenetre_cartes === null) {
        return false;
    }

    const maintenant = new Date();

    const ecouleMs = maintenant.getTime() - session.date_debut_fenetre_cartes.getTime();

    return ecouleMs <= FENETRE_CARTES_S * 1000;
}


// Renvoie les questions tirées pour une manche, dans l'ordre où elles seront posées.
export async function questionsDeLaManche(idSession: number, numeroManche: number): Promise<SessionQuestion[]> {
    return await SessionQuestion.find({
        where: { id_session: idSession, numero_manche: numeroManche },
        order: { ordre: "ASC" },
        relations: { question: true },
    });
}


// Renvoie les thèmes d'une session
export async function manchesDeLaSession(idSession: number): Promise<SessionTheme[]> {
    return await SessionTheme.find({
        where: { id_session: idSession },
        order: { numero_manche: "ASC" },
        relations: { theme: true },
    });
}


// Lance la partie
export async function demarrer(idSession: number, idAnimateur: number): Promise<Session> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.id_animateur !== idAnimateur) {
        throw new Error("Seul l'animateur de la session peut la démarrer");
    }

    if (session.statut !== "en_attente") {
        throw new Error(`Session déjà ${session.statut}`);
    }

    const nombreParticipants = await Participant.countBy({ id_session: idSession });

    if (nombreParticipants < PARTICIPANTS_MINIMUM) {
        throw new Error(
            `Il faut au moins ${PARTICIPANTS_MINIMUM} participants pour démarrer ` +
            `(actuellement ${nombreParticipants})`
        );
    }

    session.statut = "en_cours";
    session.date_debut = new Date();
    session.numero_manche_courante = 1;

    await session.save();

    return session;
}


// Clôt la partie
export async function terminer(idSession: number): Promise<Session> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.statut === "terminee") {
        return session;
    }

    session.statut = "terminee";
    session.date_fin = new Date();
    session.id_question_courante = null;
    session.date_debut_question = null;
    session.date_debut_fenetre_cartes = null;

    await session.save();

    await expirerCartesNonJouees(idSession);

    return session;
}


// Annule une partie qui n'ira pas à son terme.
export async function annuler(idSession: number, idAnimateur: number): Promise<Session> {
    const session = await Session.findOneBy({ id: idSession });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.id_animateur !== idAnimateur) {
        throw new Error("Seul l'animateur de la session peut l'annuler");
    }

    if (session.statut === "terminee") {
        throw new Error("Session déjà terminée");
    }

    if (session.statut === "annulee") {
        return session;
    }

    session.statut = "annulee";
    session.date_fin = new Date();
    session.id_question_courante = null;
    session.date_debut_question = null;
    session.date_debut_fenetre_cartes = null;

    await session.save();

    await expirerCartesNonJouees(idSession);

    return session;
}

export async function expirerCartesNonJouees(idSession: number): Promise<number> {
    const participants = await Participant.findBy({ id_session: idSession });

    const idsParticipants: number[] = [];

    for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];

        if (participant === undefined) {
            continue;
        }

        idsParticipants.push(participant.id);
    }

    if (idsParticipants.length === 0) {
        return 0;
    }

    const resultat = await ReceptionCarte.createQueryBuilder()
        .update(ReceptionCarte)
        .set({ statut: "expiree" })
        .where("id_participant IN (:...ids)", { ids: idsParticipants })
        .andWhere("statut = :statut", { statut: "en_main" })
        .execute();

    return resultat.affected ?? 0;
}
