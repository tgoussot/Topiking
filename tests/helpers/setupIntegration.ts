import { beforeAll, afterAll, beforeEach } from "@jest/globals";
import { initialiserBaseDeTest, fermerBaseDeTest, viderLesTables } from "./dataSource";
import { reinitialiserCompteur } from "./fixtures";

// Chargé automatiquement avant chaque fichier de tests d'intégration
// (voir setupFilesAfterEnv dans jest.config.ts).

beforeAll(async () => {
    await initialiserBaseDeTest();
});

beforeEach(async () => {
    // Chaque test repart d'une base vide et de séquences remises à zéro :
    // les identifiants sont ainsi prévisibles d'un test à l'autre.
    await viderLesTables();
    reinitialiserCompteur();
});

afterAll(async () => {
    // Le beforeEach ne nettoie qu'AVANT chaque test : sans ce passage final,
    // les lignes du dernier test du fichier survivraient au fichier suivant.
    await viderLesTables();

    // Sans cette fermeture, Jest reste suspendu sur la connexion ouverte
    // et le job CI attend jusqu'au timeout.
    await fermerBaseDeTest();
});
