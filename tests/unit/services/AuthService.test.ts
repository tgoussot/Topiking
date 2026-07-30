import { describe, it, expect } from "@jest/globals";
import jwt from "jsonwebtoken";
import {
    hacherMotDePasse,
    verifierMotDePasse,
    genererToken,
} from "../../../src/services/AuthService";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { JWT_SECRET } from "../../../src/config/auth.config";

// Aucune base n'est nécessaire ici : le hachage est un calcul pur, et
// genererToken ne lit que deux champs de l'entité. On fabrique donc les
// Utilisateur en mémoire, sans jamais appeler save().

// Argon2 est volontairement lent (c'est sa raison d'être face au force brute) :
// un hachage coûte quelques centaines de millisecondes. Les 5 s par défaut de
// Jest sont trop justes dès qu'un test enchaîne plusieurs hachages.
const DELAI_ARGON2_MS = 20000;

const MOT_DE_PASSE = "MonMotDePasse1!";

// Construit un utilisateur en mémoire, sans persistance.
function utilisateurEnMemoire(id: number, idOrganisation: number): Utilisateur {
    const utilisateur = new Utilisateur();
    utilisateur.id = id;
    utilisateur.id_organisation = idOrganisation;
    utilisateur.email = "animateur@exemple.fr";
    utilisateur.nom = "Animateur";
    utilisateur.mot_de_passe = "peu-importe";

    return utilisateur;
}

describe("hacherMotDePasse", () => {
    it("produit un hash de la variante argon2id", async () => {
        const hash = await hacherMotDePasse(MOT_DE_PASSE);

        // Le préfixe de l'encodage PHC nomme la variante employée. argon2id
        // est le compromis recommandé : il résiste à la fois aux attaques par
        // canal auxiliaire (comme argon2i) et au GPU (comme argon2d).
        expect(hash.startsWith("$argon2id$")).toBe(true);
    }, DELAI_ARGON2_MS);

    it("produit deux hash différents pour le même mot de passe", async () => {
        const premier = await hacherMotDePasse(MOT_DE_PASSE);
        const second = await hacherMotDePasse(MOT_DE_PASSE);

        // Preuve que le sel est tiré au hasard à chaque appel. Sans sel, deux
        // utilisateurs ayant choisi le même mot de passe partageraient le même
        // hash : une seule table précalculée les découvrirait tous les deux.
        expect(premier).not.toBe(second);
    }, DELAI_ARGON2_MS);

    it("ne laisse jamais apparaître le mot de passe en clair dans le hash", async () => {
        const hash = await hacherMotDePasse(MOT_DE_PASSE);

        expect(hash.includes(MOT_DE_PASSE)).toBe(false);
    }, DELAI_ARGON2_MS);
});

describe("verifierMotDePasse", () => {
    it("accepte le bon mot de passe", async () => {
        const hash = await hacherMotDePasse(MOT_DE_PASSE);

        expect(await verifierMotDePasse(hash, MOT_DE_PASSE)).toBe(true);
    }, DELAI_ARGON2_MS);

    it("refuse un mauvais mot de passe", async () => {
        const hash = await hacherMotDePasse(MOT_DE_PASSE);

        expect(await verifierMotDePasse(hash, "MauvaisMotDePasse1!")).toBe(false);
    }, DELAI_ARGON2_MS);

    it("refuse un mot de passe qui ne diffère que par la casse", async () => {
        const hash = await hacherMotDePasse(MOT_DE_PASSE);

        expect(await verifierMotDePasse(hash, MOT_DE_PASSE.toLowerCase())).toBe(false);
    }, DELAI_ARGON2_MS);

    it("renvoie false sur un hash malformé, sans lever d'exception", async () => {
        // Cas réel : une colonne mot_de_passe vide ou remplie par un ancien
        // format. La fonction doit répondre « non » plutôt que faire tomber la
        // route de connexion en erreur 500.
        await expect(verifierMotDePasse("pas-un-hash-argon2", MOT_DE_PASSE))
            .resolves.toBe(false);
    }, DELAI_ARGON2_MS);

    it("renvoie false sur un hash vide, sans lever d'exception", async () => {
        await expect(verifierMotDePasse("", MOT_DE_PASSE)).resolves.toBe(false);
    }, DELAI_ARGON2_MS);
});

describe("genererToken", () => {
    it("place l'identifiant et l'organisation dans le payload", () => {
        const utilisateur = utilisateurEnMemoire(42, 7);

        const payload = jwt.verify(genererToken(utilisateur), JWT_SECRET) as jwt.JwtPayload;

        expect(payload.sub).toBe(42);
        expect(payload.org).toBe(7);
    });

    it("n'emporte ni le mot de passe ni l'email dans le payload", () => {
        const utilisateur = utilisateurEnMemoire(42, 7);

        const token = genererToken(utilisateur);
        const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

        // Un JWT n'est pas chiffré : son payload se lit en clair par simple
        // décodage base64url. Tout ce qu'on y met est donc public de fait, et
        // ne doit contenir que ce qui identifie le porteur.
        expect(payload).not.toHaveProperty("mot_de_passe");
        expect(payload).not.toHaveProperty("email");

        // Vérification de bout en bout : la chaîne du token, telle qu'elle
        // circule, ne contient pas les valeurs sensibles.
        expect(token.includes(utilisateur.email)).toBe(false);
        expect(token.includes(utilisateur.mot_de_passe)).toBe(false);
    });

    it("n'emporte aucune donnée personnelle au-delà des identifiants", () => {
        const utilisateur = utilisateurEnMemoire(42, 7);

        const token = genererToken(utilisateur);
        const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

        expect(payload).not.toHaveProperty("nom");

        // Plutôt que d'énumérer les champs interdits un à un — liste qu'on
        // oublierait de compléter en ajoutant une colonne à l'entité — on fixe
        // la liste de ce qui est ATTENDU. Tout champ nouveau fera échouer ce
        // test, ce qui force à se demander s'il a sa place dans un jeton public.
        expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "org", "sub"]);

        expect(token.includes(utilisateur.nom)).toBe(false);
    });

    it("produit deux tokens différents pour deux utilisateurs", () => {
        const premier = utilisateurEnMemoire(42, 7);
        const second = utilisateurEnMemoire(43, 7);

        // Deux porteurs distincts ne doivent jamais partager un jeton :
        // sans cela, l'un agirait sous l'identité de l'autre.
        expect(genererToken(premier)).not.toBe(genererToken(second));
    });

    it("borne la durée de vie du token à 900 secondes", () => {
        const utilisateur = utilisateurEnMemoire(42, 7);

        const payload = jwt.verify(genererToken(utilisateur), JWT_SECRET) as jwt.JwtPayload;

        // JWT_EXPIRY vaut "15m", soit 900 s. On mesure l'écart entre les deux
        // horodatages plutôt qu'une date absolue : le test ne dépend alors pas
        // de l'heure à laquelle il tourne.
        expect(payload.exp! - payload.iat!).toBe(900);
    });

    it("produit un token qui ne se vérifie pas avec un autre secret", () => {
        const utilisateur = utilisateurEnMemoire(42, 7);

        const token = genererToken(utilisateur);

        // C'est la signature qui fait toute la valeur du JWT : sans le secret,
        // un tiers peut lire le payload mais ne peut ni le forger ni le
        // modifier sans que la vérification échoue.
        expect(() => jwt.verify(token, "un-autre-secret")).toThrow();
    });
});
