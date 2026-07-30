import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { WebSocket } from "ws";
import type { Response } from "express";

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
import { ouvrirQuestionCourante } from "../../../src/controllers/QuestionsJeuControleur";
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

describe("Timer et équité — server_now et cartes de temps", () => {
    let serveur: ServeurDeTest;
    let sockets: WebSocket[] = [];

    beforeEach(async () => {
        serveur = await demarrerServeurDeTest();
    });

    afterEach(async () => {
        await fermerSockets(sockets.splice(0));
        await arreterServeurDeTest(serveur);
    });

    it("question.ouverte porte un server_now cohérent avec l'horloge serveur", async () => {
        const decor = await preparerDecorSocket(serveur, 1);
        sockets = decor.sockets;

        const attendu = attendreMessage(decor.sockets[0]!, "question.ouverte");

        const avant = Date.now();
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const apres = Date.now();

        const message = await attendu;
        const donnees = message.donnees as { server_now: number };

        expect(typeof donnees.server_now).toBe("number");
        expect(donnees.server_now).toBeGreaterThanOrEqual(avant);
        expect(donnees.server_now).toBeLessThanOrEqual(apres);
    });

    it("server_now est strictement identique pour tous les joueurs d'une même ouverture", async () => {
        const decor = await preparerDecorSocket(serveur, 3);
        sockets = decor.sockets;

        const attendus = decor.sockets.map((ws) => attendreMessage(ws, "question.ouverte"));

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );

        const messages = await Promise.all(attendus);

        const valeurs = messages.map((message) => (message.donnees as { server_now: number }).server_now);

        for (const valeur of valeurs) {
            expect(valeur).toBe(valeurs[0]);
        }
    });

    it("une carte Contre-la-montre réduit le timer du joueur ciblé, sans toucher celui d'un joueur sain", async () => {
        const decor = await preparerDecorSocket(serveur, 2);
        sockets = decor.sockets;

        const [joueurSain, joueurVise] = decor.joueurs;
        const [wsSain, wsVise] = decor.sockets;

        const carte = await creerCarte({
            type: "malus",
            effet: "retrait_temps_s",
            intensite: 5,
        });
        await creerReceptionCarte(joueurSain!.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueurVise!.id,
        });

        const attenduSain = attendreMessage(wsSain!, "question.ouverte");
        const attenduVise = attendreMessage(wsVise!, "question.ouverte");

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );

        const [messageSain, messageVise] = await Promise.all([attenduSain, attenduVise]);

        const donneesSain = messageSain.donnees as { duree_timer_ms: number };
        const donneesVise = messageVise.donnees as { duree_timer_ms: number };

        expect(donneesVise.duree_timer_ms).toBeLessThan(donneesSain.duree_timer_ms);
        expect(donneesSain.duree_timer_ms - donneesVise.duree_timer_ms).toBe(5000);
    });
});
