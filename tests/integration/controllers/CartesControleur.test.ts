import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import {
    jouerUneCarte,
    listerCartesEnMain,
    listerCiblesPossibles,
    listerDeck,
} from "../../../src/controllers/CartesControleur";
import { ReceptionCarte } from "../../../src/entities/ReceptionCarte";
import { SEUIL_CIBLAGE_MULTIPLE, CIBLES_MULTIPLES } from "../../../src/config/config";
import {
    creerContexteMinimal,
    creerSession,
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
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
): Request {
    return { body, params } as unknown as Request;
}

async function preparerFenetreOuverte(scores: number[]) {
    const { animateur } = await creerContexteMinimal();

    const session = await creerSession(animateur.id, {
        statut: "en_cours",
        numero_manche_courante: 1,
        date_debut_fenetre_cartes: new Date(),
    });

    const joueurs = await creerParticipants(session.id, scores);

    return { animateur, session, joueurs };
}

describe("listerDeck", () => {
    it("liste les cartes du jeu", async () => {
        await creerCarte({ libelle: "Brouillage", type: "malus" });
        await creerCarte({ libelle: "Rallonge", type: "bonus", effet: "ajout_temps_s" });

        const res = fabriquerReponse();
        await listerDeck(fabriquerRequete(), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as Array<{ libelle: string }>;

        expect(corps).toHaveLength(2);
    });
});

describe("listerCartesEnMain", () => {
    it("ne renvoie que les cartes encore en main, avec leur libellé", async () => {
        const { session, joueurs } = await preparerFenetreOuverte([0, 0]);
        const carte = await creerCarte({ libelle: "Brouillage" });

        await creerReceptionCarte(joueurs[0]!.id, carte.id, { statut: "en_main" });
        await creerReceptionCarte(joueurs[0]!.id, carte.id, { statut: "jouee" });
        await creerReceptionCarte(joueurs[0]!.id, carte.id, { statut: "expiree" });

        const res = fabriquerReponse();
        await listerCartesEnMain(
            fabriquerRequete({}, { idParticipant: String(joueurs[0]!.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as Array<{ libelle: string; statut: string }>;

        expect(corps).toHaveLength(1);
        expect(corps[0]?.libelle).toBe("Brouillage");
        expect(session.id).toBeGreaterThan(0);
    });

    it("répond 404 sur un participant inexistant", async () => {
        const res = fabriquerReponse();
        await listerCartesEnMain(fabriquerRequete({}, { idParticipant: "999999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("listerCiblesPossibles", () => {
    it("laisse le choix des cibles sous le seuil", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);

        const res = fabriquerReponse();
        await listerCiblesPossibles(
            fabriquerRequete({}, { idParticipant: String(joueurs[0]!.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as {
            imposees: boolean;
            cibles: Array<{ id_participant: number }>;
        };

        expect(corps.imposees).toBe(false);

        expect(corps.cibles).toHaveLength(1);
        expect(corps.cibles[0]?.id_participant).toBe(joueurs[1]!.id);
    });

    it("impose les cibles au-delà du seuil", async () => {
        const scores: number[] = [];
        for (let i = 0; i < SEUIL_CIBLAGE_MULTIPLE + 1; i++) {
            scores.push(100 * (i + 1));
        }

        const { joueurs } = await preparerFenetreOuverte(scores);

        const res = fabriquerReponse();
        await listerCiblesPossibles(
            fabriquerRequete({}, { idParticipant: String(joueurs[0]!.id) }),
            res
        );

        const corps = res.json.mock.calls[0]?.[0] as {
            imposees: boolean;
            cibles: unknown[];
        };

        expect(corps.imposees).toBe(true);
        expect(corps.cibles).toHaveLength(CIBLES_MULTIPLES);
    });

    it("répond 409 si la partie n'a pas démarré", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurs = await creerParticipants(session.id, [0, 0]);

        const res = fabriquerReponse();
        await listerCiblesPossibles(
            fabriquerRequete({}, { idParticipant: String(joueurs[0]!.id) }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });
});

describe("jouerUneCarte", () => {
    it("joue un bonus sur soi-même", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);
        const bonus = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, bonus.id);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const misAJour = await ReceptionCarte.findOneBy({ id: reception.id });

        expect(misAJour?.statut).toBe("jouee");
        expect(misAJour?.id_cible).toBeNull();

        expect(misAJour?.manche_application).toBe(2);
    });

    it("refuse un bonus lancé sur un adversaire", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);
        const bonus = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, bonus.id);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id, id_cible: joueurs[1]!.id },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("joue un malus sur une cible autorisée", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);
        const malus = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, malus.id);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id, id_cible: joueurs[1]!.id },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect((await ReceptionCarte.findOneBy({ id: reception.id }))?.id_cible).toBe(
            joueurs[1]!.id
        );
    });

    it("refuse un malus visant le dernier du classement", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);
        const malus = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, malus.id);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id, id_cible: joueurs[2]!.id },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect((await ReceptionCarte.findOneBy({ id: reception.id }))?.statut).toBe("en_main");
    });

    it("refuse la carte d'un autre joueur", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, carte.id);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id },
                { idParticipant: String(joueurs[1]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect((await ReceptionCarte.findOneBy({ id: reception.id }))?.statut).toBe("en_main");
    });

    it("refuse de rejouer une carte déjà jouée", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);
        const bonus = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, bonus.id);

        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            fabriquerReponse()
        );

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("refuse de jouer hors de la fenêtre", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            numero_manche_courante: 1,
            date_debut_fenetre_cartes: null,
        });
        const joueurs = await creerParticipants(session.id, [300, 200, 100]);
        const bonus = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        const reception = await creerReceptionCarte(joueurs[0]!.id, bonus.id);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("frappe plusieurs cibles d'un coup au-delà du seuil", async () => {
        const scores: number[] = [];
        for (let i = 0; i < SEUIL_CIBLAGE_MULTIPLE + 1; i++) {
            scores.push(100 * (i + 1));
        }

        const { joueurs } = await preparerFenetreOuverte(scores);
        const malus = await creerCarte({ type: "malus" });

        const attaquant = joueurs[joueurs.length - 1]!;
        const reception = await creerReceptionCarte(attaquant.id, malus.id);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: reception.id },
                { idParticipant: String(attaquant.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = res.json.mock.calls[0]?.[0] as unknown[];

        expect(corps).toHaveLength(CIBLES_MULTIPLES);
    });

    it("répond 404 sur une carte inexistante", async () => {
        const { joueurs } = await preparerFenetreOuverte([300, 200, 100]);

        const res = fabriquerReponse();
        await jouerUneCarte(
            fabriquerRequete(
                { id_reception: 999999 },
                { idParticipant: String(joueurs[0]!.id) }
            ),
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
