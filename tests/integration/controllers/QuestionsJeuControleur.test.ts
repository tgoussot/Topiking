import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import {
    cloturerMancheCourante,
    cloturerQuestionCourante,
    mancheSuivante,
    ouvrirQuestionCourante,
    questionCouranteDuJoueur,
    repondre,
} from "../../../src/controllers/QuestionsJeuControleur";
import { Session } from "../../../src/entities/Session";
import { Participant } from "../../../src/entities/Participant";
import { ReponseParticipant } from "../../../src/entities/ReponseParticipant";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import { NOMBRE_MANCHES, QUESTIONS_PAR_MANCHE } from "../../../src/config/config";
import {
    creerContexteMinimal,
    creerUtilisateur,
    creerThemeAvecQuestions,
    creerSession,
    creerParticipants,
    creerSessionTheme,
    creerSessionQuestion,
} from "../../helpers/fixtures";

function fabriquerReponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res),
        send: jest.fn(() => res),
    };

    return res as unknown as Response & {
        status: jest.Mock;
        json: jest.Mock;
        send: jest.Mock;
    };
}

function fabriquerRequete(
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): Request {
    return { body, params } as unknown as Request;
}

function fabriquerRequeteAuth(
    utilisateur: Utilisateur,
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): RequeteAuthentifiee {
    return { body, params, utilisateur } as unknown as RequeteAuthentifiee;
}

async function preparerPartieEnCours(nombreJoueurs: number = 2) {
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

    return { organisation, animateur, session, questions, joueurs };
}

