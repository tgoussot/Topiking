import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import {
    cloturerDepartage,
    lancerMortSubite,
    repondreDepartage,
    verifierEgalite,
} from "../../../src/controllers/MortSubiteControleur";
import { Session } from "../../../src/entities/Session";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import { MANCHE_MORT_SUBITE } from "../../../src/services/Jeux/MortSubiteService";
import {
    creerContexteMinimal,
    creerUtilisateur,
    creerThemeAvecQuestions,
    creerSession,
    creerParticipants,
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

async function preparerEgalite(scores: number[]) {
    const { organisation, animateur } = await creerContexteMinimal();
    const { questions } = await creerThemeAvecQuestions(organisation.id, 5);

    const session = await creerSession(animateur.id, {
        statut: "en_cours",
        numero_manche_courante: 1,
    });

    await creerSessionQuestion(session.id, questions[0]!.id, 1, 1);

    const joueurs = await creerParticipants(session.id, scores);

    return { organisation, animateur, session, questions, joueurs };
}

describe("verifierEgalite", () => {
    it("signale l'égalité en tête", async () => {
        const { animateur, session } = await preparerEgalite([100, 100, 50]);

        const res = fabriquerReponse();
        await verifierEgalite(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as { egalite: boolean; joueurs: unknown[] };

        expect(corps.egalite).toBe(true);
        expect(corps.joueurs).toHaveLength(2);
    });

    it("ne signale rien quand un joueur mène seul", async () => {
        const { animateur, session } = await preparerEgalite([200, 100, 50]);

        const res = fabriquerReponse();
        await verifierEgalite(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), res);

        const corps = res.json.mock.calls[0]?.[0] as { egalite: boolean };

        expect(corps.egalite).toBe(false);
    });

    it("refuse un animateur étranger à la session", async () => {
        const { organisation, session } = await preparerEgalite([100, 100]);
        const intrus = await creerUtilisateur(organisation.id);

        const res = fabriquerReponse();
        await verifierEgalite(fabriquerRequeteAuth(intrus, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe("lancerMortSubite", () => {
    it("ne divulgue jamais la bonne réponse", async () => {
        const { animateur, session } = await preparerEgalite([100, 100]);

        const res = fabriquerReponse();
        await lancerMortSubite(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).not.toContain("index_bonne_reponse");
        expect(corps).not.toContain("explication");
        expect(corps).not.toContain("id_theme");
    });

    it("ouvre la question sur la manche de départage", async () => {
        const { animateur, session } = await preparerEgalite([100, 100]);

        await lancerMortSubite(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const misAJour = await Session.findOneBy({ id: session.id });

        expect(misAJour?.numero_manche_courante).toBe(MANCHE_MORT_SUBITE);
        expect(misAJour?.id_question_courante).not.toBeNull();
    });

    it("refuse le départage quand un joueur mène seul", async () => {
        const { animateur, session } = await preparerEgalite([200, 100]);

        const res = fabriquerReponse();
        await lancerMortSubite(fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("refuse un animateur étranger à la session", async () => {
        const { organisation, session } = await preparerEgalite([100, 100]);
        const intrus = await creerUtilisateur(organisation.id);

        const res = fabriquerReponse();
        await lancerMortSubite(fabriquerRequeteAuth(intrus, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect((await Session.findOneBy({ id: session.id }))?.id_question_courante).toBeNull();
    });
});

describe("repondreDepartage", () => {
    it("désigne le vainqueur sur une bonne réponse", async () => {
        const { animateur, session, questions, joueurs } = await preparerEgalite([100, 100]);

        await lancerMortSubite(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });
        const question = questions.find((q) => q.id === courante!.id_question_courante);

        const res = fabriquerReponse();
        await repondreDepartage(
            fabriquerRequete(
                { id_question: question!.id, index_choisi: question!.index_bonne_reponse },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as { id_vainqueur: number | null };

        expect(corps.id_vainqueur).toBe(joueurs[0]!.id);
    });

    it("ne désigne personne sur une mauvaise réponse", async () => {
        const { animateur, session, questions, joueurs } = await preparerEgalite([100, 100]);

        await lancerMortSubite(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });
        const question = questions.find((q) => q.id === courante!.id_question_courante);
        const mauvais = question!.index_bonne_reponse === 1 ? 2 : 1;

        const res = fabriquerReponse();
        await repondreDepartage(
            fabriquerRequete(
                { id_question: question!.id, index_choisi: mauvais },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        const corps = res.json.mock.calls[0]?.[0] as { id_vainqueur: number | null };

        expect(corps.id_vainqueur).toBeNull();
    });

    it("refuse un joueur qui n'est pas à égalité en tête", async () => {
        const { animateur, session, questions, joueurs } = await preparerEgalite([100, 100, 10]);

        await lancerMortSubite(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });
        const question = questions.find((q) => q.id === courante!.id_question_courante);

        const res = fabriquerReponse();
        await repondreDepartage(
            fabriquerRequete(
                { id_question: question!.id, index_choisi: 1 },
                { idParticipant: String(joueurs[2]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("refuse de répondre une fois le départage tranché", async () => {
        const { animateur, session, questions, joueurs } = await preparerEgalite([100, 100]);

        await lancerMortSubite(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });
        const question = questions.find((q) => q.id === courante!.id_question_courante);

        await repondreDepartage(
            fabriquerRequete(
                { id_question: question!.id, index_choisi: question!.index_bonne_reponse },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await repondreDepartage(
            fabriquerRequete(
                { id_question: question!.id, index_choisi: question!.index_bonne_reponse },
                { idParticipant: String(joueurs[1]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });
});

describe("cloturerDepartage", () => {
    it("renvoie le vainqueur et referme la question", async () => {
        const { animateur, session, questions, joueurs } = await preparerEgalite([100, 100]);

        await lancerMortSubite(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const courante = await Session.findOneBy({ id: session.id });
        const question = questions.find((q) => q.id === courante!.id_question_courante);

        await repondreDepartage(
            fabriquerRequete(
                { id_question: question!.id, index_choisi: question!.index_bonne_reponse },
                { idParticipant: String(joueurs[1]!.id) }
            ),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await cloturerDepartage(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as { pseudo_vainqueur: string | null };

        expect(corps.pseudo_vainqueur).toBe(joueurs[1]!.pseudo);
        expect((await Session.findOneBy({ id: session.id }))?.id_question_courante).toBeNull();
    });

    it("répond 409 sans mort subite en cours", async () => {
        const { animateur, session } = await preparerEgalite([100, 100]);

        const res = fabriquerReponse();
        await cloturerDepartage(
            fabriquerRequeteAuth(animateur, {}, { id: String(session.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });
});
