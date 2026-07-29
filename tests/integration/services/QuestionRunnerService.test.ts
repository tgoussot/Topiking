import { describe, it, expect } from "@jest/globals";
import {
    masquerReponse,
    dureeDeBaseMs,
    calculerDureeTimerMs,
    questionAPoser,
    ouvrirQuestion,
    questionPourJoueur,
    enregistrerReponse,
    enregistrerAbsents,
    cloturerQuestion,
    mancheTerminee,
    cloturerManche,
    passerAMancheSuivante,
} from "../../../src/services/QuestionRunnerService";
import { Session } from "../../../src/entities/Session";
import { Question } from "../../../src/entities/Question";
import { Participant } from "../../../src/entities/Participant";
import { ReponseParticipant } from "../../../src/entities/ReponseParticipant";
import {
    creerOrganisation,
    creerUtilisateur,
    creerSession,
    creerThemeAvecQuestions,
    creerSessionTheme,
    creerSessionQuestion,
    creerParticipants,
    creerCarte,
    creerReceptionCarte,
    creerReponse,
} from "../../helpers/fixtures";

// Barème redéclaré : un changement du service doit faire échouer ces tests.
const POINTS_BONNE_REPONSE = 100;
const BONUS_RAPIDITE_MAX = 50;
const BONUS_CARTE_ELAN = 25;

const DUREE_S = 10;
const DUREE_MS = DUREE_S * 1000;

// setupIntegration ne vide les tables qu'AVANT chaque test : les lignes du
// dernier test d'un fichier survivent à la suite. Des slugs et emails uniques
// à chaque appel évitent que ce reliquat ne fasse échouer l'exécution suivante.
let compteurLocal = 0;

async function creerAnimateur(): Promise<{ idOrganisation: number; idAnimateur: number }> {
    compteurLocal = compteurLocal + 1;

    const marqueur = `qrs-${process.pid}-${compteurLocal}`;

    const organisation = await creerOrganisation({ slug: marqueur });
    const animateur = await creerUtilisateur(organisation.id, { email: `${marqueur}@exemple.fr` });

    return { idOrganisation: organisation.id, idAnimateur: animateur.id };
}

type Contexte = {
    session: Session;
    questions: Question[];
    participants: Participant[];
};

// Session "en_cours", manche 1 tirée dans l'ordre des questions du thème,
// et deux joueurs. Point de départ commun à presque tous les tests.
async function preparerPartie(nombreQuestions: number = 3): Promise<Contexte> {
    const { idOrganisation, idAnimateur } = await creerAnimateur();

    const { theme, questions } = await creerThemeAvecQuestions(idOrganisation, nombreQuestions);

    const session = await creerSession(idAnimateur, {
        statut: "en_cours",
        date_debut: new Date(),
        numero_manche_courante: 1,
    });

    await creerSessionTheme(session.id, theme.id, 1);

    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];

        if (question === undefined) {
            continue;
        }

        await creerSessionQuestion(session.id, question.id, 1, i + 1);
    }

    const participants = await creerParticipants(session.id, [0, 0]);

    return { session, questions, participants };
}

// Ouvre une question en fixant l'instant de départ, pour que le temps de
// réponse mesuré par le service soit déterministe.
async function ouvrirAvecDepart(session: Session, question: Question, ecouleMs: number): Promise<void> {
    session.id_question_courante = question.id;
    session.date_debut_question = new Date(Date.now() - ecouleMs);

    await session.save();
}

function premiereQuestion(contexte: Contexte): Question {
    const question = contexte.questions[0];

    if (question === undefined) {
        throw new Error("Le contexte de test n'a aucune question");
    }

    return question;
}

function premierJoueur(contexte: Contexte): Participant {
    const joueur = contexte.participants[0];

    if (joueur === undefined) {
        throw new Error("Le contexte de test n'a aucun participant");
    }

    return joueur;
}

function secondJoueur(contexte: Contexte): Participant {
    const joueur = contexte.participants[1];

    if (joueur === undefined) {
        throw new Error("Le contexte de test n'a qu'un participant");
    }

    return joueur;
}


