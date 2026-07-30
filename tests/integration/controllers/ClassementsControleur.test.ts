import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import {
    classementDeLaPartie,
    classementParManche,
} from "../../../src/controllers/ClassementsControleur";
import {
    creerContexteMinimal,
    creerThemeAvecQuestions,
    creerSession,
    creerParticipants,
    creerSessionQuestion,
    creerReponse,
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

function fabriquerRequete(params: Record<string, string> = {}): Request {
    return { body: {}, params } as unknown as Request;
}

type LigneClassement = {
    rang: number;
    id_participant: number;
    pseudo: string;
    points: number;
};

describe("classementDeLaPartie", () => {
    it("classe les joueurs du meilleur au moins bon", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurs = await creerParticipants(session.id, [100, 300, 200]);

        const res = fabriquerReponse();
        await classementDeLaPartie(fabriquerRequete({ id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as LigneClassement[];

        expect(corps[0]?.id_participant).toBe(joueurs[1]!.id);
        expect(corps[1]?.id_participant).toBe(joueurs[2]!.id);
        expect(corps[2]?.id_participant).toBe(joueurs[0]!.id);
    });

    it("numérote les rangs à partir de 1", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipants(session.id, [300, 200, 100]);

        const res = fabriquerReponse();
        await classementDeLaPartie(fabriquerRequete({ id: String(session.id) }), res);

        const corps = res.json.mock.calls[0]?.[0] as LigneClassement[];

        expect(corps.map((ligne) => ligne.rang)).toEqual([1, 2, 3]);
    });

    it("départage deux ex aequo par leur identifiant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurs = await creerParticipants(session.id, [100, 100]);

        const res = fabriquerReponse();
        await classementDeLaPartie(fabriquerRequete({ id: String(session.id) }), res);

        const corps = res.json.mock.calls[0]?.[0] as LigneClassement[];

        expect(corps[0]?.id_participant).toBe(joueurs[0]!.id);
    });

    it("répond 404 sur une session inexistante", async () => {
        const res = fabriquerReponse();
        await classementDeLaPartie(fabriquerRequete({ id: "999999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("ne divulgue rien de sensible", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipants(session.id, [100, 50]);

        const res = fabriquerReponse();
        await classementDeLaPartie(fabriquerRequete({ id: String(session.id) }), res);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).not.toContain("id_animateur");
        expect(corps).not.toContain("email");
        expect(corps).not.toContain("mot_de_passe");
    });
});

describe("classementParManche", () => {
    it("ne compte que les réponses de la manche demandée", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const { questions } = await creerThemeAvecQuestions(organisation.id, 2);
        const session = await creerSession(animateur.id, { statut: "en_cours" });
        const joueurs = await creerParticipants(session.id, [0, 0]);

        await creerSessionQuestion(session.id, questions[0]!.id, 1, 1);
        await creerSessionQuestion(session.id, questions[1]!.id, 2, 1);

        await creerReponse(joueurs[0]!.id, questions[0]!.id, { points: 100 });
        await creerReponse(joueurs[0]!.id, questions[1]!.id, { points: 500 });
        await creerReponse(joueurs[1]!.id, questions[0]!.id, { points: 300 });

        const res = fabriquerReponse();
        await classementParManche(
            fabriquerRequete({ id: String(session.id), numero: "1" }),
            res
        );

        const corps = res.json.mock.calls[0]?.[0] as LigneClassement[];

        expect(corps[0]?.id_participant).toBe(joueurs[1]!.id);
        expect(corps[0]?.points).toBe(300);
        expect(corps[1]?.points).toBe(100);
    });

    it("répond 404 sur une session inexistante", async () => {
        const res = fabriquerReponse();
        await classementParManche(fabriquerRequete({ id: "999999", numero: "1" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
