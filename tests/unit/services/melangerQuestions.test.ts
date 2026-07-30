import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { melangerQuestions } from "../../../src/services/Jeux/SessionService";
import { Question } from "../../../src/entities/Question";

// melangerQuestions est la seule fonction pure de SessionService :
// le reste du fichier touche la base et relève des tests d'intégration.

function questions(nombre: number): Question[] {
    const liste: Question[] = [];

    for (let i = 1; i <= nombre; i++) {
        const q = new Question();
        q.id = i;
        liste.push(q);
    }

    return liste;
}

function ids(liste: Question[]): number[] {
    return liste.map((q) => q.id);
}

describe("melangerQuestions", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("ne mute pas le tableau reçu", () => {
        const original = questions(5);
        const idsAvant = ids(original);

        melangerQuestions(original);

        expect(ids(original)).toEqual(idsAvant);
    });

    it("renvoie un tableau distinct de l'entrée", () => {
        const original = questions(5);

        expect(melangerQuestions(original)).not.toBe(original);
    });

    it("conserve exactement les mêmes questions, sans perte ni doublon", () => {
        // Une question perdue au mélange fausserait tout le tirage de la manche.
        const original = questions(10);

        const melange = melangerQuestions(original);

        expect(melange).toHaveLength(10);
        expect(ids(melange).sort((a, b) => a - b)).toEqual(ids(original));
    });

    it("gère un tableau vide", () => {
        expect(melangerQuestions([])).toEqual([]);
    });

    it("gère un tableau à un seul élément", () => {
        const melange = melangerQuestions(questions(1));

        expect(ids(melange)).toEqual([1]);
    });

    it("produit un ordre prévisible quand la source d'aléatoire est contrôlée", () => {
        jest.spyOn(Math, "random").mockReturnValue(0);

        const melange = melangerQuestions(questions(4));

        expect(ids(melange)).toEqual([2, 3, 4, 1]);
    });

    it("laisse l'ordre inchangé quand chaque tirage désigne l'élément courant", () => {
        jest.spyOn(Math, "random").mockReturnValue(0.9999999);

        const melange = melangerQuestions(questions(4));

        expect(ids(melange)).toEqual([1, 2, 3, 4]);
    });

    it("produit au moins deux ordres différents sur plusieurs appels", () => {
        // Sans mock : vérifie que le mélange n'est pas l'identité.
        const original = questions(8);

        const ordresVus = new Set<string>();

        for (let i = 0; i < 50; i++) {
            ordresVus.add(JSON.stringify(ids(melangerQuestions(original))));
        }

        expect(ordresVus.size).toBeGreaterThan(1);
    });

    it("n'appelle jamais Math.random pour un tableau vide ou singleton", () => {
        const espion = jest.spyOn(Math, "random");

        melangerQuestions([]);
        melangerQuestions(questions(1));

        expect(espion).not.toHaveBeenCalled();
    });
});