describe("masquerReponse", () => {
    it("renvoie les quatre propositions dans l'ordre naturel", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        const affichee = masquerReponse(question, 1, 1, DUREE_MS);

        expect(affichee.propositions).toEqual([
            question.proposition_1,
            question.proposition_2,
            question.proposition_3,
            question.proposition_4,
        ]);
    });

    it("n'expose pas la bonne réponse dans le payload", async () => {
        const contexte = await preparerPartie();

        const affichee = masquerReponse(premiereQuestion(contexte), 1, 1, DUREE_MS);

        expect(Object.keys(affichee)).not.toContain("index_bonne_reponse");
    });

    it("reprend l'identifiant, la manche, l'ordre et la durée du timer", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        const affichee = masquerReponse(question, 2, 3, 7000);

        expect(affichee).toMatchObject({
            idQuestion: question.id,
            numeroManche: 2,
            ordre: 3,
            dureeTimerMs: 7000,
        });
    });
});

describe("dureeDeBaseMs", () => {
    it("convertit la durée de la question en millisecondes", async () => {
        const contexte = await preparerPartie();

        expect(dureeDeBaseMs(premiereQuestion(contexte))).toBe(DUREE_MS);
    });
});

describe("calculerDureeTimerMs", () => {
    it("vaut la durée de base sans aucune carte", async () => {
        const contexte = await preparerPartie();

        const duree = await calculerDureeTimerMs(premiereQuestion(contexte), premierJoueur(contexte).id, 1);

        expect(duree).toBe(DUREE_MS);
    });

    it("ajoute le delta d'une carte d'ajout de temps", async () => {
        const contexte = await preparerPartie();

        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 5 });

        await creerReceptionCarte(premierJoueur(contexte).id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        const duree = await calculerDureeTimerMs(premiereQuestion(contexte), premierJoueur(contexte).id, 1);

        expect(duree).toBe(DUREE_MS + 5000);
    });

    it("ne descend jamais sous une seconde", async () => {
        const contexte = await preparerPartie();

        const carte = await creerCarte({ type: "malus", effet: "retrait_temps_s", intensite: 60 });

        await creerReceptionCarte(secondJoueur(contexte).id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: premierJoueur(contexte).id,
        });

        const duree = await calculerDureeTimerMs(premiereQuestion(contexte), premierJoueur(contexte).id, 1);

        expect(duree).toBe(1000);
    });
});

describe("questionAPoser", () => {
    it("retrouve la question tirée à l'ordre demandé", async () => {
        const contexte = await preparerPartie();
        const attendue = contexte.questions[1];

        const question = await questionAPoser(contexte.session.id, 1, 2);

        expect(question?.id).toBe(attendue?.id);
    });

    it("renvoie null pour un ordre inexistant", async () => {
        const contexte = await preparerPartie();

        expect(await questionAPoser(contexte.session.id, 1, 99)).toBeNull();
    });

    it("renvoie null pour une manche sans tirage", async () => {
        const contexte = await preparerPartie();

        expect(await questionAPoser(contexte.session.id, 2, 1)).toBeNull();
    });
});

describe("ouvrirQuestion", () => {
    it("mémorise la question courante, la manche et l'instant de départ", async () => {
        const contexte = await preparerPartie();

        await ouvrirQuestion(contexte.session.id, 1, 1);

        const rechargee = await Session.findOneBy({ id: contexte.session.id });

        expect(rechargee).toMatchObject({
            id_question_courante: premiereQuestion(contexte).id,
            numero_manche_courante: 1,
        });
        expect(rechargee?.date_debut_question).toBeInstanceOf(Date);
    });

    it("refuse d'ouvrir une question sur une session qui n'est pas en cours", async () => {
        const contexte = await preparerPartie();

        contexte.session.statut = "en_attente";
        await contexte.session.save();

        await expect(ouvrirQuestion(contexte.session.id, 1, 1)).rejects.toThrow("en_attente");
    });

    it("refuse d'ouvrir une question quand une autre est déjà ouverte", async () => {
        const contexte = await preparerPartie();

        await ouvrirQuestion(contexte.session.id, 1, 1);

        await expect(ouvrirQuestion(contexte.session.id, 1, 2)).rejects.toThrow("déjà ouverte");
    });

    it("refuse d'ouvrir une position sans question tirée", async () => {
        const contexte = await preparerPartie();

        await expect(ouvrirQuestion(contexte.session.id, 1, 99)).rejects.toThrow("Aucune question tirée");
    });

    it("renvoie un payload dépourvu de la bonne réponse", async () => {
        const contexte = await preparerPartie();

        const affichee = await ouvrirQuestion(contexte.session.id, 1, 1);

        expect(Object.keys(affichee)).not.toContain("index_bonne_reponse");
    });
});