describe("ouvrirQuestionCourante", () => {
    it("ouvre la question et ne divulgue jamais la bonne réponse", async () => {
        const { animateur, session } = await preparerPartieEnCours();

        const res = fabriquerReponse();
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(
                animateur,
                { numero_manche: 1, ordre: 1 },
                { id: String(session.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).not.toContain("index_bonne_reponse");
        expect(corps).not.toContain("explication");
    });

    it("marque la question comme courante en base", async () => {
        const { animateur, session, questions } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(
                animateur,
                { numero_manche: 1, ordre: 1 },
                { id: String(session.id) }
            ),
            fabriquerReponse()
        );

        const misAJour = await Session.findOneBy({ id: session.id });

        expect(misAJour?.id_question_courante).not.toBeNull();
        expect(misAJour?.date_debut_question).not.toBeNull();

        const idsTirees = questions.map((question) => question.id);
        expect(idsTirees).toContain(misAJour?.id_question_courante);
    });

    it("refuse d'ouvrir une seconde question sans clôturer la première", async () => {
        const { animateur, session } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 2 }, { id: String(session.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("refuse un animateur étranger à la session", async () => {
        const { organisation, session } = await preparerPartieEnCours();
        const intrus = await creerUtilisateur(organisation.id);

        const res = fabriquerReponse();
        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(intrus, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect((await Session.findOneBy({ id: session.id }))?.id_question_courante).toBeNull();
    });
});

describe("questionCouranteDuJoueur", () => {
    it("renvoie la question ouverte sans la bonne réponse", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await questionCouranteDuJoueur(
            fabriquerRequete({}, { idParticipant: String(joueurs[0]!.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as {
            propositions: string[];
            duree_timer_ms: number;
        };

        expect(corps.propositions).toHaveLength(4);
        expect(corps.duree_timer_ms).toBeGreaterThan(0);
        expect(JSON.stringify(corps)).not.toContain("index_bonne_reponse");
    });

    it("répond 409 quand aucune question n'est ouverte", async () => {
        const { joueurs } = await preparerPartieEnCours();

        const res = fabriquerReponse();
        await questionCouranteDuJoueur(
            fabriquerRequete({}, { idParticipant: String(joueurs[0]!.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("répond 404 sur un participant inexistant", async () => {
        const res = fabriquerReponse();
        await questionCouranteDuJoueur(
            fabriquerRequete({}, { idParticipant: "999999" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("repondre", () => {
    it("enregistre la réponse sans révéler les points", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });

        const res = fabriquerReponse();
        await repondre(
            fabriquerRequete(
                { id_question: courante!.id_question_courante, index_choisi: 1 },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(201);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).not.toContain("points");
        expect(corps).not.toContain("index_bonne_reponse");
    });

    it("crédite le score du participant en base", async () => {
        const { animateur, session, questions, joueurs } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });
        const question = questions.find((q) => q.id === courante!.id_question_courante);

        await repondre(
            fabriquerRequete(
                { id_question: question!.id, index_choisi: question!.index_bonne_reponse },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            fabriquerReponse()
        );

        const misAJour = await Participant.findOneBy({ id: joueurs[0]!.id });

        expect(misAJour?.score_total).toBeGreaterThan(0);
    });

    it("refuse une deuxième réponse à la même question", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });
        const corps = { id_question: courante!.id_question_courante, index_choisi: 1 };

        await repondre(
            fabriquerRequete({ ...corps }, { idParticipant: String(joueurs[0]!.id) }),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await repondre(
            fabriquerRequete({ ...corps }, { idParticipant: String(joueurs[0]!.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);

        const reponses = await ReponseParticipant.findBy({ id_participant: joueurs[0]!.id });
        expect(reponses).toHaveLength(1);
    });

    it("refuse de répondre à une question fermée", async () => {
        const { session, questions, joueurs } = await preparerPartieEnCours();

        const res = fabriquerReponse();
        await repondre(
            fabriquerRequete(
                { id_question: questions[0]!.id, index_choisi: 1 },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(await ReponseParticipant.findBy({ id_participant: joueurs[0]!.id })).toHaveLength(0);
        expect(session.id).toBeGreaterThan(0);
    });

    it("refuse un index hors des bornes", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });

        const res = fabriquerReponse();
        await repondre(
            fabriquerRequete(
                { id_question: courante!.id_question_courante, index_choisi: 7 },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe("cloturerQuestionCourante", () => {
    it("renvoie la correction à l'animateur", async () => {
        const { animateur, session } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await cloturerQuestionCourante(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as { index_bonne_reponse: number };

        expect(corps.index_bonne_reponse).toBeGreaterThanOrEqual(1);
        expect(corps.index_bonne_reponse).toBeLessThanOrEqual(4);
    });

    it("inscrit une réponse vide pour les joueurs absents", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();

        await ouvrirQuestionCourante(
            fabriquerRequeteAuth(animateur, { numero_manche: 1, ordre: 1 }, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });

        await repondre(
            fabriquerRequete(
                { id_question: courante!.id_question_courante, index_choisi: 1 },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            fabriquerReponse()
        );

        await cloturerQuestionCourante(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const absent = await ReponseParticipant.findOneBy({
            id_participant: joueurs[1]!.id,
            id_question: courante!.id_question_courante!,
        });

        expect(absent?.reponse_choisie).toBeNull();
        expect(absent?.points).toBe(0);
    });

    it("répond 409 quand aucune question n'est ouverte", async () => {
        const { animateur, session } = await preparerPartieEnCours();

        const res = fabriquerReponse();
        await cloturerQuestionCourante(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });
});

describe("cloturerMancheCourante et mancheSuivante", () => {
    async function jouerLaManche(
        animateur: Utilisateur,
        idSession: number,
        numeroManche: number,
        idsJoueurs: number[]
    ) {
        for (let ordre = 1; ordre <= QUESTIONS_PAR_MANCHE; ordre++) {
            await ouvrirQuestionCourante(
                fabriquerRequeteAuth(
                    animateur,
                    { numero_manche: numeroManche, ordre: ordre },
                    { id: String(idSession) }
                ),
                fabriquerReponse()
            );

            const courante = await Session.findOneBy({ id: idSession });

            for (let i = 0; i < idsJoueurs.length; i++) {
                await repondre(
                    fabriquerRequete(
                        { id_question: courante!.id_question_courante, index_choisi: 1 },
                        { idParticipant: String(idsJoueurs[i]) }
                    ),
                    fabriquerReponse()
                );
            }

            await cloturerQuestionCourante(
                fabriquerRequeteAuth(animateur, {}, { id: String(idSession) }),
                fabriquerReponse()
            );
        }
    }

    it("clôt la manche et distribue les cartes", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();
        const ids = joueurs.map((joueur) => joueur.id);

        await jouerLaManche(animateur, session.id, 1, ids);

        const res = fabriquerReponse();
        await cloturerMancheCourante(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as {
            numero_manche: number;
            classement: unknown[];
        };

        expect(corps.numero_manche).toBe(1);
        expect(corps.classement).toHaveLength(2);
    });

    it("refuse de passer à la manche suivante tant que la fenêtre est ouverte", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();
        const ids = joueurs.map((joueur) => joueur.id);

        await jouerLaManche(animateur, session.id, 1, ids);

        await cloturerMancheCourante(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await mancheSuivante(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("passe à la manche suivante une fois la fenêtre fermée", async () => {
        const { animateur, session, joueurs } = await preparerPartieEnCours();
        const ids = joueurs.map((joueur) => joueur.id);

        await jouerLaManche(animateur, session.id, 1, ids);
        await cloturerMancheCourante(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const aFermer = await Session.findOneBy({ id: session.id });
        aFermer!.date_debut_fenetre_cartes = null;
        await aFermer!.save();

        const res = fabriquerReponse();
        await mancheSuivante(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect((await Session.findOneBy({ id: session.id }))?.numero_manche_courante).toBe(2);
    });

    it("refuse d'aller au-delà de la dernière manche", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: NOMBRE_MANCHES,
        });

        const res = fabriquerReponse();
        await mancheSuivante(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect((await Session.findOneBy({ id: session.id }))?.numero_manche_courante).toBe(
            NOMBRE_MANCHES
        );
    });
});
