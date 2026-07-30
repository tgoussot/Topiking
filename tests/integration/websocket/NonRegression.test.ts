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
import { sessionsEnregistrees } from "../../../src/websocket/Registre";
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
        status: () => ({ json: () => undefined, send: () => undefined }),
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

async function preparerDecor(
    serveur: ServeurDeTest | null,
    nombreJoueurs: number = 2
) {
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
    if (serveur) {
        for (const joueur of joueurs) {
            const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueur)));
            sockets.push(ws);
        }
    }

    return { organisation, animateur, session, questions, joueurs, sockets };
}

describe("la réponse HTTP de l'animateur est inchangée, sockets connectées", () => {
    let serveur: ServeurDeTest;
    let sockets: WebSocket[] = [];

    beforeEach(async () => {
        serveur = await demarrerServeurDeTest();
    });

    afterEach(async () => {
        await fermerSockets(sockets.splice(0));
        await arreterServeurDeTest(serveur);
    });

    it("rejoindreSession répond toujours 201 avec le participant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const [premier] = await creerParticipants(session.id, [0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(premier!)));
        sockets = [ws];

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            cookie: () => reponse,
            send: () => reponse,
        } as unknown as Response;

        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "SecondJoueur" }),
            reponse
        );

        expect(res.statut).toBe(201);
        const corps = res.corps as { id: number; pseudo: string; id_session: number };
        expect(corps.pseudo).toBe("SecondJoueur");
        expect(corps.id_session).toBe(session.id);
    });

    it("quitterSession répond toujours 204", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const [restant, partant] = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(restant!)));
        sockets = [ws];

        const res = { statut: 0 };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: () => reponse,
            send: () => reponse,
        } as unknown as Response;

        await quitterSession(fabriquerRequete({}, { idParticipant: String(partant!.id) }), reponse);

        expect(res.statut).toBe(204);
    });

    it("demarrerSession répond toujours 200 avec presenterSession", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurs = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurs[0]!)));
        sockets = [ws];

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await demarrerSession(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), reponse);

        expect(res.statut).toBe(200);
        const corps = res.corps as { statut: string; numero_manche_courante: number };
        expect(corps.statut).toBe("en_cours");
        expect(corps.numero_manche_courante).toBe(1);
    });

    it("ouvrirFenetre répond toujours 200 avec presenterSession", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        const joueurs = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurs[0]!)));
        sockets = [ws];

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await ouvrirFenetre(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), reponse);

        expect(res.statut).toBe(200);
        const corps = res.corps as { fenetre_cartes_ouverte: boolean };
        expect(corps.fenetre_cartes_ouverte).toBe(true);
    });

    it("terminerSession répond toujours 200 avec presenterSession", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        const joueurs = await creerParticipants(session.id, [0, 0]);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurs[0]!)));
        sockets = [ws];

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await terminerSession(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), reponse);

        expect(res.statut).toBe(200);
        const corps = res.corps as { statut: string };
        expect(corps.statut).toBe("terminee");
    });

    it("ouvrirQuestionCourante répond toujours 200 sans divulguer la bonne réponse", async () => {
        const decor = await preparerDecor(serveur);
        sockets = decor.sockets;

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            reponse
        );

        expect(res.statut).toBe(200);
        const corps = JSON.stringify(res.corps);
        expect(corps).not.toContain("index_bonne_reponse");
        expect(corps).not.toContain("explication");
    });

    it("cloturerQuestionCourante répond toujours 200 avec la correction", async () => {
        const decor = await preparerDecor(serveur);
        sockets = decor.sockets;

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await cloturerQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
            reponse
        );

        expect(res.statut).toBe(200);
        const corps = res.corps as { index_bonne_reponse: number };
        expect(corps.index_bonne_reponse).toBeGreaterThanOrEqual(1);
        expect(corps.index_bonne_reponse).toBeLessThanOrEqual(4);
    });

    it("cloturerMancheCourante répond toujours 200 avec la distribution", async () => {
        const decor = await preparerDecor(serveur);
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

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await cloturerMancheCourante(
            fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
            reponse
        );

        expect(res.statut).toBe(200);
        const corps = res.corps as { numero_manche: number; classement: unknown[] };
        expect(corps.numero_manche).toBe(1);
        expect(corps.classement).toHaveLength(decor.joueurs.length);
    });

    it("jouerUneCarte répond toujours 200 avec la ou les lignes jouées", async () => {
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

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await jouerUneCarte(
            {
                body: { id_reception: reception.id, id_cible: joueurs[1]!.id },
                params: { idParticipant: String(joueurs[0]!.id) },
            } as unknown as Request,
            reponse
        );

        expect(res.statut).toBe(200);
        const corps = res.corps as Array<{ id_reception: number; id_cible: number | null }>;
        expect(corps[0]?.id_reception).toBe(reception.id);
        expect(corps[0]?.id_cible).toBe(joueurs[1]!.id);
    });
});

