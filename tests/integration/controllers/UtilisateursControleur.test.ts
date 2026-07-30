import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
    creerUtilisateur,
    creerToken,
    supprimerToken,
    moi,
} from "../../../src/controllers/UtilisateursControleur";
import { verifierMotDePasse } from "../../../src/services/AuthService";
import { JWT_SECRET } from "../../../src/config/auth.config";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { Organisation } from "../../../src/entities/Organisation";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import { TestDataSource } from "../../helpers/dataSource";
import { creerOrganisation } from "../../helpers/fixtures";

// Le contrôleur est appelé directement, avec des req/res simulés : on éprouve
// l'inscription de bout en bout jusqu'à la base, sans démarrer de serveur HTTP.
// Le contrat HTTP (codes de statut, forme des réponses) est couvert par les
// requêtes Bruno ; ici, on regarde ce qui atterrit réellement en base.

const DELAI_ARGON2_MS = 20000;

const MOT_DE_PASSE = "MonMotDePasse1!";

function fabriquerReponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res),
        send: jest.fn(() => res),
        cookie: jest.fn(() => res),
        clearCookie: jest.fn(() => res),
    };

    return res as unknown as Response & {
        status: jest.Mock;
        json: jest.Mock;
        send: jest.Mock;
        cookie: jest.Mock;
        clearCookie: jest.Mock;
    };
}

function fabriquerRequete(body: Record<string, unknown>): Request {
    return { body } as Request;
}

// Décrit l'appel à res.cookie(nom, valeur, options) tel que le contrôleur l'a
// passé : c'est là que se lisent httpOnly, sameSite et la durée de vie.
function cookiePose(res: ReturnType<typeof fabriquerReponse>) {
    const [nom, valeur, options] = res.cookie.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>
    ];

    return { nom, valeur, options };
}

// Lit la colonne mot_de_passe en SQL brut, sans passer par l'entité.
// @Exclude() masque le champ à la sérialisation : interroger la base
// directement est le seul moyen de voir ce qui y est vraiment stocké.
async function lireMotDePasseStocke(email: string): Promise<string> {
    const lignes = await TestDataSource.query(
        `SELECT mot_de_passe FROM utilisateur WHERE email = $1`,
        [email]
    );

    return lignes[0].mot_de_passe;
}

describe("creerUtilisateur — stockage du mot de passe", () => {
    it("ne stocke jamais le mot de passe en clair", async () => {
        const organisation = await creerOrganisation();
        const req = fabriquerRequete({
            email: "nouveau@exemple.fr",
            nom: "Nouveau",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
        });
        const res = fabriquerReponse();

        await creerUtilisateur(req, res);

        expect(res.status).toHaveBeenCalledWith(201);

        // Le test de sécurité central du projet. Il ne peut se faire qu'ici :
        // aucune réponse HTTP ne montre cette colonne, et c'est précisément
        // pour cela qu'une régression y passerait inaperçue.
        const stocke = await lireMotDePasseStocke("nouveau@exemple.fr");

        expect(stocke).not.toBe(MOT_DE_PASSE);
        expect(stocke.includes(MOT_DE_PASSE)).toBe(false);
    }, DELAI_ARGON2_MS);

    it("stocke un hash argon2id", async () => {
        const organisation = await creerOrganisation();
        const req = fabriquerRequete({
            email: "nouveau@exemple.fr",
            nom: "Nouveau",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
        });

        await creerUtilisateur(req, fabriquerReponse());

        const stocke = await lireMotDePasseStocke("nouveau@exemple.fr");

        expect(stocke.startsWith("$argon2id$")).toBe(true);
    }, DELAI_ARGON2_MS);

    it("stocke un hash que verifierMotDePasse sait relire", async () => {
        const organisation = await creerOrganisation();
        const req = fabriquerRequete({
            email: "nouveau@exemple.fr",
            nom: "Nouveau",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
        });

        await creerUtilisateur(req, fabriquerReponse());

        // Boucle complète : ce qui a été écrit à l'inscription doit permettre
        // la connexion, et rien d'autre.
        const stocke = await lireMotDePasseStocke("nouveau@exemple.fr");

        expect(await verifierMotDePasse(stocke, MOT_DE_PASSE)).toBe(true);
        expect(await verifierMotDePasse(stocke, "MauvaisMotDePasse1!")).toBe(false);
    }, DELAI_ARGON2_MS);

    it("ne renvoie pas le mot de passe dans la réponse d'inscription", async () => {
        const organisation = await creerOrganisation();
        const req = fabriquerRequete({
            email: "nouveau@exemple.fr",
            nom: "Nouveau",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
        });
        const res = fabriquerReponse();

        await creerUtilisateur(req, res);

        const serialisee = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(serialisee.includes("mot_de_passe")).toBe(false);
        expect(serialisee.includes(MOT_DE_PASSE)).toBe(false);
    }, DELAI_ARGON2_MS);

    it("hache deux fois différemment un même mot de passe pour deux comptes", async () => {
        const organisation = await creerOrganisation();

        for (const email of ["premier@exemple.fr", "second@exemple.fr"]) {
            await creerUtilisateur(
                fabriquerRequete({
                    email,
                    nom: "Compte",
                    mot_de_passe: MOT_DE_PASSE,
                    code_invitation: organisation.code_invitation,
                }),
                fabriquerReponse()
            );
        }

        // Deux comptes au même mot de passe ne doivent pas se reconnaître à
        // leur hash : c'est le sel aléatoire, observé cette fois en base.
        const premier = await lireMotDePasseStocke("premier@exemple.fr");
        const second = await lireMotDePasseStocke("second@exemple.fr");

        expect(premier).not.toBe(second);
    }, DELAI_ARGON2_MS);
});