describe("questionPourJoueur", () => {
    it("renvoie les quatre propositions", async () => {
        const contexte = await preparerPartie();

        const affichee = await questionPourJoueur(premierJoueur(contexte).id, contexte.session.id, 1, 1);

        expect(affichee.propositions).toHaveLength(4);
    });

    it("conserve l'ordre naturel des propositions sans carte", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        const affichee = await questionPourJoueur(premierJoueur(contexte).id, contexte.session.id, 1, 1);

        expect(affichee.propositions).toEqual([
            question.proposition_1,
            question.proposition_2,
            question.proposition_3,
            question.proposition_4,
        ]);
    });

    it("conserve les quatre propositions malgré un mélange, sans perte ni doublon", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        const carte = await creerCarte({ type: "malus", effet: "melange_propositions", intensite: 2 });

        await creerReceptionCarte(secondJoueur(contexte).id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: premierJoueur(contexte).id,
        });

        const affichee = await questionPourJoueur(premierJoueur(contexte).id, contexte.session.id, 1, 1);

        expect(affichee.propositions.slice().sort()).toEqual(
            [
                question.proposition_1,
                question.proposition_2,
                question.proposition_3,
                question.proposition_4,
            ].sort()
        );
    });

    it("répercute le delta d'une carte de temps sur la durée du timer", async () => {
        const contexte = await preparerPartie();

        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 5 });

        await creerReceptionCarte(premierJoueur(contexte).id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        const affichee = await questionPourJoueur(premierJoueur(contexte).id, contexte.session.id, 1, 1);

        expect(affichee.dureeTimerMs).toBe(DUREE_MS + 5000);
    });

    it("rejette une position sans question tirée", async () => {
        const contexte = await preparerPartie();

        await expect(
            questionPourJoueur(premierJoueur(contexte).id, contexte.session.id, 1, 99)
        ).rejects.toThrow("Aucune question tirée");
    });
});

