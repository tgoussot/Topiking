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
import { rejoindreSession, quitterSession } from "../../../src/controllers/ParticipantsControleur";
import { demarrerSession, ouvrirFenetre, terminerSession } from "../../../src/controllers/SessionsControleur";
import {
    ouvrirQuestionCourante,
    cloturerQuestionCourante,
    cloturerMancheCourante,
} from "../../../src/controllers/QuestionsJeuControleur";
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
        cookie: () => undefined,
        send: () => undefined,
    } as unknown as Response;
}

function fabriquerRequeteAuth(
    utilisateur: Utilisateur,
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): RequeteAuthentifiee {
    return { body, params, utilisateur } as unknown as RequeteAuthentifiee;
}

function fabriquerRequete(
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): Request {
    return { body, params } as unknown as Request;
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

describe("Évènements WebSocket — la couverture des 9", () => {
    let serveur: ServeurDeTest;
    let sockets: WebSocket[] = [];

    beforeEach(async () => {
        serveur = await demarrerServeurDeTest();
    });

    afterEach(async () => {
        await fermerSockets(sockets.splice(0));
        await arreterServeurDeTest(serveur);
    });

    it("participant.rejoint annonce le second joueur à celui déjà connecté", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const [premier] = await creerParticipants(session.id, [0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(premier!)));
        sockets = [ws];

        const attendu = attendreMessage(ws, "participant.rejoint");
        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "SecondJoueur" }),
            fabriquerReponse()
        );
        const message = await attendu;

        expect(message.type).toBe("participant.rejoint");
        const donnees = message.donnees as { pseudo: string; id_session: number };
        expect(donnees.pseudo).toBe("SecondJoueur");
        expect(donnees.id_session).toBe(session.id);
    });

    it("participant.parti porte l'id du partant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const [restant, partant] = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(restant!)));
        sockets = [ws];

        const attendu = attendreMessage(ws, "participant.parti");
        await quitterSession(
            fabriquerRequete({}, { idParticipant: String(partant!.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        expect(message.donnees).toEqual({ id: partant!.id });
    });

    it("session.demarree part sur le canal session au démarrage", async () => {
        const { animateur } = await creerContexteMinimal();
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

        expect(message.type).toBe("session.demarree");
    });

    it("question.ouverte arrive sur le canal PRIVÉ de chaque joueur", async () => {
        const decor = await preparerDecorSocket(serveur);
        sockets = decor.sockets;

        const attendus = decor.sockets.map((ws) => attendreMessage(ws, "question.ouverte"));
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );
        const messages = await Promise.all(attendus);

        for (const message of messages) {
            expect(message.type).toBe("question.ouverte");
        }
    });

    it("question.cloturee part sur le canal session à la clôture", async () => {
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

        expect(message.type).toBe("question.cloturee");
    });

    it("manche.cloturee part sur le canal session en fin de manche", async () => {
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

        expect(message.type).toBe("manche.cloturee");
    });

    it("cartes.fenetre_ouverte porte duree_ms, un nombre positif", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        const joueurs = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurs[0]!)));
        sockets = [ws];

        const attendu = attendreMessage(ws, "cartes.fenetre_ouverte");
        await ouvrirFenetre(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        const donnees = message.donnees as { duree_ms: number };
        expect(typeof donnees.duree_ms).toBe("number");
        expect(donnees.duree_ms).toBeGreaterThan(0);
    });

    it("carte.jouee part sur le canal session quand une carte est jouée", async () => {
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

        expect(message.type).toBe("carte.jouee");
    });

    it("session.terminee porte le statut terminee", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        const joueurs = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurs[0]!)));
        sockets = [ws];

        const attendu = attendreMessage(ws, "session.terminee");
        await terminerSession(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );
        const message = await attendu;

        const donnees = message.donnees as { statut: string };
        expect(donnees.statut).toBe("terminee");
    });
});
