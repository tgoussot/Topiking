import { describe, it, expect } from "@jest/globals";
import {
    passeDevant,
    classer,
    premier,
    dernier,
    exAequoEnTete,
    type ScoreParticipant,
} from "../../../src/services/Jeux/ClassementService";

function score(
    idParticipant: number,
    points: number,
    tempsCumuleMs = 0,
    pseudo = `joueur${idParticipant}`
): ScoreParticipant {
    return { idParticipant, pseudo, points, tempsCumuleMs };
}

describe("passeDevant", () => {
    it("place devant celui qui a le plus de points", () => {
        expect(passeDevant(score(1, 300), score(2, 100))).toBe(true);
        expect(passeDevant(score(1, 100), score(2, 300))).toBe(false);
    });

    it("départage deux joueurs à égalité de points par le temps cumulé", () => {
        const rapide = score(1, 200, 5000);
        const lent = score(2, 200, 9000);

        expect(passeDevant(rapide, lent)).toBe(true);
        expect(passeDevant(lent, rapide)).toBe(false);
    });

    it("départage par identifiant quand points et temps sont identiques", () => {
        const petitId = score(1, 200, 5000);
        const grandId = score(2, 200, 5000);

        expect(passeDevant(petitId, grandId)).toBe(true);
        expect(passeDevant(grandId, petitId)).toBe(false);
    });

    it("fait primer les points sur le temps", () => {
        // Le joueur lent a plus de points : il passe devant malgré son temps.
        const lentMaisFort = score(1, 300, 20000);
        const rapideMaisFaible = score(2, 100, 1000);

        expect(passeDevant(lentMaisFort, rapideMaisFaible)).toBe(true);
    });
});

describe("classer", () => {
    it("trie par points décroissants", () => {
        const classement = classer([score(1, 100), score(2, 300), score(3, 200)]);

        expect(classement.map((p) => p.idParticipant)).toEqual([2, 3, 1]);
    });

    it("applique le départage au temps puis à l'identifiant", () => {
        const classement = classer([
            score(3, 200, 5000),
            score(1, 200, 5000),
            score(2, 200, 3000),
        ]);

        // Même points : le plus rapide (2), puis les deux à 5000 ms triés par id.
        expect(classement.map((p) => p.idParticipant)).toEqual([2, 1, 3]);
    });

    it("ne mute pas le tableau reçu", () => {
        const original = [score(1, 100), score(2, 300)];
        const copieAvant = [...original];

        classer(original);

        expect(original).toEqual(copieAvant);
    });

    it("conserve exactement les mêmes participants, sans perte ni doublon", () => {
        const participants = [
            score(1, 100),
            score(2, 300),
            score(3, 200),
            score(4, 150),
            score(5, 250),
        ];

        const classement = classer(participants);

        expect(classement).toHaveLength(participants.length);

        const idsTries = classement.map((p) => p.idParticipant).sort((a, b) => a - b);
        expect(idsTries).toEqual([1, 2, 3, 4, 5]);
    });

    it("renvoie un tableau vide pour une entrée vide", () => {
        expect(classer([])).toEqual([]);
    });

    it("gère un classement à un seul participant", () => {
        const classement = classer([score(1, 100)]);

        expect(classement).toHaveLength(1);
        expect(classement[0]?.idParticipant).toBe(1);
    });

    it("produit un classement déjà trié inchangé", () => {
        const dejaTrie = [score(1, 300), score(2, 200), score(3, 100)];

        const classement = classer(dejaTrie);

        expect(classement.map((p) => p.idParticipant)).toEqual([1, 2, 3]);
    });

    it("inverse un classement trié à l'envers", () => {
        const inverse = [score(1, 100), score(2, 200), score(3, 300)];

        const classement = classer(inverse);

        expect(classement.map((p) => p.idParticipant)).toEqual([3, 2, 1]);
    });

    it("est déterministe : deux appels donnent le même ordre", () => {
        const participants = [
            score(1, 200, 5000),
            score(2, 200, 5000),
            score(3, 100, 1000),
        ];

        const premierAppel = classer(participants).map((p) => p.idParticipant);
        const secondAppel = classer(participants).map((p) => p.idParticipant);

        expect(premierAppel).toEqual(secondAppel);
    });
});

describe("premier", () => {
    it("renvoie le participant en tête", () => {
        const classement = classer([score(1, 100), score(2, 300)]);

        expect(premier(classement)?.idParticipant).toBe(2);
    });

    it("renvoie null pour un classement vide", () => {
        expect(premier([])).toBeNull();
    });
});

describe("dernier", () => {
    it("renvoie le participant en queue", () => {
        const classement = classer([score(1, 100), score(2, 300)]);

        expect(dernier(classement)?.idParticipant).toBe(1);
    });

    it("renvoie null pour un classement vide", () => {
        expect(dernier([])).toBeNull();
    });

    it("renvoie le même participant que premier quand il n'y en a qu'un", () => {
        // Un seul joueur, la distribution de cartes
        // ne doit pas lui donner à la fois le malus et le bonus.
        const classement = classer([score(1, 100)]);

        expect(dernier(classement)?.idParticipant).toBe(premier(classement)?.idParticipant);
    });
});

describe("exAequoEnTete", () => {
    it("renvoie tous les participants au score de tête", () => {
        const classement = classer([score(1, 300), score(2, 300), score(3, 100)]);

        const exAequo = exAequoEnTete(classement);

        expect(exAequo).toHaveLength(2);
        expect(exAequo.map((p) => p.idParticipant).sort()).toEqual([1, 2]);
    });

    it("renvoie un seul participant s'il n'y a pas d'égalité", () => {
        const classement = classer([score(1, 300), score(2, 200)]);

        const exAequo = exAequoEnTete(classement);

        expect(exAequo).toHaveLength(1);
        expect(exAequo[0]?.idParticipant).toBe(1);
    });

    it("renvoie un tableau vide pour un classement vide", () => {
        expect(exAequoEnTete([])).toEqual([]);
    });

    it("renvoie tout le monde si tous sont à égalité", () => {
        const classement = classer([score(1, 100), score(2, 100), score(3, 100)]);

        expect(exAequoEnTete(classement)).toHaveLength(3);
    });

    it("ne retient pas un score inférieur, même proche", () => {
        const classement = classer([score(1, 300), score(2, 299)]);

        expect(exAequoEnTete(classement)).toHaveLength(1);
    });
});