describe("enregistrerReponse", () => {
    it("rejette un index de réponse inférieur à 1", async () => {
        const contexte = await preparerPartie();

        await expect(
            enregistrerReponse(premierJoueur(contexte).id, premiereQuestion(contexte).id, 0)
        ).rejects.toThrow("entre 1 et 4");
    });

    it("rejette un index de réponse supérieur à 4", async () => {
        const contexte = await preparerPartie();

        await expect(
            enregistrerReponse(premierJoueur(contexte).id, premiereQuestion(contexte).id, 5)
        ).rejects.toThrow("entre 1 et 4");
    });

    it("rejette un participant inexistant", async () => {
        const contexte = await preparerPartie();

        await expect(enregistrerReponse(999, premiereQuestion(contexte).id, 1)).rejects.toThrow(
            "Participant introuvable"
        );
    });

    it("rejette une question qui n'est pas la question courante", async () => {
        const contexte = await preparerPartie();

        await ouvrirQuestion(contexte.session.id, 1, 1);

        const autre = contexte.questions[1];

        await expect(
            enregistrerReponse(premierJoueur(contexte).id, autre?.id ?? 0, 1)
        ).rejects.toThrow("n'est pas ouverte");
    });

    it("rejette une réponse quand le timer n'a pas démarré", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        contexte.session.id_question_courante = question.id;
        contexte.session.date_debut_question = null;
        await contexte.session.save();

        await expect(enregistrerReponse(premierJoueur(contexte).id, question.id, 1)).rejects.toThrow(
            "n'a pas démarré"
        );
    });

    it("rejette une réponse arrivée après l'expiration du timer", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await ouvrirAvecDepart(contexte.session, question, DUREE_MS + 5000);

        await expect(enregistrerReponse(premierJoueur(contexte).id, question.id, 1)).rejects.toThrow(
            "Trop tard"
        );
    });

    it("rejette une seconde réponse à la même question", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await ouvrirAvecDepart(contexte.session, question, 1000);

        await enregistrerReponse(premierJoueur(contexte).id, question.id, 1);

        await expect(enregistrerReponse(premierJoueur(contexte).id, question.id, 2)).rejects.toThrow(
            "déjà répondu"
        );
    });

    it("enregistre la réponse choisie, le temps et les points", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await ouvrirAvecDepart(contexte.session, question, 2000);

        const reponse = await enregistrerReponse(premierJoueur(contexte).id, question.id, 3);

        const enregistree = await ReponseParticipant.findOneBy({ id: reponse.id });

        expect(enregistree).toMatchObject({
            reponse_choisie: 3,
            points: 0,
        });
        expect(enregistree?.temps_reponse_ms).toBeGreaterThanOrEqual(2000);
    });

    it("attribue les points de base et le bonus de rapidité à une bonne réponse", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        // Départ reculé de la moitié du timer : la réponse vaut donc la moitié
        // du bonus de rapidité. Les quelques millisecondes d'exécution en plus
        // écartent le résultat d'au plus un point, d'où la tolérance.
        await ouvrirAvecDepart(contexte.session, question, DUREE_MS / 2);

        const reponse = await enregistrerReponse(
            premierJoueur(contexte).id,
            question.id,
            question.index_bonne_reponse
        );

        expect(reponse.points).toBeGreaterThan(POINTS_BONNE_REPONSE + BONUS_RAPIDITE_MAX / 2 - 3);
        expect(reponse.points).toBeLessThanOrEqual(POINTS_BONNE_REPONSE + BONUS_RAPIDITE_MAX / 2);
    });

    it("n'attribue aucun point à une mauvaise réponse", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await ouvrirAvecDepart(contexte.session, question, 1000);

        const mauvaise = question.index_bonne_reponse === 1 ? 2 : 1;

        const reponse = await enregistrerReponse(premierJoueur(contexte).id, question.id, mauvaise);

        expect(reponse.points).toBe(0);
    });

    it("reporte les points gagnés sur le score total du participant", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);
        const joueur = premierJoueur(contexte);

        await ouvrirAvecDepart(contexte.session, question, 1000);

        const reponse = await enregistrerReponse(joueur.id, question.id, question.index_bonne_reponse);

        const rechargé = await Participant.findOneBy({ id: joueur.id });

        expect(rechargé?.score_total).toBe(reponse.points);
    });

    it("ajoute le bonus Élan quand une carte d'ajout de points est active", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        const carte = await creerCarte({
            type: "bonus",
            effet: "ajout_points",
            intensite: BONUS_CARTE_ELAN,
        });

        await creerReceptionCarte(premierJoueur(contexte).id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        await ouvrirAvecDepart(contexte.session, question, DUREE_MS / 2);

        const reponse = await enregistrerReponse(
            premierJoueur(contexte).id,
            question.id,
            question.index_bonne_reponse
        );

        // Le second joueur répond au même instant du timer, sans carte : l'écart
        // entre les deux scores isole le seul apport de l'Élan.
        const temoin = await enregistrerReponse(
            secondJoueur(contexte).id,
            question.id,
            question.index_bonne_reponse
        );

        expect(reponse.points - temoin.points).toBe(BONUS_CARTE_ELAN);
    });
});

