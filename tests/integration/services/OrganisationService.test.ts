import { describe, it, expect } from "@jest/globals";
import { genererCodeInvitation } from "../../../src/services/Jeux/OrganisationService";
import { CODE_ACCES_MINIMUM, CODE_ACCES_MAXIMUM } from "../../../src/config/config";
import { creerOrganisation } from "../../helpers/fixtures";

// genererCodeInvitation interroge la table Organisation pour écarter les codes
// déjà attribués : elle ne peut donc être éprouvée qu'avec une base.

describe("genererCodeInvitation", () => {
    it("renvoie un code dans la plage à 6 chiffres", async () => {
        const code = await genererCodeInvitation();

        expect(code).toBeGreaterThanOrEqual(CODE_ACCES_MINIMUM);
        expect(code).toBeLessThanOrEqual(CODE_ACCES_MAXIMUM);

        // Un code à 6 chiffres qui ne commence jamais par 0 : c'est ce que la
        // borne minimale à 100000 garantit.
        expect(String(code)).toHaveLength(6);
    });

    it("renvoie un entier", async () => {
        const code = await genererCodeInvitation();

        expect(Number.isInteger(code)).toBe(true);
    });

    it("ne renvoie jamais un code déjà attribué", async () => {
        // La plage compte 900 000 valeurs : tomber par hasard sur le code
        // occupé est improbable, et ce test ne peut donc pas prouver à lui seul
        // que la base est consultée. Il vaut comme garde-fou de non-régression ;
        // c'est le test suivant, en s'appuyant sur la contrainte UNIQUE, qui
        // vérifie réellement que le code renvoyé est libre.
        const codeOccupe = CODE_ACCES_MINIMUM;
        await creerOrganisation({ code_invitation: codeOccupe });

        // Plusieurs tirages : un seul pourrait passer par chance.
        for (let essai = 0; essai < 20; essai++) {
            expect(await genererCodeInvitation()).not.toBe(codeOccupe);
        }
    });

    it("renvoie un code libre même lorsque plusieurs sont déjà pris", async () => {
        const codesOccupes = [100001, 100002, 100003];

        for (const code of codesOccupes) {
            await creerOrganisation({ code_invitation: code });
        }

        for (let essai = 0; essai < 20; essai++) {
            expect(codesOccupes).not.toContain(await genererCodeInvitation());
        }
    });

    it("renvoie un code réellement insérable en base", async () => {
        // La colonne code_invitation est UNIQUE : le meilleur juge de la
        // validité d'un code est la base elle-même, qui refuserait un doublon.
        await creerOrganisation({ code_invitation: CODE_ACCES_MINIMUM });

        const code = await genererCodeInvitation();
        const organisation = await creerOrganisation({ code_invitation: code });

        expect(organisation.id).toBeDefined();
        expect(organisation.code_invitation).toBe(code);
    });
});
