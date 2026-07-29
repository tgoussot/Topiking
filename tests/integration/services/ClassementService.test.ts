import { describe, it, expect } from "@jest/globals";
import { classementGeneral, classementDeLaManche } from "../../../src/services/ClassementService";
import { Session } from "../../../src/entities/Session";
import { Participant } from "../../../src/entities/Participant";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipant,
    creerParticipants,
    creerThemeAvecQuestions,
    creerSessionQuestion,
    creerReponse,
} from "../../helpers/fixtures";

// Session "en_cours" peuplée de N participants aux scores totaux imposés.
// L'ordre du tableau de scores fixe l'ordre de création, donc les identifiants.
async function creerPartieAvecScores(scores: number[]): Promise<{
    session: Session;
    participants: Participant[];
}> {
    const { animateur } = await creerContexteMinimal();
    const session = await creerSession(animateur.id);
    const participants = await creerParticipants(session.id, scores);

    return { session, participants };
}

describe("classementGeneral", () => {
    it("trie les participants par score total décroissant", async () => {
        const { session } = await creerPartieAvecScores([100, 300, 200]);

        const classement = await classementGeneral(session.id);

        expect(classement.map((p) => p.points)).toEqual([300, 200, 100]);
    });

    it("ne renvoie que les participants de la session demandée", async () => {
        const { session, participants } = await creerPartieAvecScores([100, 200]);

        const autre = await creerPartieAvecScores([500]);
        expect(autre.participants).toHaveLength(1);

        const classement = await classementGeneral(session.id);

        expect(classement.map((p) => p.idParticipant).sort((a, b) => a - b)).toEqual(
            participants.map((p) => p.id).sort((a, b) => a - b)
        );
    });

    it("renvoie un tableau vide pour une session sans participant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);

        expect(await classementGeneral(session.id)).toEqual([]);
    });

    it("départage les ex aequo par identifiant croissant", async () => {
        // tempsCumuleMs est forcé à 0 pour tous : seul l'identifiant tranche.
        const { session, participants } = await creerPartieAvecScores([200, 200, 200]);

        const classement = await classementGeneral(session.id);

        expect(classement.map((p) => p.idParticipant)).toEqual(participants.map((p) => p.id));
    });
});

describe("classementDeLaManche", () => {
    it("agrège les points des réponses aux questions de la manche", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 2);
        const joueur = await creerParticipant(session.id);

        const premiereQuestion = questions[0];
        const secondeQuestion = questions[1];

        if (premiereQuestion === undefined || secondeQuestion === undefined) {
            throw new Error("Les questions attendues n'ont pas été créées");
        }

        await creerSessionQuestion(session.id, premiereQuestion.id, 1, 1);
        await creerSessionQuestion(session.id, secondeQuestion.id, 1, 2);

        await creerReponse(joueur.id, premiereQuestion.id, { points: 100 });
        await creerReponse(joueur.id, secondeQuestion.id, { points: 250 });

        const classement = await classementDeLaManche(session.id, 1);

        expect(classement[0]?.points).toBe(350);
    });

    it("ignore les réponses aux questions d'une autre manche", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 2);
        const joueur = await creerParticipant(session.id);

        const questionManche1 = questions[0];
        const questionManche2 = questions[1];

        if (questionManche1 === undefined || questionManche2 === undefined) {
            throw new Error("Les questions attendues n'ont pas été créées");
        }

        await creerSessionQuestion(session.id, questionManche1.id, 1, 1);
        await creerSessionQuestion(session.id, questionManche2.id, 2, 1);

        await creerReponse(joueur.id, questionManche1.id, { points: 100 });
        await creerReponse(joueur.id, questionManche2.id, { points: 900 });

        const classement = await classementDeLaManche(session.id, 1);

        expect(classement[0]?.points).toBe(100);
    });

    it("cumule les temps de réponse de la manche", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 2);
        const joueur = await creerParticipant(session.id);

        const premiereQuestion = questions[0];
        const secondeQuestion = questions[1];

        if (premiereQuestion === undefined || secondeQuestion === undefined) {
            throw new Error("Les questions attendues n'ont pas été créées");
        }

        await creerSessionQuestion(session.id, premiereQuestion.id, 1, 1);
        await creerSessionQuestion(session.id, secondeQuestion.id, 1, 2);

        await creerReponse(joueur.id, premiereQuestion.id, { temps_reponse_ms: 1200 });
        await creerReponse(joueur.id, secondeQuestion.id, { temps_reponse_ms: 800 });

        const classement = await classementDeLaManche(session.id, 1);

        expect(classement[0]?.tempsCumuleMs).toBe(2000);
    });

    it("compte 0 point pour un participant qui n'a pas répondu", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 1);
        const muet = await creerParticipant(session.id);

        const question = questions[0];

        if (question === undefined) {
            throw new Error("La question attendue n'a pas été créée");
        }

        await creerSessionQuestion(session.id, question.id, 1, 1);

        const classement = await classementDeLaManche(session.id, 1);

        expect(classement[0]).toMatchObject({ idParticipant: muet.id, points: 0 });
    });

    it("place le joueur au plus grand nombre de points en tête", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 1);
        const faible = await creerParticipant(session.id);
        const fort = await creerParticipant(session.id);

        const question = questions[0];

        if (question === undefined) {
            throw new Error("La question attendue n'a pas été créée");
        }

        await creerSessionQuestion(session.id, question.id, 1, 1);

        await creerReponse(faible.id, question.id, { points: 50 });
        await creerReponse(fort.id, question.id, { points: 500 });

        const classement = await classementDeLaManche(session.id, 1);

        expect(classement.map((score) => score.idParticipant)).toEqual([fort.id, faible.id]);
    });

    it("départage deux joueurs à égalité de points par le temps cumulé", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 1);
        const lent = await creerParticipant(session.id);
        const rapide = await creerParticipant(session.id);

        const question = questions[0];

        if (question === undefined) {
            throw new Error("La question attendue n'a pas été créée");
        }

        await creerSessionQuestion(session.id, question.id, 1, 1);

        await creerReponse(lent.id, question.id, { points: 100, temps_reponse_ms: 9000 });
        await creerReponse(rapide.id, question.id, { points: 100, temps_reponse_ms: 1000 });

        const classement = await classementDeLaManche(session.id, 1);

        expect(classement.map((score) => score.idParticipant)).toEqual([rapide.id, lent.id]);
    });
});