describe("une émission vers un registre vide ne casse rien", () => {
    it("le registre est bien vide avant chaque appel", () => {
        expect(sessionsEnregistrees()).toHaveLength(0);
    });

    it("rejoindreSession répond 201 sans socket connectée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipants(session.id, [0]);

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            cookie: () => reponse,
            send: () => reponse,
        } as unknown as Response;

        await expect(
            rejoindreSession(
                fabriquerRequete({ code_acces: session.code_acces, pseudo: "SecondJoueur" }),
                reponse
            )
        ).resolves.not.toThrow();

        expect(res.statut).toBe(201);
        const corps = res.corps as { pseudo: string };
        expect(corps.pseudo).toBe("SecondJoueur");
    });

    it("quitterSession répond 204 sans socket connectée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const [, partant] = await creerParticipants(session.id, [0, 0]);

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0 };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: () => reponse,
            send: () => reponse,
        } as unknown as Response;

        await expect(
            quitterSession(fabriquerRequete({}, { idParticipant: String(partant!.id) }), reponse)
        ).resolves.not.toThrow();

        expect(res.statut).toBe(204);
    });

    it("demarrerSession répond 200 sans socket connectée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipants(session.id, [0, 0]);

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await expect(
            demarrerSession(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), reponse)
        ).resolves.not.toThrow();

        expect(res.statut).toBe(200);
        const corps = res.corps as { statut: string };
        expect(corps.statut).toBe("en_cours");
    });

    it("ouvrirFenetre répond 200 sans socket connectée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        await creerParticipants(session.id, [0, 0]);

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await expect(
            ouvrirFenetre(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), reponse)
        ).resolves.not.toThrow();

        expect(res.statut).toBe(200);
        const corps = res.corps as { fenetre_cartes_ouverte: boolean };
        expect(corps.fenetre_cartes_ouverte).toBe(true);
    });

    it("terminerSession répond 200 sans socket connectée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        await creerParticipants(session.id, [0, 0]);

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await expect(
            terminerSession(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), reponse)
        ).resolves.not.toThrow();

        expect(res.statut).toBe(200);
        const corps = res.corps as { statut: string };
        expect(corps.statut).toBe("terminee");
    });

    it("ouvrirQuestionCourante répond 200 sans socket connectée", async () => {
        const decor = await preparerDecor(null);

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await expect(
            ouvrirQuestionCourante(
                fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
                reponse
            )
        ).resolves.not.toThrow();

        expect(res.statut).toBe(200);
    });

    it("cloturerQuestionCourante répond 200 sans socket connectée", async () => {
        const decor = await preparerDecor(null);

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(decor.animateur, { numero_manche: 1, ordre: 1 }, { id: String(decor.session.id) }),
            fabriquerReponse()
        );

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await expect(
            cloturerQuestionCourante(
                fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
                reponse
            )
        ).resolves.not.toThrow();

        expect(res.statut).toBe(200);
        const corps = res.corps as { index_bonne_reponse: number };
        expect(corps.index_bonne_reponse).toBeGreaterThanOrEqual(1);
        expect(corps.index_bonne_reponse).toBeLessThanOrEqual(4);
    });

    it("cloturerMancheCourante répond 200 sans socket connectée", async () => {
        const decor = await preparerDecor(null);

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

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await expect(
            cloturerMancheCourante(
                fabriquerRequeteAuth(decor.animateur, {}, { id: String(decor.session.id) }),
                reponse
            )
        ).resolves.not.toThrow();

        expect(res.statut).toBe(200);
        const corps = res.corps as { numero_manche: number };
        expect(corps.numero_manche).toBe(1);
    });

    it("jouerUneCarte répond 200 sans socket connectée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
            date_debut_fenetre_cartes: new Date(),
        });
        const joueurs = await creerParticipants(session.id, [300, 200, 100]);
        const malus = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, malus.id);

        expect(sessionsEnregistrees()).toHaveLength(0);

        const res = { statut: 0, corps: undefined as unknown };
        const reponse = {
            status: (code: number) => {
                res.statut = code;
                return reponse;
            },
            json: (corps: unknown) => {
                res.corps = corps;
                return reponse;
            },
            send: () => reponse,
        } as unknown as Response;

        await expect(
            jouerUneCarte(
                {
                    body: { id_reception: reception.id, id_cible: joueurs[1]!.id },
                    params: { idParticipant: String(joueurs[0]!.id) },
                } as unknown as Request,
                reponse
            )
        ).resolves.not.toThrow();

        expect(res.statut).toBe(200);
        const corps = res.corps as Array<{ id_cible: number | null }>;
        expect(corps[0]?.id_cible).toBe(joueurs[1]!.id);
    });
});
