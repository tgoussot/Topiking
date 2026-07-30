import { describe, it, expect } from "@jest/globals";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { LoginDto } from "../../../src/dto/LoginDto";

const BODY_VALIDE = {
    email: "animateur@exemple.fr",
    mot_de_passe: "MonMotDePasse1!",
};

async function proprietesEnErreur(body: Record<string, unknown>): Promise<string[]> {
    const dto = plainToInstance(LoginDto, body);
    const erreurs = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    return erreurs.map((erreur) => erreur.property);
}

describe("LoginDto", () => {
    it("accepte un body valide", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE })).toEqual([]);
    });

    it("rejette un email malformé", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE, email: "pas-un-email" }))
            .toContain("email");
    });

    it("rejette un mot de passe vide", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE, mot_de_passe: "" }))
            .toContain("mot_de_passe");
    });

    // ------------------------------------------------------------------
    // Choix délibéré : LoginDto n'impose PAS @IsStrongPassword.
    //
    // À la connexion, la robustesse du mot de passe n'est plus une question
    // ouverte : elle a été tranchée à l'inscription. Ce qui se joue ici est
    // seulement « ce secret correspond-il au hash enregistré ? ».
    //
    // Reprendre la règle de force à la connexion aurait deux défauts :
    //  - elle refuserait 400 aux comptes créés avant un durcissement de la
    //    règle, enfermant dehors des utilisateurs légitimes ;
    //  - elle transformerait la route de connexion en oracle : un 400 plutôt
    //    qu'un 401 révélerait à un attaquant que la forme du mot de passe
    //    essayé est plausible, ce qui restreint son espace de recherche.
    //
    // Un mot de passe faible doit donc franchir la validation et échouer
    // ensuite sur la comparaison, avec un 401 indistinguable des autres.
    // Restent @IsEmail, @IsNotEmpty et @MaxLength(32) : de la simple hygiène
    // d'entrée, qui écarte les requêtes vides ou démesurées sans rien dire de
    // la validité des identifiants.
    // ------------------------------------------------------------------
    it("accepte un mot de passe faible, par choix délibéré", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE, mot_de_passe: "1234" }))
            .toEqual([]);
    });

    it("rejette un champ non déclaré", async () => {
        expect(await proprietesEnErreur({ ...BODY_VALIDE, admin: true }))
            .toContain("admin");
    });
});
