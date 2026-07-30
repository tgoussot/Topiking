import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { verifAuth, RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import { genererToken } from "../../../src/services/AuthService";
import { JWT_SECRET } from "../../../src/config/auth.config";
import { creerOrganisation, creerUtilisateur } from "../../helpers/fixtures";

// verifAuth est classé en intégration, et non en unitaire : sa dernière étape
// interroge la table Utilisateur pour vérifier que le porteur du token existe
// TOUJOURS. C'est précisément ce qui distingue un token valide d'un token dont
// le compte a été supprimé, et cela ne peut être éprouvé qu'avec une base.

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
function fabriquerRequete(cookies: Record<string, string> = {}): Request {
    return { cookies } as Request;
}

function corpsRenvoye(res: ReturnType<typeof fabriquerReponse>): unknown {
    return res.json.mock.calls[0]?.[0];
}

describe("verifAuth — refus", () => {
    it("refuse une requête sans cookie", async () => {
        const req = fabriquerRequete({});
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuse un token malformé", async () => {
        const req = fabriquerRequete({ token: "pas-du-tout-un-jwt" });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuse un token signé avec un autre secret", async () => {
        // Le scénario du faussaire : il connaît la structure du payload, mais
        // pas le secret. Sans lui, la signature HMAC ne peut pas être reproduite.
        const contrefacon = jwt.sign({ sub: 1, org: 1 }, "un-autre-secret", {
            expiresIn: "15m",
        });

        const req = fabriquerRequete({ token: contrefacon });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuse un token expiré", async () => {
        const organisation = await creerOrganisation();
        const utilisateur = await creerUtilisateur(organisation.id);

        // expiresIn négatif : le token naît déjà périmé. C'est la seule façon
        // d'éprouver l'expiration sans faire patienter la suite de tests.
        const perime = jwt.sign(
            { sub: utilisateur.id, org: utilisateur.id_organisation },
            JWT_SECRET,
            { expiresIn: "-1s" }
        );

        const req = fabriquerRequete({ token: perime });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuse un token valide dont l'utilisateur a été supprimé", async () => {
        const organisation = await creerOrganisation();
        const utilisateur = await creerUtilisateur(organisation.id);

        // Le token reste cryptographiquement irréprochable : c'est le compte
        // qui a disparu. Sans la vérification en base, un compte supprimé
        // garderait l'accès jusqu'à l'expiration de son token — soit 15 min.
        const token = genererToken(utilisateur);
        await utilisateur.remove();

        const req = fabriquerRequete({ token });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("renvoie le même message dans tous les cas d'échec", async () => {
        const organisation = await creerOrganisation();
        const utilisateur = await creerUtilisateur(organisation.id);

        const tokenPerime = jwt.sign({ sub: utilisateur.id }, JWT_SECRET, {
            expiresIn: "-1s",
        });
        const tokenSupprime = genererToken(utilisateur);
        await utilisateur.remove();

        const cas: Record<string, string | undefined> = {
            "sans cookie": undefined,
            "token malformé": "pas-du-tout-un-jwt",
            "autre secret": jwt.sign({ sub: 1 }, "un-autre-secret"),
            "token expiré": tokenPerime,
            "utilisateur supprimé": tokenSupprime,
        };

        const reponses: string[] = [];

        for (const token of Object.values(cas)) {
            const res = fabriquerReponse();
            await verifAuth(
                fabriquerRequete(token === undefined ? {} : { token }),
                res,
                jest.fn() as unknown as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(401);
            reponses.push(JSON.stringify(corpsRenvoye(res)));
        }

        // Toutes les réponses doivent être rigoureusement identiques : un
        // message qui distinguerait « token expiré » de « compte inconnu »
        // renseignerait un attaquant sur ce qu'il doit corriger.
        expect(new Set(reponses).size).toBe(1);
    });
});

describe("verifAuth — acceptation", () => {
    it("appelle next() et renseigne req.utilisateur sur un token valide", async () => {
        const organisation = await creerOrganisation();
        const utilisateur = await creerUtilisateur(organisation.id);

        const req = fabriquerRequete({ token: genererToken(utilisateur) });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuth(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();

        // Le contrôleur en aval lit req.utilisateur sans repasser par la base :
        // le middleware doit donc l'avoir rempli avec l'entité complète.
        const authentifiee = req as RequeteAuthentifiee;
        expect(authentifiee.utilisateur.id).toBe(utilisateur.id);
        expect(authentifiee.utilisateur.email).toBe(utilisateur.email);
    });

    it("rattache l'utilisateur désigné par le sub, et pas un autre", async () => {
        const organisation = await creerOrganisation();
        const premier = await creerUtilisateur(organisation.id);
        const second = await creerUtilisateur(organisation.id);

        const req = fabriquerRequete({ token: genererToken(second) });
        const res = fabriquerReponse();

        await verifAuth(req, res, jest.fn() as unknown as NextFunction);

        const authentifiee = req as RequeteAuthentifiee;
        expect(authentifiee.utilisateur.id).toBe(second.id);
        expect(authentifiee.utilisateur.id).not.toBe(premier.id);
    });

    it("refuse un token dont le sub a été trafiqué", async () => {
        const organisation = await creerOrganisation();
        const utilisateur = await creerUtilisateur(organisation.id);

        // On remplace le payload par un autre sub, en gardant l'en-tête et la
        // signature d'origine. La signature ne couvre plus le contenu : la
        // vérification échoue, sans qu'on ait eu besoin du secret pour le voir.
        const token = genererToken(utilisateur);
        const [entete, , signature] = token.split(".");
        const payloadTrafique = Buffer.from(
            JSON.stringify({ sub: utilisateur.id + 1, org: 1 })
        ).toString("base64url");

        const req = fabriquerRequete({
            token: `${entete}.${payloadTrafique}.${signature}`,
        });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await verifAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
