import { describe, it, expect, jest } from "@jest/globals";
import {
    tirerMalus,
    choisirBonus,
    attribuerCarte,
    distribuerFinManche,
    cartesEnMain,
} from "../../../src/services/Jeux/DistributionCarteService";
import { ReceptionCarte } from "../../../src/entities/ReceptionCarte";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipant,
    creerThemeAvecQuestions,
    creerSessionQuestion,
    creerReponse,
    creerCarte,
    creerReceptionCarte,
} from "../../helpers/fixtures";

describe("tirerMalus", () => {
    it("renvoie une carte de type malus", async () => {
        await creerCarte({ type: "malus" });

        const carte = await tirerMalus();

        expect(carte?.type).toBe("malus");
    });

    it("ne renvoie jamais une carte bonus quand les deux types coexistent", async () => {
        await creerCarte({ type: "malus" });
        await creerCarte({ type: "bonus" });
        await creerCarte({ type: "bonus" });

        const typesTires: string[] = [];

        for (let essai = 0; essai < 30; essai++) {
            const carte = await tirerMalus();
            typesTires.push(carte?.type ?? "aucune");
        }

        expect(typesTires.every((type) => type === "malus")).toBe(true);
    });

    it("renvoie null si aucune carte malus n'existe", async () => {
        await creerCarte({ type: "bonus" });

        expect(await tirerMalus()).toBeNull();
    });
});

describe("choisirBonus", () => {
    it("renvoie une carte de type bonus", async () => {
        await creerCarte({ type: "bonus" });

        const carte = await choisirBonus(1);

        expect(carte?.type).toBe("bonus");
    });

    it("parcourt les bonus de façon cyclique selon le numéro de manche", async () => {
        const premierBonus = await creerCarte({ type: "bonus" });
        const secondBonus = await creerCarte({ type: "bonus" });

        const choisis = [
            (await choisirBonus(1))?.id,
            (await choisirBonus(2))?.id,
            (await choisirBonus(3))?.id,
        ];

        expect(choisis).toEqual([premierBonus.id, secondBonus.id, premierBonus.id]);
    });

    it("renvoie null si aucune carte bonus n'existe", async () => {
        await creerCarte({ type: "malus" });

        expect(await choisirBonus(1)).toBeNull();
    });

    it("est déterministe pour un même numéro de manche", async () => {
        await creerCarte({ type: "bonus" });
        await creerCarte({ type: "bonus" });

        const premierAppel = await choisirBonus(2);
        const secondAppel = await choisirBonus(2);

        expect(premierAppel?.id).toBe(secondAppel?.id);
    });
});

describe("attribuerCarte", () => {
    it("crée une réception au statut en_main", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const carte = await creerCarte({ type: "malus" });

        const reception = await attribuerCarte(joueur.id, carte.id, 3);

        expect(reception).toMatchObject({
            id_participant: joueur.id,
            id_carte: carte.id,
            numero_manche: 3,
            statut: "en_main",
        });
    });

    it("laisse manche_application et id_cible à null à la création", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const carte = await creerCarte({ type: "malus" });

        const reception = await attribuerCarte(joueur.id, carte.id, 1);

        expect([reception.manche_application, reception.id_cible]).toEqual([null, null]);
    });
});

