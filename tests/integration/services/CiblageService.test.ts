import { describe, it, expect, jest } from "@jest/globals";
import { classementGeneral } from "../../../src/services/ClassementService";
import {
    dejaToucheDansLaManche,
    ciblesEligibles,
    ciblesImposees,
    verifierCarteJouable,
    jouerCarte,
    jouerBonus,
    jouerMalus,
    appliquerMalusAPlusieurs,
} from "../../../src/services/CiblageService";
import { Participant } from "../../../src/entities/Participant";
import { ReceptionCarte } from "../../../src/entities/ReceptionCarte";
import { Session } from "../../../src/entities/Session";
import { CIBLES_MULTIPLES } from "../../../src/config";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipant,
    creerParticipants,
    creerCarte,
    creerReceptionCarte,
} from "../../helpers/fixtures";

// Met en place une partie jouable : session "en_cours", manche 1 entamée,
// fenêtre de cartes fraîchement ouverte, et N participants aux scores imposés.
// L'ordre du tableau de scores fixe l'ordre de création, donc les identifiants.
async function creerPartieEnCours(scores: number[]): Promise<{
    session: Session;
    participants: Participant[];
}> {
    const { animateur } = await creerContexteMinimal();

    const session = await creerSession(animateur.id, {
        statut: "en_cours",
        numero_manche_courante: 1,
        date_debut_fenetre_cartes: new Date(),
    });

    const participants = await creerParticipants(session.id, scores);

    return { session, participants };
}

