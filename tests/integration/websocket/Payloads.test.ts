import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { WebSocket } from "ws";
import type { Request, Response } from "express";

import {
    demarrerServeurDeTest,
    arreterServeurDeTest,
    ServeurDeTest,
    connecter,
    cookieParticipant,
    fermerSockets,
    attendreMessage,
} from "../../helpers/serveurTest";
import { genererTokenParticipant } from "../../../src/services/AuthService";
import {
    ouvrirQuestionCourante,
    cloturerQuestionCourante,
    cloturerMancheCourante,
} from "../../../src/controllers/QuestionsJeuControleur";
import { demarrerSession } from "../../../src/controllers/SessionsControleur";
import { jouerUneCarte } from "../../../src/controllers/CartesControleur";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { QUESTIONS_PAR_MANCHE } from "../../../src/config/config";
import {
    creerContexteMinimal,
    creerThemeAvecQuestions,
    creerSession,
    creerSessionTheme,
    creerSessionQuestion,
    creerParticipants,
    creerCarte,
    creerReceptionCarte,
} from "../../helpers/fixtures";

function fabriquerReponse() {
    return {
        status: () => ({ json: () => undefined }),
        json: () => undefined,
    } as unknown as Response;
}

function fabriquerRequeteAuth(
    utilisateur: Utilisateur,
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): RequeteAuthentifiee {
    return { body, params, utilisateur } as unknown as RequeteAuthentifiee;
}

async function preparerDecorSocket(serveur: ServeurDeTest, nombreJoueurs: number = 2) {
    const { organisation, animateur } = await creerContexteMinimal();
    const { theme, questions } = await creerThemeAvecQuestions(organisation.id);

    const session = await creerSession(animateur.id, {
        statut: "en_cours",
        numero_manche_courante: 1,
        date_debut: new Date(),
    });

    await creerSessionTheme(session.id, theme.id, 1);

    for (let i = 0; i < QUESTIONS_PAR_MANCHE; i++) {
        const question = questions[i];

        if (question === undefined) {
            continue;
        }

        await creerSessionQuestion(session.id, question.id, 1, i + 1);
    }

    const scores: number[] = [];
    for (let i = 0; i < nombreJoueurs; i++) {
        scores.push(0);
    }

    const joueurs = await creerParticipants(session.id, scores);

    const sockets: WebSocket[] = [];
    for (const joueur of joueurs) {
        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueur)));
        sockets.push(ws);
    }

    return { organisation, animateur, session, questions, joueurs, sockets };
}

describe("Payloads WebSocket — ce qui a le droit de circuler", () => {
    let serveur: ServeurDeTest;
    let sockets: WebSocket[] = [];

    beforeEach(async () => {
        serveur = await demarrerServeurDeTest();
    });

    afterEach(async () => {
        await fermerSockets(sockets.splice(0));
        await arreterServeurDeTest(serveur);
    });

    it("question.ouverte ne contient jamais index_bonne_reponse ni explication", async () => {
        const decor = await preparerDecorSocket(serveur);
        sockets = decor.sockets;

        const attendu = attendreMessage(decor.sockets[0]!, "question.ouverte");
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        const corps = JSON.stringify(message.donnees);

        expect(corps).not.toContain("index_bonne_reponse");
        expect(corps).not.toContain("explication");
    });

    it("question.ouverte porte 4 propositions et un timer positif", async () => {
        const decor = await preparerDecorSocket(serveur);
        sockets = decor.sockets;

        const attendu = attendreMessage(decor.sockets[0]!, "question.ouverte");
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        const donnees = message.donnees as { propositions: string[]; duree_timer_ms: number };

        expect(donnees.propositions).toHaveLength(4);
        expect(donnees.duree_timer_ms).toBeGreaterThan(0);
    });

    it("question.cloturee contient index_bonne_reponse", async () => {
        const decor = await preparerDecorSocket(serveur);
        sockets = decor.sockets;

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );

        const attendu = attendreMessage(decor.sockets[0]!, "question.cloturee");
        await cloturerQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        const donnees = message.donnees as { index_bonne_reponse: number };

        expect(donnees.index_bonne_reponse).toBeGreaterThanOrEqual(1);
        expect(donnees.index_bonne_reponse).toBeLessThanOrEqual(4);
    });

    it("session.demarree n'expose ni id_question_courante ni id_animateur", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurs = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurs[0]!)));
        sockets = [ws];

        const attendu = attendreMessage(ws, "session.demarree");
        await demarrerSession(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        const corps = JSON.stringify(message.donnees);

        expect(corps).not.toContain("id_question_courante");
        expect(corps).not.toContain("id_animateur");
        expect(organisation.id).toBeGreaterThan(0);
    });

    it("manche.cloturee n'expose pas id_carte", async () => {
        const decor = await preparerDecorSocket(serveur);
        sockets = decor.sockets;

        for (let ordre = 1; ordre <= QUESTIONS_PAR_MANCHE; ordre++) {
            await ouvrirQuestionCourante(
                fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre }, { id: String(decor.session.id) }),
                fabriquerReponse()
            );
            await cloturerQuestionCourante(
                fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
                fabriquerReponse()
            );
        }

        const attendu = attendreMessage(decor.sockets[0]!, "manche.cloturee");
        await cloturerMancheCourante(
            fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        const corps = JSON.stringify(message.donnees);

        expect(corps).not.toContain("id_carte");
    });

    it("carte.jouee expose id_carte et id_cible", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
            date_debut_fenetre_cartes: new Date(),
        });
        const joueurs = await creerParticipants(session.id, [300, 200, 100]);
        const malus = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, malus.id);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurs[1]!)));
        sockets = [ws];

        const attendu = attendreMessage(ws, "carte.jouee");
        await jouerUneCarte(
            {
                body: { id_reception: reception.id, id_cible: joueurs[1]!.id },
                params: { idParticipant: String(joueurs[0]!.id) },
            } as unknown as Request,
            fabriquerReponse()
        );
        const message = await attendu;

        const donnees = message.donnees as { cartes: Array<{ id_carte: number; id_cible: number | null }> };

        expect(donnees.cartes[0]?.id_carte).toBe(malus.id);
        expect(donnees.cartes[0]?.id_cible).toBe(joueurs[1]!.id);
    });

    it("chaque message respecte l'enveloppe { type, donnees } et un type de l'union TypeMessage", async () => {
        const typesMessageConnus = [
            "participant.rejoint",
            "participant.parti",
            "session.demarree",
            "question.ouverte",
            "question.cloturee",
            "question.mon_resultat",
            "manche.cloturee",
            "cartes.fenetre_ouverte",
            "carte.jouee",
            "session.terminee",
        ];

        expect(typesMessageConnus).toHaveLength(10);

        const decor = await preparerDecorSocket(serveur);
        sockets = decor.sockets;

        const ws = decor.sockets[0]!;

        const attenduOuverte = attendreMessage(ws, "question.ouverte");
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const messageOuverte = await attenduOuverte;

        const attenduCloturee = attendreMessage(ws, "question.cloturee");
        const attenduResultat = attendreMessage(ws, "question.mon_resultat");
        await cloturerQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const messageCloturee = await attenduCloturee;
        const messageResultat = await attenduResultat;

        for (const message of [messageOuverte, messageCloturee, messageResultat]) {
            expect(Object.keys(message).sort()).toEqual(["donnees", "type"]);
            expect(typesMessageConnus).toContain(message.type);
            expect(typeof message.donnees).toBe("object");
        }
    });
});
