import { describe, it, expect, jest } from "@jest/globals";
import type { Response } from "express";
import {
    creerQuestion,
    lireQuestion,
    listerQuestionsDuTheme,
    modifierQuestion,
    supprimerQuestion,
} from "../../../src/controllers/QuestionsControleur";
import { Question } from "../../../src/entities/Question";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import {
    creerContexteMinimal,
    creerOrganisation,
    creerUtilisateur,
    creerTheme,
    creerQuestion as fabriquerQuestion,
    creerSession,
    creerSessionQuestion,
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

const QUESTION_VALIDE = {
    enonce: "Quelle est la capitale de la France ?",
    proposition_1: "Lyon",
    proposition_2: "Paris",
    proposition_3: "Marseille",
    proposition_4: "Lille",
    index_bonne_reponse: 2,
    duree_s: 20,
};

describe("creerQuestion", () => {
    it("crée la question dans le thème demandé", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await creerTheme(organisation.id);

        const res = fabriquerReponse();
        await creerQuestion(
            fabriquerRequete(animateur, QUESTION_VALIDE, { idTheme: String(theme.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(201);

        const question = await Question.findOneBy({ enonce: QUESTION_VALIDE.enonce });

        expect(question?.id_theme).toBe(theme.id);
        expect(question?.index_bonne_reponse).toBe(2);
    });

    it("refuse d'écrire dans le thème d'une autre organisation", async () => {
        const { animateur } = await creerContexteMinimal();
        const voisine = await creerOrganisation();
        const themeVoisin = await creerTheme(voisine.id);

        const res = fabriquerReponse();
        await creerQuestion(
            fabriquerRequete(animateur, QUESTION_VALIDE, { idTheme: String(themeVoisin.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect(await Question.findOneBy({ enonce: QUESTION_VALIDE.enonce })).toBeNull();
    });

    it("répond 404 sur un thème inexistant", async () => {
        const { animateur } = await creerContexteMinimal();

        const res = fabriquerReponse();
        await creerQuestion(
            fabriquerRequete(animateur, QUESTION_VALIDE, { idTheme: "999999" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("lireQuestion", () => {
    it("expose la bonne réponse à l'animateur", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await creerTheme(organisation.id);
        const question = await fabriquerQuestion(theme.id, { index_bonne_reponse: 3 });

        const res = fabriquerReponse();
        await lireQuestion(fabriquerRequete(animateur, {}, { id: String(question.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as { index_bonne_reponse: number };

        expect(corps.index_bonne_reponse).toBe(3);
    });

    it("refuse la question d'une autre organisation", async () => {
        const { animateur } = await creerContexteMinimal();
        const voisine = await creerOrganisation();
        const themeVoisin = await creerTheme(voisine.id);
        const questionVoisine = await fabriquerQuestion(themeVoisin.id);

        const res = fabriquerReponse();
        await lireQuestion(
            fabriquerRequete(animateur, {}, { id: String(questionVoisine.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe("listerQuestionsDuTheme", () => {
    it("ne renvoie que les questions du thème demandé", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await creerTheme(organisation.id);
        const autreTheme = await creerTheme(organisation.id);

        await fabriquerQuestion(theme.id, { enonce: "Dans le bon thème ?" });
        await fabriquerQuestion(autreTheme.id, { enonce: "Dans l'autre thème ?" });

        const res = fabriquerReponse();
        await listerQuestionsDuTheme(
            fabriquerRequete(animateur, {}, { idTheme: String(theme.id) }),
            res
        );

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).toContain("Dans le bon thème ?");
        expect(corps).not.toContain("Dans l'autre thème ?");
    });
});

describe("modifierQuestion", () => {
    it("ne modifie que les champs fournis", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await creerTheme(organisation.id);
        const question = await fabriquerQuestion(theme.id, {
            enonce: "Énoncé d'origine ?",
            duree_s: 10,
        });

        const res = fabriquerReponse();
        await modifierQuestion(
            fabriquerRequete(animateur, { duree_s: 45 }, { id: String(question.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const misAJour = await Question.findOneBy({ id: question.id });

        expect(misAJour?.duree_s).toBe(45);
        expect(misAJour?.enonce).toBe("Énoncé d'origine ?");
    });
});

describe("supprimerQuestion", () => {
    it("supprime une question jamais tirée", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await creerTheme(organisation.id);
        const question = await fabriquerQuestion(theme.id);

        const res = fabriquerReponse();
        await supprimerQuestion(
            fabriquerRequete(animateur, {}, { id: String(question.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(204);
        expect(await Question.findOneBy({ id: question.id })).toBeNull();
    });

    it("refuse de supprimer une question déjà tirée dans une partie", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const theme = await creerTheme(organisation.id);
        const question = await fabriquerQuestion(theme.id);
        const session = await creerSession(animateur.id);
        await creerSessionQuestion(session.id, question.id, 1, 1);

        const res = fabriquerReponse();
        await supprimerQuestion(
            fabriquerRequete(animateur, {}, { id: String(question.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(await Question.findOneBy({ id: question.id })).not.toBeNull();
    });

    it("refuse de supprimer la question d'une autre organisation", async () => {
        const { organisation } = await creerContexteMinimal();
        const voisine = await creerOrganisation();
        const intrus = await creerUtilisateur(voisine.id);
        const theme = await creerTheme(organisation.id);
        const question = await fabriquerQuestion(theme.id);

        const res = fabriquerReponse();
        await supprimerQuestion(fabriquerRequete(intrus, {}, { id: String(question.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(await Question.findOneBy({ id: question.id })).not.toBeNull();
    });
});
