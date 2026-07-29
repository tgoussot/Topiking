import { describe, it, expect } from "@jest/globals";
import {
    calculerBonusRapidite,
    calculerPoints,
    totaliserPoints,
} from "../../../src/services/ScoringService";

// Constantes du service, redéclarées ici volontairement : si quelqu'un change
// le barème dans le service, ces tests doivent échouer et non s'adapter.
const POINTS_BONNE_REPONSE = 100;
const BONUS_RAPIDITE_MAX = 50;
const BONUS_CARTE_ELAN = 25;

const TIMER_10S = 10000;

describe("calculerBonusRapidite", () => {
    it("accorde le bonus maximum pour une réponse instantanée", () => {
        expect(calculerBonusRapidite(0, TIMER_10S)).toBe(BONUS_RAPIDITE_MAX);
    });

    it("accorde la moitié du bonus pour une réponse à mi-parcours", () => {
        expect(calculerBonusRapidite(5000, TIMER_10S)).toBe(BONUS_RAPIDITE_MAX / 2);
    });

    it("n'accorde aucun bonus pour une réponse à l'expiration du timer", () => {
        expect(calculerBonusRapidite(TIMER_10S, TIMER_10S)).toBe(0);
    });

    it("décroît de façon strictement monotone avec le temps de réponse", () => {
        const bonusRapide = calculerBonusRapidite(1000, TIMER_10S);
        const bonusMoyen = calculerBonusRapidite(5000, TIMER_10S);
        const bonusLent = calculerBonusRapidite(9000, TIMER_10S);

        expect(bonusRapide).toBeGreaterThan(bonusMoyen);
        expect(bonusMoyen).toBeGreaterThan(bonusLent);
    });

    it("borne un temps de réponse négatif à zéro", () => {
        expect(calculerBonusRapidite(-5000, TIMER_10S)).toBe(BONUS_RAPIDITE_MAX);
    });

    it("borne un temps de réponse supérieur au timer", () => {
        expect(calculerBonusRapidite(999999, TIMER_10S)).toBe(0);
    });

    it("renvoie zéro si la durée du timer est nulle, sans division par zéro", () => {
        const bonus = calculerBonusRapidite(1000, 0);

        expect(bonus).toBe(0);
        expect(Number.isNaN(bonus)).toBe(false);
    });

    it("renvoie zéro si la durée du timer est négative", () => {
        expect(calculerBonusRapidite(1000, -1000)).toBe(0);
    });

    it("renvoie toujours un entier", () => {
        // 3333 ms sur 10 s donne 33,335 : le service doit arrondir.
        const bonus = calculerBonusRapidite(3333, TIMER_10S);

        expect(Number.isInteger(bonus)).toBe(true);
    });
});

describe("calculerPoints", () => {
    it("renvoie zéro pour une mauvaise réponse", () => {
        const points = calculerPoints({
            estCorrect: false,
            tempsReponseMs: 0,
            dureeTimerMs: TIMER_10S,
            bonusElan: false,
        });

        expect(points).toBe(0);
    });

    it("renvoie zéro pour une mauvaise réponse même avec la carte Élan", () => {
        // Une carte bonus ne doit jamais rattraper une réponse fausse.
        const points = calculerPoints({
            estCorrect: false,
            tempsReponseMs: 0,
            dureeTimerMs: TIMER_10S,
            bonusElan: true,
        });

        expect(points).toBe(0);
    });

    it("cumule points de base et bonus maximum pour une réponse instantanée", () => {
        const points = calculerPoints({
            estCorrect: true,
            tempsReponseMs: 0,
            dureeTimerMs: TIMER_10S,
            bonusElan: false,
        });

        expect(points).toBe(POINTS_BONNE_REPONSE + BONUS_RAPIDITE_MAX);
    });

    it("n'accorde que les points de base pour une réponse à l'expiration", () => {
        const points = calculerPoints({
            estCorrect: true,
            tempsReponseMs: TIMER_10S,
            dureeTimerMs: TIMER_10S,
            bonusElan: false,
        });

        expect(points).toBe(POINTS_BONNE_REPONSE);
    });

    it("ajoute le bonus de la carte Élan à une bonne réponse", () => {
        const points = calculerPoints({
            estCorrect: true,
            tempsReponseMs: TIMER_10S,
            dureeTimerMs: TIMER_10S,
            bonusElan: true,
        });

        expect(points).toBe(POINTS_BONNE_REPONSE + BONUS_CARTE_ELAN);
    });

    it("atteint le score maximal avec réponse instantanée et carte Élan", () => {
        const points = calculerPoints({
            estCorrect: true,
            tempsReponseMs: 0,
            dureeTimerMs: TIMER_10S,
            bonusElan: true,
        });

        expect(points).toBe(POINTS_BONNE_REPONSE + BONUS_RAPIDITE_MAX + BONUS_CARTE_ELAN);
    });

    it("accorde les points de base même si le timer est invalide", () => {
        // Cas dégradé : la bonne réponse reste récompensée, sans bonus de rapidité.
        const points = calculerPoints({
            estCorrect: true,
            tempsReponseMs: 1000,
            dureeTimerMs: 0,
            bonusElan: false,
        });

        expect(points).toBe(POINTS_BONNE_REPONSE);
    });
});

describe("totaliserPoints", () => {
    it("renvoie zéro pour une liste vide", () => {
        expect(totaliserPoints([])).toBe(0);
    });

    it("additionne les points d'une liste", () => {
        expect(totaliserPoints([100, 150, 125])).toBe(375);
    });

    it("gère une liste à un seul élément", () => {
        expect(totaliserPoints([150])).toBe(150);
    });

    it("ignore les trous du tableau sans renvoyer NaN", () => {
        // Un tableau creux peut apparaître si une réponse manque.
        const listeCreuse: number[] = [100, , 50] as number[];

        const total = totaliserPoints(listeCreuse);

        expect(total).toBe(150);
        expect(Number.isNaN(total)).toBe(false);
    });

    it("ne mute pas la liste reçue", () => {
        const liste = [100, 50];

        totaliserPoints(liste);

        expect(liste).toEqual([100, 50]);
    });
});
