import { describe, it, expect } from "@jest/globals";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterDto } from "../../../src/dto/RegisterDto";

// Les DTO sont éprouvés directement, sans passer par le middleware : on isole
// ainsi les règles de validation de leur mise en œuvre HTTP.

const BODY_VALIDE = {
    email: "animateur@exemple.fr",
    nom: "Animateur",
    mot_de_passe: "MonMotDePasse1!",
};

// Renvoie la liste des propriétés en erreur pour un body donné.
async function proprietesEnErreur(body: Record<string, unknown>): Promise<string[]> {
    const dto = plainToInstance(RegisterDto, body);
    const erreurs = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    return erreurs.map((erreur) => erreur.property);
}

describe("RegisterDto", () => {
    it("accepte un body minimal valide", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE })).toEqual([]);
    });

    it("rejette un email malformé", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE, email: "pas-un-email" }))
            .toContain("email");
    });

    it("rejette un mot de passe trop court", async () => {
        // @IsStrongPassword exige 12 caractères au minimum : en deçà, même un
        // mot de passe varié est refusé.
        expect(await proprietesEnErreur({ ...BODY_VALIDE, mot_de_passe: "Court1!" }))
            .toContain("mot_de_passe");
    });

    it("rejette un mot de passe de 33 caractères", async () => {
        // @MaxLength(32) borne le haut. Cette limite n'est pas cosmétique :
        // argon2 hache des entrées de taille arbitraire, et accepter des
        // mots de passe très longs offre un levier de déni de service, chaque
        // hachage étant coûteux par construction.
        const trenteTrois = "Aa1!" + "b".repeat(29);
        expect(trenteTrois).toHaveLength(33);

        expect(await proprietesEnErreur({ ...BODY_VALIDE, mot_de_passe: trenteTrois }))
            .toContain("mot_de_passe");
    });

    it("accepte un mot de passe de 32 caractères", async () => {
        // La borne elle-même doit passer : sans ce test, une régression en
        // < / <= resterait invisible.
        const trenteDeux = "Aa1!" + "b".repeat(28);
        expect(trenteDeux).toHaveLength(32);

        expect(await proprietesEnErreur({ ...BODY_VALIDE, mot_de_passe: trenteDeux }))
            .toEqual([]);
    });

    it("accepte un body sans code_invitation ni nom_organisation", async () => {
        // Les deux champs sont @IsOptional : le DTO ne tranche pas entre
        // « rejoindre » et « créer » une organisation. C'est le contrôleur qui
        // impose d'en fournir exactement un, et qui répond 400 sinon.
        expect(await proprietesEnErreur({ ...BODY_VALIDE })).toEqual([]);
    });

    it("rejette un champ non déclaré", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE, id_organisation: 1 }))
            .toContain("id_organisation");
    });

    it("rejette un nom trop court", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE, nom: "A" }))
            .toContain("nom");
    });
});