describe("dejaToucheDansLaManche", () => {
    it("renvoie true si une carte jouée cible le joueur sur cette manche", async () => {
        const { participants } = await creerPartieEnCours([100, 200]);
        const attaquant = participants[0];
        const cible = participants[1];

        if (attaquant === undefined || cible === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        await creerReceptionCarte(attaquant.id, carte.id, {
            statut: "jouee",
            manche_application: 2,
            id_cible: cible.id,
        });

        expect(await dejaToucheDansLaManche(cible.id, 2)).toBe(true);
    });

    it("renvoie false pour une autre manche", async () => {
        const { participants } = await creerPartieEnCours([100, 200]);
        const attaquant = participants[0];
        const cible = participants[1];

        if (attaquant === undefined || cible === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        await creerReceptionCarte(attaquant.id, carte.id, {
            statut: "jouee",
            manche_application: 2,
            id_cible: cible.id,
        });

        expect(await dejaToucheDansLaManche(cible.id, 3)).toBe(false);
    });

    it("renvoie false si le statut n'est pas jouee", async () => {
        const { participants } = await creerPartieEnCours([100, 200]);
        const attaquant = participants[0];
        const cible = participants[1];

        if (attaquant === undefined || cible === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        await creerReceptionCarte(attaquant.id, carte.id, {
            statut: "en_main",
            manche_application: 2,
            id_cible: cible.id,
        });

        expect(await dejaToucheDansLaManche(cible.id, 2)).toBe(false);
    });

    it("renvoie false si le joueur n'a jamais été ciblé", async () => {
        const { participants } = await creerPartieEnCours([100, 200]);
        const cible = participants[1];

        if (cible === undefined) {
            throw new Error("Participant attendu");
        }

        expect(await dejaToucheDansLaManche(cible.id, 2)).toBe(false);
    });
});

describe("ciblesEligibles sous le seuil de ciblage multiple", () => {
    it("exclut le dernier du classement", async () => {
        const { session, participants } = await creerPartieEnCours([400, 300, 200, 100]);
        const attaquant = participants[0];
        const bonDernier = participants[3];

        if (attaquant === undefined || bonDernier === undefined) {
            throw new Error("Participants attendus");
        }

        const eligibles = await ciblesEligibles(session.id, attaquant.id, 2);

        expect(eligibles.map((p) => p.idParticipant)).not.toContain(bonDernier.id);
    });

    it("exclut l'attaquant lui-même", async () => {
        const { session, participants } = await creerPartieEnCours([400, 300, 200, 100]);
        const attaquant = participants[1];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const eligibles = await ciblesEligibles(session.id, attaquant.id, 2);

        expect(eligibles.map((p) => p.idParticipant)).not.toContain(attaquant.id);
    });

    it("exclut un joueur déjà touché dans la manche d'application", async () => {
        const { session, participants } = await creerPartieEnCours([400, 300, 200, 100]);
        const attaquant = participants[0];
        const dejaTouche = participants[1];

        if (attaquant === undefined || dejaTouche === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        await creerReceptionCarte(attaquant.id, carte.id, {
            statut: "jouee",
            manche_application: 2,
            id_cible: dejaTouche.id,
        });

        const eligibles = await ciblesEligibles(session.id, attaquant.id, 2);

        expect(eligibles.map((p) => p.idParticipant)).not.toContain(dejaTouche.id);
    });

    it("renvoie les joueurs restants", async () => {
        const { session, participants } = await creerPartieEnCours([500, 400, 300, 200, 100]);
        const attaquant = participants[0];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const eligibles = await ciblesEligibles(session.id, attaquant.id, 2);

        // Cinq joueurs, moins l'attaquant (en tête) et le dernier.
        expect(eligibles.map((p) => p.idParticipant)).toEqual([
            participants[1]?.id,
            participants[2]?.id,
            participants[3]?.id,
        ]);
    });

    it("renvoie un tableau vide si tous les candidats sont exclus", async () => {
        const { session, participants } = await creerPartieEnCours([300, 200, 100]);
        const attaquant = participants[0];
        const milieu = participants[1];

        if (attaquant === undefined || milieu === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        await creerReceptionCarte(attaquant.id, carte.id, {
            statut: "jouee",
            manche_application: 2,
            id_cible: milieu.id,
        });

        expect(await ciblesEligibles(session.id, attaquant.id, 2)).toEqual([]);
    });
});

describe("ciblesEligibles au-dessus du seuil de ciblage multiple", () => {
    it("bascule sur les cibles imposées, c'est-à-dire les premiers du classement", async () => {
        const { session, participants } = await creerPartieEnCours([700, 600, 500, 400, 300, 200, 100]);
        const attaquant = participants[6];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const eligibles = await ciblesEligibles(session.id, attaquant.id, 2);

        expect(eligibles.map((p) => p.idParticipant)).toEqual([
            participants[0]?.id,
            participants[1]?.id,
            participants[2]?.id,
        ]);
    });

    it("renvoie au maximum CIBLES_MULTIPLES cibles", async () => {
        const { session, participants } = await creerPartieEnCours([800, 700, 600, 500, 400, 300, 200, 100]);
        const attaquant = participants[7];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const eligibles = await ciblesEligibles(session.id, attaquant.id, 2);

        expect(eligibles).toHaveLength(CIBLES_MULTIPLES);
    });
});

describe("ciblesImposees", () => {
    it("renvoie les premiers du classement, plafonnés à CIBLES_MULTIPLES", async () => {
        const { session, participants } = await creerPartieEnCours([500, 400, 300, 200, 100]);
        const attaquant = participants[4];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const imposees = await ciblesImposees(session.id, attaquant.id, 2);

        expect(imposees.map((p) => p.idParticipant)).toEqual([
            participants[0]?.id,
            participants[1]?.id,
            participants[2]?.id,
        ]);
    });

    it("exclut le dernier, l'attaquant et les joueurs déjà touchés", async () => {
        const { session, participants } = await creerPartieEnCours([600, 500, 400, 300, 200, 100]);
        const attaquant = participants[1];
        const dejaTouche = participants[0];
        const bonDernier = participants[5];

        if (attaquant === undefined || dejaTouche === undefined || bonDernier === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        await creerReceptionCarte(attaquant.id, carte.id, {
            statut: "jouee",
            manche_application: 2,
            id_cible: dejaTouche.id,
        });

        const imposees = await ciblesImposees(session.id, attaquant.id, 2);

        expect(imposees.map((p) => p.idParticipant)).toEqual([
            participants[2]?.id,
            participants[3]?.id,
            participants[4]?.id,
        ]);
    });

    it("renvoie moins de CIBLES_MULTIPLES cibles si les candidats manquent", async () => {
        const { session, participants } = await creerPartieEnCours([300, 200, 100]);
        const attaquant = participants[0];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const imposees = await ciblesImposees(session.id, attaquant.id, 2);

        expect(imposees.map((p) => p.idParticipant)).toEqual([participants[1]?.id]);
    });
});

describe("réutilisation du classement déjà chargé", () => {
    it("ciblesEligibles renvoie le même résultat avec ou sans classement fourni", async () => {
        const { session, participants } = await creerPartieEnCours([500, 400, 300]);
        const attaquant = participants[0];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const sansClassement = await ciblesEligibles(session.id, attaquant.id, 2);

        const classement = await classementGeneral(session.id);
        const avecClassement = await ciblesEligibles(session.id, attaquant.id, 2, classement);

        expect(avecClassement).toEqual(sansClassement);
    });

    it("ciblesImposees renvoie le même résultat avec ou sans classement fourni", async () => {
        const { session, participants } = await creerPartieEnCours([700, 600, 500, 400, 300, 200, 100]);
        const attaquant = participants[6];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const sansClassement = await ciblesImposees(session.id, attaquant.id, 2);

        const classement = await classementGeneral(session.id);
        const avecClassement = await ciblesImposees(session.id, attaquant.id, 2, classement);

        expect(avecClassement).toEqual(sansClassement);
    });

    it("ne recharge pas les participants quand le classement est fourni", async () => {
        const { session, participants } = await creerPartieEnCours([500, 400, 300]);
        const attaquant = participants[0];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const classement = await classementGeneral(session.id);

        const espion = jest.spyOn(Participant, "findBy");

        await ciblesEligibles(session.id, attaquant.id, 2, classement);

        expect(espion).not.toHaveBeenCalled();

        espion.mockRestore();
    });

    it("utilise le classement fourni plutôt que l'état réel de la base", async () => {
        const { session, participants } = await creerPartieEnCours([500, 400, 300]);
        const attaquant = participants[0];
        const milieu = participants[1];

        if (attaquant === undefined || milieu === undefined) {
            throw new Error("Participants attendus");
        }

        const complet = await classementGeneral(session.id);
        const tronque = complet.slice(0, 2);

        const eligibles = await ciblesEligibles(session.id, attaquant.id, 2, tronque);

        expect(eligibles).toEqual([]);
    });
});

describe("verifierCarteJouable", () => {
    it("rejette une carte inexistante", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        await expect(verifierCarteJouable(joueur.id, 999)).rejects.toThrow("Carte introuvable");
    });

    it("rejette une carte appartenant à un autre joueur", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const proprietaire = participants[0];
        const intrus = participants[1];

        if (proprietaire === undefined || intrus === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte();
        const reception = await creerReceptionCarte(proprietaire.id, carte.id);

        await expect(verifierCarteJouable(intrus.id, reception.id)).rejects.toThrow(
            "ne vous appartient pas"
        );
    });

    it("rejette une carte déjà jouée", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte();
        const reception = await creerReceptionCarte(joueur.id, carte.id, { statut: "jouee" });

        await expect(verifierCarteJouable(joueur.id, reception.id)).rejects.toThrow(
            "Cette carte est déjà jouee"
        );
    });

    it("rejette une carte expirée", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte();
        const reception = await creerReceptionCarte(joueur.id, carte.id, { statut: "expiree" });

        await expect(verifierCarteJouable(joueur.id, reception.id)).rejects.toThrow(
            "Cette carte est déjà expiree"
        );
    });

    it("accepte une carte en main du bon joueur et charge la relation carte", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "bonus" });
        const reception = await creerReceptionCarte(joueur.id, carte.id);

        const verifiee = await verifierCarteJouable(joueur.id, reception.id);

        expect(verifiee.carte.type).toBe("bonus");
    });
});

