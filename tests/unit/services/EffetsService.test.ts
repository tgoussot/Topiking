import { describe, it, expect } from "@jest/globals";
import {
    effetsNeutres,
    grainePour,
    choisirMauvaiseProposition,
    appliquerDureeTimer,
    ordreDesPropositions,
} from "../../../src/services/Jeux/EffetsService";
import { Question } from "../../../src/entities/Question";

// Seuls index_bonne_reponse et duree_s sont lus
// par les fonctions pures testées ici.
function question(indexBonneReponse: number, dureeS = 10): Question {
    const q = new Question();
    q.id = 1;
    q.index_bonne_reponse = indexBonneReponse;
    q.duree_s = dureeS;
    return q;
}

describe("effetsNeutres", () => {
    it("ne modifie rien par défaut", () => {
        expect(effetsNeutres()).toEqual({
            dureeDeltaMs: 0,
            bonusPoints: 0,
            propositionsMelangees: false,
            melangeApresMs: 0,
            propositionFloutee: null,
            floutageDureeMs: 0,
            propositionEliminee: null,
            revelationAnticipeeMs: 0,
        });
    });

    it("renvoie un objet neuf à chaque appel", () => {
        // Sans ça, deux joueurs partageraient le même objet d'effets.
        const premiers = effetsNeutres();
        const seconds = effetsNeutres();

        premiers.bonusPoints = 999;

        expect(seconds.bonusPoints).toBe(0);
    });
});

describe("grainePour", () => {
    it("est déterministe pour un même couple joueur/question", () => {
        expect(grainePour(42, 7)).toBe(grainePour(42, 7));
    });

    it("distingue deux joueurs sur la même question", () => {
        expect(grainePour(1, 7)).not.toBe(grainePour(2, 7));
    });

    it("distingue deux questions pour le même joueur", () => {
        expect(grainePour(42, 1)).not.toBe(grainePour(42, 2));
    });

    it("reste dans les bornes attendues", () => {
        for (let idParticipant = 1; idParticipant <= 30; idParticipant++) {
            const graine = grainePour(idParticipant, idParticipant * 3);

            expect(graine).toBeGreaterThanOrEqual(0);
            expect(graine).toBeLessThan(1000);
        }
    });
});

describe("choisirMauvaiseProposition", () => {
    it("ne désigne jamais la bonne réponse, quelle que soit sa position", () => {
        // Le test qui compte vraiment : un malus ne doit pas éliminer
        // ou flouter la bonne réponse, sinon la question devient injouable.
        for (let indexBonneReponse = 1; indexBonneReponse <= 4; indexBonneReponse++) {
            for (let graine = 0; graine < 1000; graine++) {
                const choisie = choisirMauvaiseProposition(question(indexBonneReponse), graine);

                expect(choisie).not.toBe(indexBonneReponse);
            }
        }
    });

    it("renvoie toujours un index de proposition valide", () => {
        for (let graine = 0; graine < 200; graine++) {
            const choisie = choisirMauvaiseProposition(question(2), graine);

            expect(choisie).toBeGreaterThanOrEqual(1);
            expect(choisie).toBeLessThanOrEqual(4);
        }
    });

    it("est déterministe pour une même graine", () => {
        const q = question(3);

        expect(choisirMauvaiseProposition(q, 123)).toBe(choisirMauvaiseProposition(q, 123));
    });
});

describe("appliquerDureeTimer", () => {
    it("renvoie la durée de la question convertie en millisecondes", () => {
        const effets = effetsNeutres();

        expect(appliquerDureeTimer(question(1, 15), effets)).toBe(15000);
    });

    it("ajoute le temps offert par une carte bonus", () => {
        const effets = effetsNeutres();
        effets.dureeDeltaMs = 5000;

        expect(appliquerDureeTimer(question(1, 10), effets)).toBe(15000);
    });

    it("retire le temps volé par une carte malus", () => {
        const effets = effetsNeutres();
        effets.dureeDeltaMs = -3000;

        expect(appliquerDureeTimer(question(1, 10), effets)).toBe(7000);
    });

    it("ne descend jamais sous une seconde, même avec un cumul de malus", () => {
        const effets = effetsNeutres();
        effets.dureeDeltaMs = -60000;

        expect(appliquerDureeTimer(question(1, 10), effets)).toBe(1000);
    });

    it("applique le plancher quand le retrait égale exactement la durée", () => {
        const effets = effetsNeutres();
        effets.dureeDeltaMs = -10000;

        expect(appliquerDureeTimer(question(1, 10), effets)).toBe(1000);
    });
});

describe("ordreDesPropositions", () => {
    it("conserve l'ordre naturel sans carte de mélange", () => {
        expect(ordreDesPropositions(effetsNeutres(), 42)).toEqual([1, 2, 3, 4]);
    });

    it("conserve les quatre propositions après mélange, sans perte ni doublon", () => {
        // Un mélange qui perdrait une proposition rendrait la question
        // impossible à afficher correctement.
        const effets = effetsNeutres();
        effets.propositionsMelangees = true;

        for (let graine = 0; graine < 1000; graine++) {
            const ordre = ordreDesPropositions(effets, graine);

            expect(ordre).toHaveLength(4);
            expect([...ordre].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
        }
    });

    it("est déterministe : même graine, même ordre", () => {
        const effets = effetsNeutres();
        effets.propositionsMelangees = true;

        // Le joueur qui recharge la question doit revoir le même ordre.
        expect(ordreDesPropositions(effets, 77)).toEqual(ordreDesPropositions(effets, 77));
    });

    it("mélange réellement pour au moins certaines graines", () => {
        const effets = effetsNeutres();
        effets.propositionsMelangees = true;

        let auMoinsUnMelange = false;

        for (let graine = 0; graine < 100; graine++) {
            const ordre = ordreDesPropositions(effets, graine);

            if (JSON.stringify(ordre) !== JSON.stringify([1, 2, 3, 4])) {
                auMoinsUnMelange = true;
                break;
            }
        }

        expect(auMoinsUnMelange).toBe(true);
    });

    it("ne mute pas l'objet d'effets reçu", () => {
        const effets = effetsNeutres();
        effets.propositionsMelangees = true;

        ordreDesPropositions(effets, 42);

        expect(effets.propositionsMelangees).toBe(true);
    });
});
