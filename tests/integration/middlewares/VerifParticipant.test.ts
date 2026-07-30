import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
    verifAuthParticipant,
    RequeteParticipant,
} from "../../../src/middlewares/VerifParticipant";
import {
    genererToken,
    genererTokenParticipant,
} from "../../../src/services/AuthService";
import { JWT_SECRET } from "../../../src/config/auth.config";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipant,
} from "../../helpers/fixtures";

// Comme verifAuth, ce middleware est classé en intégration : sa dernière étape
// va chercher le participant en base pour le rattacher à la requête.

function fabriquerReponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res),
    };

    return res as unknown as Response & {
        status: jest.Mock;
        json: jest.Mock;
    };
}

// cookie-parser remplit req.cookies en amont ; on le simule directement.
// idParticipant vient de l'URL : c'est lui que le middleware compare au sub.
function fabriquerRequete(
    cookies: Record<string, string> = {},
    idParticipant?: number | string
): Request {
    return {
        cookies,
        params: idParticipant === undefined ? {} : { idParticipant: String(idParticipant) },
    } as unknown as Request;
}

// Deux joueurs dans une même session : le décor de l'usurpation.
async function deuxParticipants() {
    const { animateur } = await creerContexteMinimal();
    const session = await creerSession(animateur.id);

    return {
        session,
        joueurA: await creerParticipant(session.id),
        joueurB: await creerParticipant(session.id),
    };
}

describe("verifAuthParticipant — cloisonnement entre joueurs", () => {
    it("refuse le token du joueur A sur la route du joueur B", async () => {
        const { joueurA, joueurB } = await deuxParticipants();

        // Le token de A est parfaitement valide : bonne signature, bon rôle,
        // non expiré, et son porteur existe bien en base. Rien ne cloche côté
        // authentification — c'est l'autorisation qui doit trancher. Sans la
        // comparaison sub/idParticipant, A répondrait aux questions de B,
        // jouerait ses cartes et lirait son score.
        const req = fabriquerRequete(
            { token_participant: genererTokenParticipant(joueurA) },
            joueurB.id
        );
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuthParticipant(req, res, next);

        // 403 et non 401 : le porteur est bien identifié, on lui refuse
        // seulement d'agir au nom d'un autre.
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
        expect((req as RequeteParticipant).participant).toBeUndefined();
    });

    it("laisse passer le joueur A sur sa propre route", async () => {
        const { joueurA } = await deuxParticipants();

        // Le contre-exemple : sans lui, un middleware qui refuserait tout
        // passerait le test précédent sans rien prouver.
        const req = fabriquerRequete(
            { token_participant: genererTokenParticipant(joueurA) },
            joueurA.id
        );
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuthParticipant(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();

        // Le contrôleur en aval lit req.participant sans repasser par la base.
        const authentifiee = req as RequeteParticipant;
        expect(authentifiee.participant.id).toBe(joueurA.id);
        expect(authentifiee.participant.pseudo).toBe(joueurA.pseudo);
    });

    it("refuse le token du joueur A même s'il maquille le sub", async () => {
        const { joueurA, joueurB } = await deuxParticipants();

        // La parade évidente pour A : réécrire le sub à l'identifiant de B.
        // La signature ne couvre plus le payload modifié, donc jwt.verify
        // échoue avant même d'arriver à la comparaison — 401, pas 403.
        const token = genererTokenParticipant(joueurA);
        const [entete, , signature] = token.split(".");
        const payloadTrafique = Buffer.from(
            JSON.stringify({
                sub: joueurB.id,
                session: joueurB.id_session,
                role: "participant",
            })
        ).toString("base64url");

        const req = fabriquerRequete(
            { token_participant: `${entete}.${payloadTrafique}.${signature}` },
            joueurB.id
        );
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuthParticipant(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuse un token d'animateur sur une route de participant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);

        // Les deux familles de tokens partagent le même secret : seul le claim
        // role les distingue. Sans sa vérification, un animateur dont l'id
        // coïnciderait avec celui d'un participant agirait à sa place.
        const req = fabriquerRequete(
            { token_participant: genererToken(animateur) },
            joueur.id
        );
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuthParticipant(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuse un token de participant expiré", async () => {
        const { joueurA } = await deuxParticipants();

        // expiresIn négatif : le token naît déjà périmé, sans faire patienter
        // la suite de tests. Une partie dure moins que l'expiration, mais un
        // token oublié dans un navigateur ne doit pas rouvrir la session.
        const perime = jwt.sign(
            {
                sub: joueurA.id,
                session: joueurA.id_session,
                role: "participant",
            },
            JWT_SECRET,
            { expiresIn: "-1s" }
        );

        const req = fabriquerRequete(
            { token_participant: perime },
            joueurA.id
        );
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuthParticipant(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