describe("jouerCarte", () => {
    it("rejette si la fenêtre de cartes est fermée", async () => {
        const { session, participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        session.date_debut_fenetre_cartes = null;
        await session.save();

        const carte = await creerCarte({ type: "bonus" });
        const reception = await creerReceptionCarte(joueur.id, carte.id);

        await expect(jouerCarte(joueur.id, reception.id, null)).rejects.toThrow(
            "La fenêtre pour jouer une carte est fermée"
        );
    });

    it("rejette si la partie n'a pas démarré", async () => {
        const { session, participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        session.numero_manche_courante = null;
        await session.save();

        const carte = await creerCarte({ type: "bonus" });
        const reception = await creerReceptionCarte(joueur.id, carte.id);

        await expect(jouerCarte(joueur.id, reception.id, null)).rejects.toThrow(
            "La partie n'a pas démarré"
        );
    });

    it("applique la carte à la manche suivante", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "bonus" });
        const reception = await creerReceptionCarte(joueur.id, carte.id);

        const lignes = await jouerCarte(joueur.id, reception.id, null);

        expect(lignes[0]?.manche_application).toBe(2);
    });

    it("passe le statut de la carte à jouee", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "bonus" });
        const reception = await creerReceptionCarte(joueur.id, carte.id);

        await jouerCarte(joueur.id, reception.id, null);

        const relue = await ReceptionCarte.findOneBy({ id: reception.id });
        expect(relue?.statut).toBe("jouee");
    });
});

