import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import {
    creerSession,
    lireSession,
    lireSessionParCode,
    listerManches,
    listerQuestionsDeLaManche,
    demarrerSession,
    annulerSession,
    terminerSession,
} from "../../../src/controllers/SessionsControleur";
import { Session } from "../../../src/entities/Session";
import { SessionTheme } from "../../../src/entities/SessionTheme";
import { SessionQuestion } from "../../../src/entities/SessionQuestion";
import { ReceptionCarte } from "../../../src/entities/ReceptionCarte";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import { NOMBRE_MANCHES, QUESTIONS_PAR_MANCHE } from "../../../src/config/config";
import {
    creerContexteMinimal,
    creerOrganisation,
    creerUtilisateur,
    creerThemeAvecQuestions,
    creerSession as fabriquerSession,
    creerParticipants,
    creerCarte,
    creerReceptionCarte,
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

function fabriquerRequetePublique(params: Record<string, string> = {}): Request {
    return { body: {}, params } as unknown as Request;
}

async function preparerAnimateurEtThemes() {
    const { organisation, animateur } = await creerContexteMinimal();

    const idsThemes: number[] = [];

    for (let i = 0; i < NOMBRE_MANCHES; i++) {
        const { theme } = await creerThemeAvecQuestions(organisation.id);
        idsThemes.push(theme.id);
    }

    return { organisation, animateur, idsThemes };
}

describe("creerSession", () => {
    it("crée la session, ses manches et son tirage de questions", async () => {
        const { animateur, idsThemes } = await preparerAnimateurEtThemes();
        const res = fabriquerReponse();

        await creerSession(fabriquerRequete(animateur, { id_themes: idsThemes }), res);

        expect(res.status).toHaveBeenCalledWith(201);

        const corps = res.json.mock.calls[0]?.[0] as { id: number; statut: string };

        expect(corps.statut).toBe("en_attente");

        const manches = await SessionTheme.findBy({ id_session: corps.id });
        expect(manches).toHaveLength(NOMBRE_MANCHES);

        const tirage = await SessionQuestion.findBy({ id_session: corps.id });
        expect(tirage).toHaveLength(NOMBRE_MANCHES * QUESTIONS_PAR_MANCHE);
    });

    it("refuse les thèmes d'une autre organisation", async () => {
        const { animateur } = await preparerAnimateurEtThemes();

        const autreOrganisation = await creerOrganisation();
        const idsEtrangers: number[] = [];

        for (let i = 0; i < NOMBRE_MANCHES; i++) {
            const { theme } = await creerThemeAvecQuestions(autreOrganisation.id);
            idsEtrangers.push(theme.id);
        }

        const res = fabriquerReponse();
        await creerSession(fabriquerRequete(animateur, { id_themes: idsEtrangers }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(await Session.findBy({ id_animateur: animateur.id })).toHaveLength(0);
    });

    it("refuse deux fois le même thème", async () => {
        const { animateur, idsThemes } = await preparerAnimateurEtThemes();
        const premier = idsThemes[0];

        const res = fabriquerReponse();
        await creerSession(
            fabriquerRequete(animateur, { id_themes: [premier, premier, idsThemes[1]] }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe("lireSession", () => {
    it("renvoie la session à son animateur", async () => {
        const { animateur } = await preparerAnimateurEtThemes();
        const session = await fabriquerSession(animateur.id);

        const res = fabriquerReponse();
        await lireSession(fabriquerRequete(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("refuse un animateur qui n'est pas le sien", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const intrus = await creerUtilisateur(organisation.id);
        const session = await fabriquerSession(animateur.id);

        const res = fabriquerReponse();
        await lireSession(fabriquerRequete(intrus, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("répond 404 sur une session inexistante", async () => {
        const { animateur } = await creerContexteMinimal();

        const res = fabriquerReponse();
        await lireSession(fabriquerRequete(animateur, {}, { id: "999999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("lireSessionParCode", () => {
    it("renvoie la session sans divulguer l'animateur", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id);

        const res = fabriquerReponse();
        await lireSessionParCode(
            fabriquerRequetePublique({ code: String(session.code_acces) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).not.toContain("id_animateur");
        expect(corps).not.toContain("date_debut_question");
    });

    it("ne retrouve pas une session terminée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id, { statut: "terminee" });

        const res = fabriquerReponse();
        await lireSessionParCode(
            fabriquerRequetePublique({ code: String(session.code_acces) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("listerManches et listerQuestionsDeLaManche", () => {
    it("liste les manches avec le libellé de leur thème", async () => {
        const { animateur, idsThemes } = await preparerAnimateurEtThemes();

        const creation = fabriquerReponse();
        await creerSession(fabriquerRequete(animateur, { id_themes: idsThemes }), creation);
        const { id } = creation.json.mock.calls[0]?.[0] as { id: number };

        const res = fabriquerReponse();
        await listerManches(fabriquerRequete(animateur, {}, { id: String(id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const manches = res.json.mock.calls[0]?.[0] as Array<{ libelle_theme: string | null }>;

        expect(manches).toHaveLength(NOMBRE_MANCHES);
        expect(manches[0]?.libelle_theme).not.toBeNull();
    });

    it("ne divulgue ni les propositions ni la bonne réponse du tirage", async () => {
        const { animateur, idsThemes } = await preparerAnimateurEtThemes();

        const creation = fabriquerReponse();
        await creerSession(fabriquerRequete(animateur, { id_themes: idsThemes }), creation);
        const { id } = creation.json.mock.calls[0]?.[0] as { id: number };

        const res = fabriquerReponse();
        await listerQuestionsDeLaManche(
            fabriquerRequete(animateur, {}, { id: String(id), numero: "1" }),
            res
        );

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).not.toContain("index_bonne_reponse");
        expect(corps).not.toContain("proposition_1");
    });
});

describe("demarrerSession", () => {
    it("refuse de démarrer avec un seul participant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id);
        await creerParticipants(session.id, [0]);

        const res = fabriquerReponse();
        await demarrerSession(fabriquerRequete(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("démarre avec deux participants et ouvre la manche 1", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id);
        await creerParticipants(session.id, [0, 0]);

        const res = fabriquerReponse();
        await demarrerSession(fabriquerRequete(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const misAJour = await Session.findOneBy({ id: session.id });

        expect(misAJour?.statut).toBe("en_cours");
        expect(misAJour?.numero_manche_courante).toBe(1);
        expect(misAJour?.date_debut).not.toBeNull();
    });

    it("refuse un animateur étranger à la session", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const intrus = await creerUtilisateur(organisation.id);
        const session = await fabriquerSession(animateur.id);
        await creerParticipants(session.id, [0, 0]);

        const res = fabriquerReponse();
        await demarrerSession(fabriquerRequete(intrus, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect((await Session.findOneBy({ id: session.id }))?.statut).toBe("en_attente");
    });

    it("refuse de démarrer deux fois", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id);
        await creerParticipants(session.id, [0, 0]);

        await demarrerSession(
            fabriquerRequete(animateur, {}, { id: String(session.id) }),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await demarrerSession(fabriquerRequete(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });
});

describe("terminerSession et annulerSession", () => {
    it("termine la partie et fait expirer les cartes non jouées", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        const [joueur] = await creerParticipants(session.id, [100]);
        const carte = await creerCarte();
        const reception = await creerReceptionCarte(joueur!.id, carte.id);

        const res = fabriquerReponse();
        await terminerSession(fabriquerRequete(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect((await Session.findOneBy({ id: session.id }))?.statut).toBe("terminee");

        expect((await ReceptionCarte.findOneBy({ id: reception.id }))?.statut).toBe("expiree");
    });

    it("annule la partie et fait expirer les cartes non jouées", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
        });
        const [joueur] = await creerParticipants(session.id, [0]);
        const carte = await creerCarte();
        const reception = await creerReceptionCarte(joueur!.id, carte.id);

        const res = fabriquerReponse();
        await annulerSession(fabriquerRequete(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect((await Session.findOneBy({ id: session.id }))?.statut).toBe("annulee");
        expect((await ReceptionCarte.findOneBy({ id: reception.id }))?.statut).toBe("expiree");
    });

    it("refuse l'annulation par un autre animateur", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const intrus = await creerUtilisateur(organisation.id);
        const session = await fabriquerSession(animateur.id);

        const res = fabriquerReponse();
        await annulerSession(fabriquerRequete(intrus, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect((await Session.findOneBy({ id: session.id }))?.statut).toBe("en_attente");
    });

    it("refuse d'annuler une partie déjà terminée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await fabriquerSession(animateur.id, { statut: "terminee" });

        const res = fabriquerReponse();
        await annulerSession(fabriquerRequete(animateur, {}, { id: String(session.id) }), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });
});