describe("distribuerFinManche", () => {
    it("donne le malus au premier et le bonus au dernier", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 1);
        const perdant = await creerParticipant(session.id);
        const gagnant = await creerParticipant(session.id);

        const question = questions[0];

        if (question === undefined) {
            throw new Error("La question attendue n'a pas été créée");
        }

        await creerSessionQuestion(session.id, question.id, 1, 1);
        await creerReponse(perdant.id, question.id, { points: 10 });
        await creerReponse(gagnant.id, question.id, { points: 500 });

        const malus = await creerCarte({ type: "malus" });
        const bonus = await creerCarte({ type: "bonus" });

        const resultat = await distribuerFinManche(session.id, 1);

        expect([
            resultat.malusAuPremier?.id_participant,
            resultat.malusAuPremier?.id_carte,
            resultat.bonusAuDernier?.id_participant,
            resultat.bonusAuDernier?.id_carte,
        ]).toEqual([gagnant.id, malus.id, perdant.id, bonus.id]);
    });

    it("ne distribue rien avec un seul joueur", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipant(session.id);
        await creerCarte({ type: "malus" });
        await creerCarte({ type: "bonus" });

        const resultat = await distribuerFinManche(session.id, 1);

        // Sinon l'unique joueur recevrait à la fois le malus et le bonus.
        expect([resultat.malusAuPremier, resultat.bonusAuDernier]).toEqual([null, null]);
    });

    it("ne distribue rien sans aucun joueur", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerCarte({ type: "malus" });
        await creerCarte({ type: "bonus" });

        await distribuerFinManche(session.id, 1);

        expect(await ReceptionCarte.count()).toBe(0);
    });

    it("renvoie le classement de la manche dans son résultat", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const { questions } = await creerThemeAvecQuestions(organisation.id, 1);
        const perdant = await creerParticipant(session.id);
        const gagnant = await creerParticipant(session.id);

        const question = questions[0];

        if (question === undefined) {
            throw new Error("La question attendue n'a pas été créée");
        }

        await creerSessionQuestion(session.id, question.id, 1, 1);
        await creerReponse(perdant.id, question.id, { points: 10 });
        await creerReponse(gagnant.id, question.id, { points: 500 });

        const resultat = await distribuerFinManche(session.id, 1);

        expect(resultat.classement.map((score) => score.idParticipant)).toEqual([
            gagnant.id,
            perdant.id,
        ]);
    });

    it("attribue quand même le bonus si aucune carte malus n'existe", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const premierJoueur = await creerParticipant(session.id);
        const secondJoueur = await creerParticipant(session.id);
        const bonus = await creerCarte({ type: "bonus" });

        const resultat = await distribuerFinManche(session.id, 1);

        // Sans réponse, les deux joueurs sont à 0 : le départage par identifiant
        // met le plus petit en tête, donc le dernier est le second joueur.
        expect([resultat.malusAuPremier, resultat.bonusAuDernier?.id_carte]).toEqual([
            null,
            bonus.id,
        ]);
        expect(resultat.bonusAuDernier?.id_participant).toBe(secondJoueur.id);
        expect(premierJoueur.id).toBeLessThan(secondJoueur.id);
    });

    it("persiste en base les cartes distribuées", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipant(session.id);
        await creerParticipant(session.id);
        await creerCarte({ type: "malus" });
        await creerCarte({ type: "bonus" });

        await distribuerFinManche(session.id, 1);

        expect(await ReceptionCarte.count()).toBe(2);
    });
});

describe("cartesEnMain", () => {
    it("ne renvoie que les cartes au statut en_main", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const carte = await creerCarte({ type: "malus" });

        const enMain = await creerReceptionCarte(joueur.id, carte.id, { statut: "en_main" });
        await creerReceptionCarte(joueur.id, carte.id, { statut: "jouee" });
        await creerReceptionCarte(joueur.id, carte.id, { statut: "expiree" });

        const cartes = await cartesEnMain(joueur.id);

        expect(cartes.map((reception) => reception.id)).toEqual([enMain.id]);
    });

    it("trie les cartes par numéro de manche croissant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const carte = await creerCarte({ type: "malus" });

        await creerReceptionCarte(joueur.id, carte.id, { numero_manche: 3 });
        await creerReceptionCarte(joueur.id, carte.id, { numero_manche: 1 });
        await creerReceptionCarte(joueur.id, carte.id, { numero_manche: 2 });

        const cartes = await cartesEnMain(joueur.id);

        expect(cartes.map((reception) => reception.numero_manche)).toEqual([1, 2, 3]);
    });

    it("charge la relation carte", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const carte = await creerCarte({ type: "bonus" });

        await creerReceptionCarte(joueur.id, carte.id);

        const cartes = await cartesEnMain(joueur.id);

        expect(cartes[0]?.carte.type).toBe("bonus");
    });

    it("renvoie un tableau vide si le joueur n'a aucune carte", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);

        expect(await cartesEnMain(joueur.id)).toEqual([]);
    });

    it("ne renvoie pas les cartes des autres joueurs", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const voisin = await creerParticipant(session.id);
        const carte = await creerCarte({ type: "malus" });

        await creerReceptionCarte(voisin.id, carte.id);

        expect(await cartesEnMain(joueur.id)).toEqual([]);
    });
});

describe("tirage aléatoire du malus", () => {
    it("sélectionne la carte à l'index dicté par Math.random", async () => {
        const premierMalus = await creerCarte({ type: "malus" });
        const secondMalus = await creerCarte({ type: "malus" });

        const aleatoire = jest.spyOn(Math, "random").mockReturnValue(0.99);

        try {
            const carte = await tirerMalus();
            expect(carte?.id).toBe(secondMalus.id);
            expect(premierMalus.id).toBeLessThan(secondMalus.id);
        } finally {
            aleatoire.mockRestore();
        }
    });
});