describe("enregistrerAbsents", () => {
    it("crée une réponse à zéro point pour chaque joueur silencieux", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await enregistrerAbsents(contexte.session.id, question.id);

        const absente = await ReponseParticipant.findOneBy({
            id_participant: premierJoueur(contexte).id,
            id_question: question.id,
        });

        expect(absente?.points).toBe(0);
    });

    it("laisse la réponse choisie à null pour un absent", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await enregistrerAbsents(contexte.session.id, question.id);

        const absente = await ReponseParticipant.findOneBy({
            id_participant: premierJoueur(contexte).id,
            id_question: question.id,
        });

        expect(absente?.reponse_choisie).toBeNull();
    });

    it("ne touche pas aux réponses déjà enregistrées", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await creerReponse(premierJoueur(contexte).id, question.id, { points: 140 });

        await enregistrerAbsents(contexte.session.id, question.id);

        const conservee = await ReponseParticipant.findOneBy({
            id_participant: premierJoueur(contexte).id,
            id_question: question.id,
        });

        expect(conservee?.points).toBe(140);
    });

    it("renvoie le nombre d'absents enregistrés", async () => {
        const contexte = await preparerPartie();
        const question = premiereQuestion(contexte);

        await creerReponse(premierJoueur(contexte).id, question.id);

        expect(await enregistrerAbsents(contexte.session.id, question.id)).toBe(1);
    });
});

describe("cloturerQuestion", () => {
    it("libère la question courante et l'instant de départ", async () => {
        const contexte = await preparerPartie();

        await ouvrirQuestion(contexte.session.id, 1, 1);

        await cloturerQuestion(contexte.session.id);

        const rechargee = await Session.findOneBy({ id: contexte.session.id });

        expect(rechargee).toMatchObject({
            id_question_courante: null,
            date_debut_question: null,
        });
    });

    it("renvoie la correction de la question clôturée", async () => {
        const { idOrganisation, idAnimateur } = await creerAnimateur();

        const { theme, questions } = await creerThemeAvecQuestions(idOrganisation, 1);

        const question = questions[0];

        if (question === undefined) {
            throw new Error("Le thème de test n'a aucune question");
        }

        question.explication = "Parce que c'est ainsi";
        await question.save();

        const session = await creerSession(idAnimateur, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });

        await creerSessionTheme(session.id, theme.id, 1);
        await creerSessionQuestion(session.id, question.id, 1, 1);

        await ouvrirQuestion(session.id, 1, 1);

        const correction = await cloturerQuestion(session.id);

        expect(correction).toEqual({
            idQuestion: question.id,
            indexBonneReponse: question.index_bonne_reponse,
            explication: "Parce que c'est ainsi",
        });
    });

    it("enregistre les absents au passage", async () => {
        const contexte = await preparerPartie();

        await ouvrirQuestion(contexte.session.id, 1, 1);

        await cloturerQuestion(contexte.session.id);

        const nombreReponses = await ReponseParticipant.countBy({
            id_question: premiereQuestion(contexte).id,
        });

        expect(nombreReponses).toBe(contexte.participants.length);
    });

    it("rejette la clôture quand aucune question n'est ouverte", async () => {
        const contexte = await preparerPartie();

        await expect(cloturerQuestion(contexte.session.id)).rejects.toThrow("Aucune question ouverte");
    });
});

describe("mancheTerminee", () => {
    it("renvoie false tant qu'une question de la manche n'a aucune réponse", async () => {
        const contexte = await preparerPartie();

        await creerReponse(premierJoueur(contexte).id, premiereQuestion(contexte).id);

        expect(await mancheTerminee(contexte.session.id, 1)).toBe(false);
    });

    it("renvoie true quand chaque question a au moins une réponse", async () => {
        const contexte = await preparerPartie();

        for (let i = 0; i < contexte.questions.length; i++) {
            const question = contexte.questions[i];

            if (question === undefined) {
                continue;
            }

            await creerReponse(premierJoueur(contexte).id, question.id);
        }

        expect(await mancheTerminee(contexte.session.id, 1)).toBe(true);
    });
});

// Répond à toutes les questions de la manche 1 pour le premier joueur.
async function repondreToutelaManche(contexte: Contexte): Promise<void> {
    for (let i = 0; i < contexte.questions.length; i++) {
        const question = contexte.questions[i];

        if (question === undefined) {
            continue;
        }

        await creerReponse(premierJoueur(contexte).id, question.id);
    }
}

