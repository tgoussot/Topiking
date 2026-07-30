import { describe, it, expect } from "@jest/globals";
import {
    cartesActives,
    effetsPourJoueur,
    preparerQuestionPourJoueur,
    aBonusElan,
    effetsNeutres,
    grainePour,
    choisirMauvaiseProposition,
} from "../../../src/services/Jeux/EffetsService";
import { Question } from "../../../src/entities/Question";
import { Participant } from "../../../src/entities/Participant";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipant,
    creerTheme,
    creerQuestion,
    creerCarte,
    creerReceptionCarte,
} from "../../helpers/fixtures";

// Tests de la partie base de données du service : les fonctions qui lisent
// les cartes jouées en table.

// Décor minimal réutilisé partout : deux joueurs d'une même session et une
// question. Le second joueur sert d'attaquant pour les malus.
async function contexteDeJeu(
    surchargesQuestion: Partial<Question> = {}
): Promise<{ joueur: Participant; adversaire: Participant; question: Question }> {
    const { organisation, animateur } = await creerContexteMinimal();
    const session = await creerSession(animateur.id);
    const joueur = await creerParticipant(session.id);
    const adversaire = await creerParticipant(session.id);
    const theme = await creerTheme(organisation.id);
    const question = await creerQuestion(theme.id, surchargesQuestion);

    return { joueur, adversaire, question };
}

