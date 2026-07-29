/** @jest-config-loader ts-node */
import { createDefaultPreset, type JestConfigWithTsJest } from "ts-jest";

// Ce fichier est chargé par ts-node (voir la docblock ci-dessus). Le script npm
// lance Node avec --no-experimental-strip-types : sans ce flag, Node 22+ tente
// d'abord de lire ce .ts comme un module ES et émet un avertissement, le projet
// étant en "type": "commonjs" (jestjs/jest#15682).

// Les tests ne sont pas compilés vers dist/ : ts-jest les transforme en mémoire,
// en s'appuyant sur tsconfig.test.json qui élargit rootDir au dossier tests/.
const presetConfig = createDefaultPreset({
    tsconfig: "tsconfig.test.json",
});

// Réglages partagés par les deux projets.
const commun = {
    ...presetConfig,
    testEnvironment: "node" as const,

    // dist/ peut contenir une copie compilée des tests : Jest ne doit jamais
    // les exécuter en double, seules les sources TypeScript font foi.
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    modulePathIgnorePatterns: ["<rootDir>/dist/"],

    // Remet les mocks à zéro entre chaque test : pas de fuite d'un test à l'autre.
    clearMocks: true,
    restoreMocks: true,
};

const jestConfig: JestConfigWithTsJest = {
    // Deux projets séparés : les tests unitaires n'ont besoin d'aucune base et
    // peuvent tourner en parallèle, les tests d'intégration partagent une même
    // base Postgres et doivent s'exécuter en série.
    projects: [
        {
            ...commun,
            displayName: "unit",
            testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
        },
        {
            ...commun,
            displayName: "integration",
            testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
            // Ouvre la connexion, vide les tables entre chaque test, ferme à la fin.
            setupFilesAfterEnv: ["<rootDir>/tests/helpers/setupIntegration.ts"],
        },
    ],

    // Un seul worker pour toute la suite.
    // Les tests d'intégration partagent une même base Postgres et vident les
    // tables entre chaque test : deux workers concurrents effaceraient les
    // données l'un de l'autre en plein test. À noter, --runInBand ne suffit
    // pas ici — il est ignoré dès lors que "projects" est utilisé.
    maxWorkers: 1,

    collectCoverageFrom: [
        "src/services/**/*.ts",
        "!src/**/*.d.ts",
    ],

    coverageDirectory: "coverage",

    verbose: true,
};

export default jestConfig;