describe("creerUtilisateur — rattachement à l'organisation", () => {
    it("rattache l'utilisateur à l'organisation du code d'invitation", async () => {
        const organisation = await creerOrganisation();
        const req = fabriquerRequete({
            email: "invite@exemple.fr",
            nom: "Invité",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
        });

        await creerUtilisateur(req, fabriquerReponse());

        const utilisateur = await Utilisateur.findOneBy({ email: "invite@exemple.fr" });

        expect(utilisateur?.id_organisation).toBe(organisation.id);
    }, DELAI_ARGON2_MS);

    it("crée l'organisation, son slug et son code lorsqu'un nom est fourni", async () => {
        const req = fabriquerRequete({
            email: "fondateur@exemple.fr",
            nom: "Fondateur",
            mot_de_passe: MOT_DE_PASSE,
            nom_organisation: "Lycée Victor Hugo",
        });

        await creerUtilisateur(req, fabriquerReponse());

        const organisation = await Organisation.findOneBy({ nom: "Lycée Victor Hugo" });

        expect(organisation).not.toBeNull();
        expect(organisation?.slug).toBe("lycee-victor-hugo");
        expect(organisation?.code_invitation).toBeGreaterThanOrEqual(100000);

        const utilisateur = await Utilisateur.findOneBy({ email: "fondateur@exemple.fr" });
        expect(utilisateur?.id_organisation).toBe(organisation?.id);
    }, DELAI_ARGON2_MS);

    it("refuse un code d'invitation inconnu et ne crée aucun utilisateur", async () => {
        const req = fabriquerRequete({
            email: "perdu@exemple.fr",
            nom: "Perdu",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: 999999,
        });
        const res = fabriquerReponse();

        await creerUtilisateur(req, res);

        expect(res.status).toHaveBeenCalledWith(404);

        // Un refus doit ne rien laisser derrière lui.
        expect(await Utilisateur.findOneBy({ email: "perdu@exemple.fr" })).toBeNull();
    });

    it("refuse un code et un nom d'organisation à la fois", async () => {
        const organisation = await creerOrganisation();
        const req = fabriquerRequete({
            email: "indecis@exemple.fr",
            nom: "Indécis",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
            nom_organisation: "Acme Formation",
        });
        const res = fabriquerReponse();

        await creerUtilisateur(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(await Utilisateur.findOneBy({ email: "indecis@exemple.fr" })).toBeNull();
    });

    it("refuse une inscription sans code ni nom d'organisation", async () => {
        const req = fabriquerRequete({
            email: "orphelin@exemple.fr",
            nom: "Orphelin",
            mot_de_passe: MOT_DE_PASSE,
        });
        const res = fabriquerReponse();

        await creerUtilisateur(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(await Utilisateur.findOneBy({ email: "orphelin@exemple.fr" })).toBeNull();
    });

    it("refuse un email déjà pris", async () => {
        const organisation = await creerOrganisation();
        const body = {
            email: "doublon@exemple.fr",
            nom: "Doublon",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
        };

        await creerUtilisateur(fabriquerRequete({ ...body }), fabriquerReponse());

        const res = fabriquerReponse();
        await creerUtilisateur(fabriquerRequete({ ...body }), res);

        expect(res.status).toHaveBeenCalledWith(409);

        const comptes = await Utilisateur.findBy({ email: "doublon@exemple.fr" });
        expect(comptes).toHaveLength(1);
    }, DELAI_ARGON2_MS);
});

// ----------------------------------------------------------------------
// POST /api/utilisateurs/tokens — connexion
// ----------------------------------------------------------------------

// Inscrit un compte et renvoie son email, pour enchaîner sur une connexion.
async function inscrireCompte(email: string): Promise<Organisation> {
    const organisation = await creerOrganisation();

    await creerUtilisateur(
        fabriquerRequete({
            email,
            nom: "Titulaire",
            mot_de_passe: MOT_DE_PASSE,
            code_invitation: organisation.code_invitation,
        }),
        fabriquerReponse()
    );

    return organisation;
}

describe("creerToken — connexion réussie", () => {
    it("répond 200 et pose le cookie du token", async () => {
        await inscrireCompte("titulaire@exemple.fr");

        const res = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "titulaire@exemple.fr", mot_de_passe: MOT_DE_PASSE }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.cookie).toHaveBeenCalledTimes(1);
        expect(cookiePose(res).nom).toBe("token");
    }, DELAI_ARGON2_MS);

    it("protège le cookie avec httpOnly, secure et sameSite", async () => {
        await inscrireCompte("titulaire@exemple.fr");

        const res = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "titulaire@exemple.fr", mot_de_passe: MOT_DE_PASSE }),
            res
        );

        const { options } = cookiePose(res);

        // httpOnly : le cookie devient invisible à document.cookie, donc hors
        // de portée d'un script injecté (XSS).
        expect(options.httpOnly).toBe(true);

        // sameSite strict : le navigateur ne joint pas le cookie aux requêtes
        // venues d'un autre site, ce qui ferme la voie au CSRF.
        expect(options.sameSite).toBe("strict");

        // secure : le cookie ne circule que sur HTTPS, jamais en clair.
        expect(options.secure).toBe(true);
    }, DELAI_ARGON2_MS);

    it("pose un token dont le sub désigne le bon utilisateur", async () => {
        await inscrireCompte("titulaire@exemple.fr");
        const attendu = await Utilisateur.findOneBy({ email: "titulaire@exemple.fr" });

        const res = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "titulaire@exemple.fr", mot_de_passe: MOT_DE_PASSE }),
            res
        );

        const payload = jwt.verify(cookiePose(res).valeur, JWT_SECRET) as jwt.JwtPayload;

        expect(payload.sub).toBe(attendu!.id);
        expect(payload.org).toBe(attendu!.id_organisation);
    }, DELAI_ARGON2_MS);

    it("ne renvoie pas le token dans le corps de la réponse", async () => {
        await inscrireCompte("titulaire@exemple.fr");

        const res = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "titulaire@exemple.fr", mot_de_passe: MOT_DE_PASSE }),
            res
        );

        // Le token n'a sa place que dans le cookie httpOnly. Le recopier dans
        // le corps le rendrait lisible par JavaScript, annulant l'intérêt du
        // httpOnly qu'on vient de poser.
        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps.includes(cookiePose(res).valeur)).toBe(false);
        expect(corps).not.toContain("token");
        expect(corps).not.toContain("mot_de_passe");
    }, DELAI_ARGON2_MS);
});