describe("cartesActives", () => {
    it("récupère un bonus rattaché au joueur par id_participant", async () => {
        const { joueur } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(1);
    });

    it("récupère un malus rattaché au joueur par id_cible", async () => {
        const { joueur, adversaire } = await contexteDeJeu();
        const carte = await creerCarte({ type: "malus", effet: "retrait_temps_s" });
        await creerReceptionCarte(adversaire.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(1);
    });

    it("ignore un bonus dont le joueur ne serait que la cible", async () => {
        // Cas incohérent : un bonus n'a pas de cible. Il ne doit profiter
        // qu'à celui qui le détient, pas à celui qui est désigné.
        const { joueur, adversaire } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        await creerReceptionCarte(adversaire.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(0);
    });

    it("ignore un malus rattaché au joueur par id_participant", async () => {
        // Le détenteur d'un malus est l'attaquant : il ne doit pas le subir.
        const { joueur, adversaire } = await contexteDeJeu();
        const carte = await creerCarte({ type: "malus", effet: "retrait_temps_s" });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: adversaire.id,
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(0);
    });

    it("ignore une carte appliquée à une autre manche", async () => {
        const { joueur } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 2,
            statut: "jouee",
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(0);
    });

    it("ignore une carte encore en main", async () => {
        const { joueur } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "en_main",
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(0);
    });

    it("ignore une carte expirée", async () => {
        const { joueur } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "expiree",
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(0);
    });

    it("renvoie un tableau vide quand aucune carte n'est en jeu", async () => {
        const { joueur } = await contexteDeJeu();

        expect(await cartesActives(joueur.id, 1)).toEqual([]);
    });

    it("cumule le bonus joué et le malus reçu sur la même manche", async () => {
        const { joueur, adversaire } = await contexteDeJeu();
        const bonus = await creerCarte({ type: "bonus", effet: "ajout_temps_s" });
        const malus = await creerCarte({ type: "malus", effet: "retrait_temps_s" });

        await creerReceptionCarte(joueur.id, bonus.id, {
            manche_application: 1,
            statut: "jouee",
        });
        await creerReceptionCarte(adversaire.id, malus.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const actives = await cartesActives(joueur.id, 1);

        expect(actives).toHaveLength(2);
    });
});

describe("effetsPourJoueur", () => {
    it("renvoie les effets neutres quand aucune carte n'est active", async () => {
        const { joueur, question } = await contexteDeJeu();

        expect(await effetsPourJoueur(joueur.id, question, 1)).toEqual(effetsNeutres());
    });

    it("ajoute le temps offert par une carte ajout_temps_s", async () => {
        const { joueur, question } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 5 });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        const effets = await effetsPourJoueur(joueur.id, question, 1);

        expect(effets.dureeDeltaMs).toBe(5000);
    });

    it("retire le temps volé par une carte retrait_temps_s", async () => {
        const { joueur, adversaire, question } = await contexteDeJeu();
        const carte = await creerCarte({ type: "malus", effet: "retrait_temps_s", intensite: 3 });
        await creerReceptionCarte(adversaire.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const effets = await effetsPourJoueur(joueur.id, question, 1);

        expect(effets.dureeDeltaMs).toBe(-3000);
    });

    it("compense algébriquement deux cartes de temps opposées", async () => {
        const { joueur, adversaire, question } = await contexteDeJeu();
        const bonus = await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 5 });
        const malus = await creerCarte({ type: "malus", effet: "retrait_temps_s", intensite: 5 });

        await creerReceptionCarte(joueur.id, bonus.id, {
            manche_application: 1,
            statut: "jouee",
        });
        await creerReceptionCarte(adversaire.id, malus.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const effets = await effetsPourJoueur(joueur.id, question, 1);

        expect(effets.dureeDeltaMs).toBe(0);
    });

    it("renseigne bonusPoints avec une carte ajout_points", async () => {
        const { joueur, question } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_points", intensite: 50 });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        const effets = await effetsPourJoueur(joueur.id, question, 1);

        expect(effets.bonusPoints).toBe(50);
    });

    it("active le mélange et son délai avec une carte melange_propositions", async () => {
        const { joueur, adversaire, question } = await contexteDeJeu();
        const carte = await creerCarte({
            type: "malus",
            effet: "melange_propositions",
            intensite: 4,
        });
        await creerReceptionCarte(adversaire.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const effets = await effetsPourJoueur(joueur.id, question, 1);

        expect(effets).toMatchObject({ propositionsMelangees: true, melangeApresMs: 4000 });
    });

    it("élimine une proposition qui n'est jamais la bonne réponse", async () => {
        for (let indexBonneReponse = 1; indexBonneReponse <= 4; indexBonneReponse++) {
            const { joueur, adversaire, question } = await contexteDeJeu({
                index_bonne_reponse: indexBonneReponse,
            });
            const carte = await creerCarte({
                type: "malus",
                effet: "elimination_proposition",
                intensite: 1,
            });
            await creerReceptionCarte(adversaire.id, carte.id, {
                manche_application: 1,
                statut: "jouee",
                id_cible: joueur.id,
            });

            const effets = await effetsPourJoueur(joueur.id, question, 1);

            expect(effets.propositionEliminee).not.toBe(indexBonneReponse);
        }
    });

    it("renseigne la proposition floutée et sa durée avec une carte floutage_proposition_s", async () => {
        const { joueur, adversaire, question } = await contexteDeJeu();
        const carte = await creerCarte({
            type: "malus",
            effet: "floutage_proposition_s",
            intensite: 6,
        });
        await creerReceptionCarte(adversaire.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const effets = await effetsPourJoueur(joueur.id, question, 1);

        expect(effets).toMatchObject({
            propositionFloutee: choisirMauvaiseProposition(question, grainePour(joueur.id, question.id)),
            floutageDureeMs: 6000,
        });
    });

    it("renseigne revelationAnticipeeMs avec une carte revelation_anticipee_s", async () => {
        const { joueur, question } = await contexteDeJeu();
        const carte = await creerCarte({
            type: "bonus",
            effet: "revelation_anticipee_s",
            intensite: 2,
        });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        const effets = await effetsPourJoueur(joueur.id, question, 1);

        expect(effets.revelationAnticipeeMs).toBe(2000);
    });
});

describe("preparerQuestionPourJoueur", () => {
    it("renvoie effets, durée du timer et ordre d'affichage", async () => {
        const { joueur, question } = await contexteDeJeu();

        const prepare = await preparerQuestionPourJoueur(joueur.id, question, 1);

        expect(Object.keys(prepare).sort()).toEqual(["dureeTimerMs", "effets", "ordre"]);
    });

    it("sans carte, garde la durée de la question et l'ordre naturel", async () => {
        const { joueur, question } = await contexteDeJeu({ duree_s: 20 });

        const prepare = await preparerQuestionPourJoueur(joueur.id, question, 1);

        expect(prepare).toMatchObject({ dureeTimerMs: 20000, ordre: [1, 2, 3, 4] });
    });

    it("répercute le delta d'une carte de temps sur la durée du timer", async () => {
        const { joueur, question } = await contexteDeJeu({ duree_s: 10 });
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 7 });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        const prepare = await preparerQuestionPourJoueur(joueur.id, question, 1);

        expect(prepare.dureeTimerMs).toBe(17000);
    });

    it("conserve les quatre propositions quand le mélange est actif", async () => {
        const { joueur, adversaire, question } = await contexteDeJeu();
        const carte = await creerCarte({
            type: "malus",
            effet: "melange_propositions",
            intensite: 3,
        });
        await creerReceptionCarte(adversaire.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
            id_cible: joueur.id,
        });

        const prepare = await preparerQuestionPourJoueur(joueur.id, question, 1);

        expect([...prepare.ordre].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });
});

describe("aBonusElan", () => {
    it("renvoie true quand une carte ajout_points est active sur la manche", async () => {
        const { joueur } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_points", intensite: 50 });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        expect(await aBonusElan(joueur.id, 1)).toBe(true);
    });

    it("renvoie false sans aucune carte", async () => {
        const { joueur } = await contexteDeJeu();

        expect(await aBonusElan(joueur.id, 1)).toBe(false);
    });

    it("renvoie false quand la carte ajout_points vise une autre manche", async () => {
        const { joueur } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_points", intensite: 50 });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 2,
            statut: "jouee",
        });

        expect(await aBonusElan(joueur.id, 1)).toBe(false);
    });

    it("renvoie false pour une carte d'un autre effet", async () => {
        const { joueur } = await contexteDeJeu();
        const carte = await creerCarte({ type: "bonus", effet: "ajout_temps_s", intensite: 5 });
        await creerReceptionCarte(joueur.id, carte.id, {
            manche_application: 1,
            statut: "jouee",
        });

        expect(await aBonusElan(joueur.id, 1)).toBe(false);
    });
});
