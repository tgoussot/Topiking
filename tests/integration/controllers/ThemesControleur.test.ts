import { describe, it, expect, jest } from "@jest/globals";
import type { Response } from "express";
import {
    creerTheme,
    lireTheme,
    listerThemes,
    modifierTheme,
    supprimerTheme,
} from "../../../src/controllers/ThemesControleur";
import { Theme } from "../../../src/entities/Theme";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import {
    creerContexteMinimal,
    creerOrganisation,
    creerUtilisateur,
    creerTheme as fabriquerTheme,
    creerThemeAvecQuestions,
    creerSession,
    creerSessionTheme,
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
    utilisateur: Utilisateur,
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): RequeteAuthentifiee {
    return { body, params, utilisateur } as unknown as RequeteAuthentifiee;
}

describe("listerThemes", () => {
    it("ne renvoie que les thèmes de l'organisation du demandeur", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        await fabriquerTheme(organisation.id, { libelle: "Le mien" });

        const voisine = await creerOrganisation();
        await fabriquerTheme(voisine.id, { libelle: "Celui du voisin" });

        const res = fabriquerReponse();
        await listerThemes(fabriquerRequete(animateur), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).toContain("Le mien");
        expect(corps).not.toContain("Celui du voisin");
    });
});

describe("creerTheme", () => {
    it("rattache le thème à l'organisation du token", async () => {
        const { organisation, animateur } = await creerContexteMinimal();

        const res = fabriquerReponse();
        await creerTheme(fabriquerRequete(animateur, { libelle: "Sécurité au travail" }), res);

        expect(res.status).toHaveBeenCalledWith(201);

        const theme = await Theme.findOneBy({ libelle: "Sécurité au travail" });

        expect(theme?.id_organisation).toBe(organisation.id);
        expect(theme?.actif).toBe(true);
    });

    it("ignore une organisation soufflée dans le corps de la requête", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const voisine = await creerOrganisation();

        const res = fabriquerReponse();
        await creerTheme(
            fabriquerRequete(animateur, {
                libelle: "Tentative",
                id_organisation: voisine.id,
            }),
            res
        );

        const theme = await Theme.findOneBy({ libelle: "Tentative" });

        expect(theme?.id_organisation).toBe(organisation.id);
    });
});

describe("lireTheme et modifierTheme", () => {
    it("refuse le thème d'une autre organisation", async () => {
        const { animateur } = await creerContexteMinimal();
        const voisine = await creerOrganisation();
        const themeVoisin = await fabriquerTheme(voisine.id);

        const res = fabriquerReponse();
        await lireTheme(fabriquerRequete(animateur, {}, { id: String(themeVoisin.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("répond 404 sur un thème inexistant", async () => {
        const { animateur } = await creerContexteMinimal();

        const res = fabriquerReponse();
        await lireTheme(fabriquerRequete(animateur, {}, { id: "999999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("ne modifie que les champs fournis", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await fabriquerTheme(organisation.id, { libelle: "Avant", actif: true });

        const res = fabriquerReponse();
        await modifierTheme(
            fabriquerRequete(animateur, { actif: false }, { id: String(theme.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const misAJour = await Theme.findOneBy({ id: theme.id });

        expect(misAJour?.actif).toBe(false);
        expect(misAJour?.libelle).toBe("Avant");
    });

    it("refuse de modifier le thème d'une autre organisation", async () => {
        const { animateur } = await creerContexteMinimal();
        const voisine = await creerOrganisation();
        const themeVoisin = await fabriquerTheme(voisine.id, { libelle: "Intact" });

        const res = fabriquerReponse();
        await modifierTheme(
            fabriquerRequete(animateur, { libelle: "Détourné" }, { id: String(themeVoisin.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect((await Theme.findOneBy({ id: themeVoisin.id }))?.libelle).toBe("Intact");
    });
});

describe("supprimerTheme", () => {
    it("supprime un thème vide et jamais joué", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await fabriquerTheme(organisation.id);

        const res = fabriquerReponse();
        await supprimerTheme(fabriquerRequete(animateur, {}, { id: String(theme.id) }), res);

        expect(res.status).toHaveBeenCalledWith(204);
        expect(await Theme.findOneBy({ id: theme.id })).toBeNull();
    });

    it("refuse de supprimer un thème qui porte des questions", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const { theme } = await creerThemeAvecQuestions(organisation.id);

        const res = fabriquerReponse();
        await supprimerTheme(fabriquerRequete(animateur, {}, { id: String(theme.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(await Theme.findOneBy({ id: theme.id })).not.toBeNull();
    });

    it("refuse de supprimer un thème déjà joué", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await fabriquerTheme(organisation.id);
        const session = await creerSession(animateur.id);
        await creerSessionTheme(session.id, theme.id, 1);

        const res = fabriquerReponse();
        await supprimerTheme(fabriquerRequete(animateur, {}, { id: String(theme.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("refuse de supprimer le thème d'une autre organisation", async () => {
        const { organisation } = await creerContexteMinimal();
        const voisine = await creerOrganisation();
        const intrus = await creerUtilisateur(voisine.id);
        const theme = await fabriquerTheme(organisation.id);

        const res = fabriquerReponse();
        await supprimerTheme(fabriquerRequete(intrus, {}, { id: String(theme.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(await Theme.findOneBy({ id: theme.id })).not.toBeNull();
    });
});