describe("creerToken — échecs indistinguables", () => {
    it("répond 401 sur un mot de passe erroné, sans poser de cookie", async () => {
        await inscrireCompte("titulaire@exemple.fr");

        const res = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "titulaire@exemple.fr", mot_de_passe: "MauvaisMotDePasse1!" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.cookie).not.toHaveBeenCalled();
    }, DELAI_ARGON2_MS);

    it("répond 401 sur un email inconnu, sans poser de cookie", async () => {
        const res = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "inconnu@exemple.fr", mot_de_passe: MOT_DE_PASSE }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.cookie).not.toHaveBeenCalled();
    });

    it("répond exactement la même chose pour un email inconnu et un mauvais mot de passe", async () => {
        await inscrireCompte("titulaire@exemple.fr");

        const inconnu = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "inconnu@exemple.fr", mot_de_passe: MOT_DE_PASSE }),
            inconnu
        );

        const mauvaisMotDePasse = fabriquerReponse();
        await creerToken(
            fabriquerRequete({ email: "titulaire@exemple.fr", mot_de_passe: "MauvaisMotDePasse1!" }),
            mauvaisMotDePasse
        );

        // Le test anti-énumération. Si les deux réponses différaient — ne
        // serait-ce que par le libellé — l'API deviendrait un annuaire :
        // un attaquant y testerait des emails un à un pour savoir lesquels
        // sont inscrits, avant même de s'attaquer aux mots de passe.
        expect(inconnu.status.mock.calls).toEqual(mauvaisMotDePasse.status.mock.calls);
        expect(inconnu.json.mock.calls).toEqual(mauvaisMotDePasse.json.mock.calls);
    }, DELAI_ARGON2_MS);
});