describe("jouerBonus", () => {
    it("rejette si une cible est fournie", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];
        const autre = participants[1];

        if (joueur === undefined || autre === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "bonus" });
        const reception = await creerReceptionCarte(joueur.id, carte.id);

        await expect(jouerCarte(joueur.id, reception.id, autre.id)).rejects.toThrow(
            "Un bonus s'applique à vous-même"
        );
    });

    it("applique le bonus au joueur lui-même, sans cible", async () => {
        const { participants } = await creerPartieEnCours([200, 100]);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "bonus" });
        const reception = await creerReceptionCarte(joueur.id, carte.id);

        const lignes = await jouerBonus(reception, null, 2);

        expect(lignes[0]?.id_cible).toBeNull();
    });
});

describe("jouerMalus sous le seuil de ciblage multiple", () => {
    it("rejette si aucune cible n'est fournie", async () => {
        const { participants } = await creerPartieEnCours([300, 200, 100]);
        const attaquant = participants[0];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        await expect(jouerCarte(attaquant.id, reception.id, null)).rejects.toThrow(
            "Un malus doit viser un adversaire"
        );
    });

    it("rejette une cible non éligible", async () => {
        const { participants } = await creerPartieEnCours([300, 200, 100]);
        const attaquant = participants[0];
        const bonDernier = participants[2];

        if (attaquant === undefined || bonDernier === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        await expect(jouerCarte(attaquant.id, reception.id, bonDernier.id)).rejects.toThrow(
            "Cette cible n'est pas autorisée"
        );
    });

    it("accepte une cible éligible et enregistre l'identifiant de la cible", async () => {
        const { participants } = await creerPartieEnCours([300, 200, 100]);
        const attaquant = participants[0];
        const cible = participants[1];

        if (attaquant === undefined || cible === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        const lignes = await jouerCarte(attaquant.id, reception.id, cible.id);

        expect(lignes[0]?.id_cible).toBe(cible.id);
    });
});

describe("jouerMalus ne charge le classement qu'une fois", () => {
    it("sous le seuil, ne construit le classement qu'une seule fois", async () => {
        const { participants } = await creerPartieEnCours([500, 400, 300]);
        const attaquant = participants[0];
        const cible = participants[1];

        if (attaquant === undefined || cible === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        const espion = jest.spyOn(Participant, "findBy");

        await jouerCarte(attaquant.id, reception.id, cible.id);

        expect(espion).toHaveBeenCalledTimes(1);

        espion.mockRestore();
    });

    it("au-dessus du seuil, ne construit le classement qu'une seule fois", async () => {
        const { participants } = await creerPartieEnCours([700, 600, 500, 400, 300, 200, 100]);
        const attaquant = participants[6];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        const espion = jest.spyOn(Participant, "findBy");

        await jouerCarte(attaquant.id, reception.id, null);

        expect(espion).toHaveBeenCalledTimes(1);

        espion.mockRestore();
    });
});

describe("jouerMalus au-dessus du seuil de ciblage multiple", () => {
    it("ignore la cible fournie et applique le malus aux cibles imposées", async () => {
        const { participants } = await creerPartieEnCours([700, 600, 500, 400, 300, 200, 100]);
        const attaquant = participants[6];
        const cibleIgnoree = participants[4];

        if (attaquant === undefined || cibleIgnoree === undefined) {
            throw new Error("Participants attendus");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        const lignes = await jouerCarte(attaquant.id, reception.id, cibleIgnoree.id);

        expect(lignes.map((l) => l.id_cible)).toEqual([
            participants[0]?.id,
            participants[1]?.id,
            participants[2]?.id,
        ]);
    });

    it("crée une ligne ReceptionCarte par cible", async () => {
        const { participants } = await creerPartieEnCours([700, 600, 500, 400, 300, 200, 100]);
        const attaquant = participants[6];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        await jouerCarte(attaquant.id, reception.id, null);

        expect(await ReceptionCarte.countBy({ id_participant: attaquant.id })).toBe(CIBLES_MULTIPLES);
    });

    it("rejette si aucune cible n'est disponible", async () => {
        const { participants } = await creerPartieEnCours([700, 600, 500, 400, 300, 200, 100]);
        const attaquant = participants[6];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const carteMalus = await creerCarte({ type: "malus" });

        // L'attaquant est ici le dernier du classement (score 100), déjà exclu
        // d'office. Il reste à neutraliser les six autres, participants[0] à
        // participants[5], pour qu'aucune cible ne subsiste.
        for (let i = 0; i < 6; i++) {
            const dejaTouche = participants[i];

            if (dejaTouche === undefined) {
                continue;
            }

            await creerReceptionCarte(attaquant.id, carteMalus.id, {
                statut: "jouee",
                manche_application: 2,
                id_cible: dejaTouche.id,
            });
        }

        const reception = await creerReceptionCarte(attaquant.id, carteMalus.id);

        await expect(jouerCarte(attaquant.id, reception.id, null)).rejects.toThrow(
            "Aucune cible disponible pour ce malus"
        );
    });
});

describe("appliquerMalusAPlusieurs", () => {
    it("réutilise la réception d'origine pour la première cible", async () => {
        const { session, participants } = await creerPartieEnCours([300, 200, 100]);
        const attaquant = participants[2];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        const cibles = await ciblesImposees(session.id, attaquant.id, 2);

        const lignes = await appliquerMalusAPlusieurs(reception, cibles, 2);

        expect(lignes[0]?.id).toBe(reception.id);
    });

    it("crée des lignes supplémentaires pour les cibles suivantes", async () => {
        const { session, participants } = await creerPartieEnCours([500, 400, 300, 200, 100]);
        const attaquant = participants[4];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        const cibles = await ciblesImposees(session.id, attaquant.id, 2);

        const lignes = await appliquerMalusAPlusieurs(reception, cibles, 2);

        expect(lignes.map((l) => l.id)).toHaveLength(cibles.length);
        expect(new Set(lignes.map((l) => l.id)).size).toBe(cibles.length);
    });

    it("marque toutes les lignes comme jouées sur la bonne manche d'application", async () => {
        const { session, participants } = await creerPartieEnCours([500, 400, 300, 200, 100]);
        const attaquant = participants[4];

        if (attaquant === undefined) {
            throw new Error("Participant attendu");
        }

        const carte = await creerCarte({ type: "malus" });
        const reception = await creerReceptionCarte(attaquant.id, carte.id);

        const cibles = await ciblesImposees(session.id, attaquant.id, 2);

        await appliquerMalusAPlusieurs(reception, cibles, 2);

        const enregistrees = await ReceptionCarte.findBy({ id_participant: attaquant.id });

        expect(enregistrees.every((l) => l.statut === "jouee" && l.manche_application === 2)).toBe(true);
    });
});