describe("cloturerManche", () => {
    it("rejette la clôture d'une partie qui n'a pas démarré", async () => {
        const contexte = await preparerPartie();

        contexte.session.numero_manche_courante = null;
        await contexte.session.save();

        await expect(cloturerManche(contexte.session.id)).rejects.toThrow("n'a pas démarré");
    });

    it("rejette la clôture tant qu'une question est ouverte", async () => {
        const contexte = await preparerPartie();

        await ouvrirQuestion(contexte.session.id, 1, 1);

        await expect(cloturerManche(contexte.session.id)).rejects.toThrow("encore ouverte");
    });

    it("rejette la clôture si toutes les questions n'ont pas été posées", async () => {
        const contexte = await preparerPartie();

        await creerReponse(premierJoueur(contexte).id, premiereQuestion(contexte).id);

        await expect(cloturerManche(contexte.session.id)).rejects.toThrow("n'ont pas été posées");
    });

    it("ouvre la fenêtre de jeu des cartes après distribution", async () => {
        const contexte = await preparerPartie();

        await creerCarte({ type: "malus", effet: "retrait_temps_s", intensite: 5 });
        await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 5 });

        await repondreToutelaManche(contexte);

        await cloturerManche(contexte.session.id);

        const rechargee = await Session.findOneBy({ id: contexte.session.id });

        expect(rechargee?.date_debut_fenetre_cartes).toBeInstanceOf(Date);
    });

    it("renvoie le classement et les cartes distribuées", async () => {
        const contexte = await preparerPartie();

        await creerCarte({ type: "malus", effet: "retrait_temps_s", intensite: 5 });
        await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 5 });

        await repondreToutelaManche(contexte);

        const distribution = await cloturerManche(contexte.session.id);

        expect(distribution.classement).toHaveLength(contexte.participants.length);
        expect(distribution.malusAuPremier?.id_participant).toBe(premierJoueur(contexte).id);
        expect(distribution.bonusAuDernier?.id_participant).toBe(secondJoueur(contexte).id);
    });
});

describe("passerAMancheSuivante", () => {
    it("incrémente le numéro de manche courante", async () => {
        const contexte = await preparerPartie();

        const session = await passerAMancheSuivante(contexte.session.id);

        expect(session.numero_manche_courante).toBe(2);
    });

    it("remet l'instant d'ouverture de la fenêtre de cartes à null", async () => {
        const contexte = await preparerPartie();

        // Fenêtre ouverte il y a longtemps : elle est donc déjà écoulée.
        contexte.session.date_debut_fenetre_cartes = new Date(Date.now() - 3600 * 1000);
        await contexte.session.save();

        const session = await passerAMancheSuivante(contexte.session.id);

        expect(session.date_debut_fenetre_cartes).toBeNull();
    });

    it("persiste en base la fermeture de la fenêtre de cartes", async () => {
        const contexte = await preparerPartie();

        contexte.session.date_debut_fenetre_cartes = new Date(Date.now() - 3600 * 1000);
        await contexte.session.save();

        await passerAMancheSuivante(contexte.session.id);

        // Le service ferme la fenêtre sur l'instance locale plutôt que d'appeler
        // fermerFenetreCartes : sans cela, le save() réécrirait l'ancienne date.
        const rechargee = await Session.findOneBy({ id: contexte.session.id });

        expect(rechargee?.date_debut_fenetre_cartes).toBeNull();
    });

    it("rejette le passage tant que la fenêtre de cartes est ouverte", async () => {
        const contexte = await preparerPartie();

        contexte.session.date_debut_fenetre_cartes = new Date();
        await contexte.session.save();

        await expect(passerAMancheSuivante(contexte.session.id)).rejects.toThrow("encore ouverte");
    });

    it("rejette le passage tant qu'une question est ouverte", async () => {
        const contexte = await preparerPartie();

        await ouvrirQuestion(contexte.session.id, 1, 1);

        await expect(passerAMancheSuivante(contexte.session.id)).rejects.toThrow(
            "Une question est encore ouverte"
        );
    });

    it("rejette le passage si la partie n'a pas démarré", async () => {
        const contexte = await preparerPartie();

        contexte.session.numero_manche_courante = null;
        await contexte.session.save();

        await expect(passerAMancheSuivante(contexte.session.id)).rejects.toThrow("n'a pas démarré");
    });
});