// ----------------------------------------------------------------------
// DELETE /api/utilisateurs/tokens — déconnexion
// ----------------------------------------------------------------------

describe("supprimerToken", () => {
    it("répond 204 et efface le cookie", () => {
        const res = fabriquerReponse();

        supprimerToken(fabriquerRequete({}), res);

        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.clearCookie).toHaveBeenCalledTimes(1);

        const [nom] = res.clearCookie.mock.calls[0] as [string, Record<string, unknown>];
        expect(nom).toBe("token");
    });

    it("efface le cookie avec les mêmes attributs qu'à la pose", () => {
        const res = fabriquerReponse();

        supprimerToken(fabriquerRequete({}), res);

        // Un navigateur n'efface un cookie que si les attributs concordent
        // avec ceux de la pose. Des options divergentes laisseraient le cookie
        // en place, et la déconnexion n'en serait qu'une apparence.
        const [, options] = res.clearCookie.mock.calls[0] as [string, Record<string, unknown>];

        expect(options.httpOnly).toBe(true);
        expect(options.sameSite).toBe("strict");
        expect(options.secure).toBe(true);
    });

    it("ne renvoie aucun corps", () => {
        const res = fabriquerReponse();

        supprimerToken(fabriquerRequete({}), res);

        // 204 No Content : le statut se suffit à lui-même.
        expect(res.json).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalled();
    });
});

// ----------------------------------------------------------------------
// GET /api/utilisateurs/moi
// ----------------------------------------------------------------------

describe("moi", () => {
    it("renvoie l'identité posée par verifAuth", async () => {
        const organisation = await creerOrganisation();
        await creerUtilisateur(
            fabriquerRequete({
                email: "titulaire@exemple.fr",
                nom: "Titulaire",
                mot_de_passe: MOT_DE_PASSE,
                code_invitation: organisation.code_invitation,
            }),
            fabriquerReponse()
        );
        const utilisateur = await Utilisateur.findOneBy({ email: "titulaire@exemple.fr" });

        // moi() ne consulte pas la base : il se contente de restituer ce que
        // verifAuth a déjà chargé dans req.utilisateur.
        const req = fabriquerRequete({}) as RequeteAuthentifiee;
        req.utilisateur = utilisateur!;

        const res = fabriquerReponse();
        await moi(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            id: utilisateur!.id,
            email: "titulaire@exemple.fr",
            nom: "Titulaire",
        });
    }, DELAI_ARGON2_MS);

    it("ne divulgue ni le hash ni l'organisation", async () => {
        const organisation = await creerOrganisation();
        await creerUtilisateur(
            fabriquerRequete({
                email: "titulaire@exemple.fr",
                nom: "Titulaire",
                mot_de_passe: MOT_DE_PASSE,
                code_invitation: organisation.code_invitation,
            }),
            fabriquerReponse()
        );
        const utilisateur = await Utilisateur.findOneBy({ email: "titulaire@exemple.fr" });

        const req = fabriquerRequete({}) as RequeteAuthentifiee;
        req.utilisateur = utilisateur!;

        const res = fabriquerReponse();
        await moi(req, res);

        // req.utilisateur porte l'entité COMPLÈTE, hash compris : le contrôleur
        // doit donc choisir les champs qu'il expose, et non renvoyer l'objet tel
        // quel. C'est exactement ce que ce test verrouille.
        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).not.toContain("mot_de_passe");
        expect(corps).not.toContain("$argon2");
        expect(corps).not.toContain("id_organisation");
    }, DELAI_ARGON2_MS);
});
