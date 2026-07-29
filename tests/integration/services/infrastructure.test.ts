import { describe, it, expect } from "@jest/globals";
import { TestDataSource } from "../../helpers/dataSource";
import { Participant } from "../../../src/entities/Participant";
import { creerContexteMinimal, creerSession, creerParticipant } from "../../helpers/fixtures";

// Valide que l'infrastructure de test elle-même fonctionne
// (connexion, schéma synchronisé, nettoyage entre tests, fixtures).
// Si ce fichier échoue, tous les autres tests d'intégration sont suspects.

describe("infrastructure de test", () => {
    it("se connecte à une base dont le nom contient \"test\"", () => {
        expect(TestDataSource.isInitialized).toBe(true);
        expect(String(TestDataSource.options.database)).toContain("test");
    });

    it("a créé le schéma à partir des entités", () => {
        const tables = TestDataSource.entityMetadatas.map((m) => m.tableName);

        expect(tables).toContain("participant");
        expect(tables).toContain("session");
        expect(tables).toContain("session_question");
    });

    it("part d'une base vide", async () => {
        expect(await Participant.count()).toBe(0);
    });

    it("laisse une base vide au test suivant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipant(session.id);

        expect(await Participant.count()).toBe(1);
        // Le beforeEach du test suivant doit tout effacer.
    });

    it("a bien nettoyé ce qu'a créé le test précédent", async () => {
        expect(await Participant.count()).toBe(0);
    });

    it("remet les séquences d'identifiants à zéro entre les tests", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const participant = await creerParticipant(session.id);

        // RESTART IDENTITY garantit un premier identifiant à 1, ce dont
        // dépendent les tests de départage par identifiant croissant.
        expect(participant.id).toBe(1);
    });

    it("attribue à nouveau l'identifiant 1 au test suivant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const participant = await creerParticipant(session.id);

        expect(participant.id).toBe(1);
    });
});
