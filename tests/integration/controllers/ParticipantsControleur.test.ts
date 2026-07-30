import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import {
    compterParticipants,
    lireParticipant,
    listerParticipants,
    quitterSession,
    rejoindreSession,
} from "../../../src/controllers/ParticipantsControleur";
import { Participant } from "../../../src/entities/Participant";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipant,
    creerParticipants,
} from "../../helpers/fixtures";

function fabriquerReponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res),
        send: jest.fn(() => res),
        cookie: jest.fn(() => res),
    };

    return res as unknown as Response & {
        status: jest.Mock;
        json: jest.Mock;
        send: jest.Mock;
        cookie: jest.Mock;
    };
}

function fabriquerRequete(
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): Request {
    return { body, params } as unknown as Request;
}

describe("rejoindreSession", () => {
    it("inscrit le joueur et lui renvoie son identifiant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);

        const res = fabriquerReponse();
        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "Alice" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(201);

        const corps = res.json.mock.calls[0]?.[0] as { id: number; id_session: number };

        expect(corps.id).toBeGreaterThan(0);
        expect(corps.id_session).toBe(session.id);
    });

    it("nettoie les espaces du pseudo", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);

        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "  Alice   Martin  " }),
            fabriquerReponse()
        );

        const participants = await Participant.findBy({ id_session: session.id });

        expect(participants[0]?.pseudo).toBe("Alice Martin");
    });

    it("refuse un pseudo déjà pris, même avec une autre casse", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipant(session.id, { pseudo: "Alice" });

        const res = fabriquerReponse();
        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "alice" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(await Participant.findBy({ id_session: session.id })).toHaveLength(1);
    });

    it("refuse un pseudo trop court", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);

        const res = fabriquerReponse();
        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "A" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("répond 404 sur un code inconnu", async () => {
        const res = fabriquerReponse();
        await rejoindreSession(
            fabriquerRequete({ code_acces: 999999, pseudo: "Alice" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("refuse de rejoindre une partie déjà commencée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const res = fabriquerReponse();
        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "Retardataire" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(await Participant.findBy({ id_session: session.id })).toHaveLength(0);
    });

    it("ne retrouve pas une partie terminée par son code", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "terminee" });

        const res = fabriquerReponse();
        await rejoindreSession(
            fabriquerRequete({ code_acces: session.code_acces, pseudo: "Alice" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("lireParticipant", () => {
    it("renvoie le participant demandé", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id, { pseudo: "Alice", score_total: 250 });

        const res = fabriquerReponse();
        await lireParticipant(fabriquerRequete({}, { idParticipant: String(joueur.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            id: joueur.id,
            pseudo: "Alice",
            score_total: 250,
            id_session: session.id,
        });
    });

    it("répond 404 sur un participant inexistant", async () => {
        const res = fabriquerReponse();
        await lireParticipant(fabriquerRequete({}, { idParticipant: "999999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("listerParticipants et compterParticipants", () => {
    it("ne liste que les joueurs de la session demandée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const autreSession = await creerSession(animateur.id);

        await creerParticipant(session.id, { pseudo: "DansLaPartie" });
        await creerParticipant(autreSession.id, { pseudo: "Ailleurs" });

        const res = fabriquerReponse();
        await listerParticipants(fabriquerRequete({}, { id: String(session.id) }), res);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).toContain("DansLaPartie");
        expect(corps).not.toContain("Ailleurs");
    });

    it("compte les joueurs de la session", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipants(session.id, [0, 0, 0]);

        const res = fabriquerReponse();
        await compterParticipants(fabriquerRequete({}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ nombre: 3 });
    });

    it("répond 404 sur une session inexistante", async () => {
        const res = fabriquerReponse();
        await listerParticipants(fabriquerRequete({}, { id: "999999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("quitterSession", () => {
    it("retire le joueur tant que la partie n'a pas démarré", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);

        const res = fabriquerReponse();
        await quitterSession(fabriquerRequete({}, { idParticipant: String(joueur.id) }), res);

        expect(res.status).toHaveBeenCalledWith(204);
        expect(await Participant.findOneBy({ id: joueur.id })).toBeNull();
    });

    it("refuse de partir une fois la partie lancée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });
        const joueur = await creerParticipant(session.id);

        const res = fabriquerReponse();
        await quitterSession(fabriquerRequete({}, { idParticipant: String(joueur.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(await Participant.findOneBy({ id: joueur.id })).not.toBeNull();
    });

    it("répond 404 sur un participant inexistant", async () => {
        const res = fabriquerReponse();
        await quitterSession(fabriquerRequete({}, { idParticipant: "999999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
