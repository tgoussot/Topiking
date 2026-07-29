import "dotenv/config";
import { DataSource } from "typeorm";
import { AppDataSource } from "../../src/data-source";

// Les tests réutilisent l'instance AppDataSource plutôt qu'une DataSource
// séparée. C'est nécessaire depuis que les services référencent AppDataSource
// directement (SessionService.creer ouvre sa transaction dessus) : une seconde
// instance laisserait celle du service non initialisée, d'où "Driver not
// Connected".
//
// Ses options sont donc réécrites ici, AVANT tout initialize(), pour viser la
// base de test :
//  - une base séparée (topiking_test) pour ne jamais toucher aux données de
//    développement, qu'un TRUNCATE effacerait ;
//  - DB_PORT est lu, ce que la configuration applicative ne fait pas ;
//  - logging coupé, sinon chaque requête pollue la sortie des tests.
Object.assign(AppDataSource.options, {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "supersecret",
    database: process.env.DB_TEST_NAME || "topiking_test",
    // Le schéma est recréé depuis les entités : pas de migration à maintenir
    // pour les tests, et toute évolution d'entité est prise en compte aussitôt.
    synchronize: true,
    dropSchema: false,
    logging: false,
    // Chemin absolu : la configuration applicative utilise un chemin relatif au
    // cwd, qui ne résout pas les entités de façon fiable sous Jest.
    entities: [__dirname + "/../../src/entities/**/*.{ts,js}"],
    // Une seule connexion, volontairement.
    // Avec un pool, le TRUNCATE ... RESTART IDENTITY du beforeEach peut partir
    // sur une connexion pendant que les insertions du test en empruntent une
    // autre : les séquences redémarrent alors de façon imprévisible et les
    // identifiants ne valent plus 1, 2, 3... Les tests deviennent instables
    // sans qu'aucune assertion métier soit en cause.
    extra: { max: 1 },
});

// Conservé sous son nom d'origine : les tests existants s'y réfèrent.
export const TestDataSource: DataSource = AppDataSource;

// Garde-fou : un TRUNCATE lancé par erreur sur la base de développement
// effacerait le travail en cours. On refuse de démarrer si le nom de base
// ne ressemble pas à une base de test.
function verifierBaseDeTest(nom: string): void {
    if (nom.includes("test") === false) {
        throw new Error(
            `Refus de lancer les tests sur la base "${nom}" : ` +
            `le nom doit contenir "test". Vérifiez DB_TEST_NAME.`
        );
    }
}

export async function initialiserBaseDeTest(): Promise<DataSource> {
    const nomBase = String(TestDataSource.options.database);

    verifierBaseDeTest(nomBase);

    if (TestDataSource.isInitialized === false) {
        await TestDataSource.initialize();
    }

    return TestDataSource;
}

export async function fermerBaseDeTest(): Promise<void> {
    if (TestDataSource.isInitialized === true) {
        await TestDataSource.destroy();
    }
}

// Vide toutes les tables entre deux tests.
// RESTART IDENTITY remet les séquences à zéro : les identifiants redeviennent
// prévisibles d'un test à l'autre, ce qui compte pour ClassementService qui
// départage les ex aequo par identifiant croissant.
// CASCADE lève les contraintes de clés étrangères le temps de l'opération.
export async function viderLesTables(): Promise<void> {
    const tables = TestDataSource.entityMetadatas.map((metadata) => metadata.tableName);

    if (tables.length === 0) {
        return;
    }

    // Les tables sont triées puis vidées en UNE SEULE instruction TRUNCATE.
    // C'est ce qui évite les "deadlock detected" intermittents : Postgres
    // acquiert alors tous les verrous d'un bloc, au lieu de les prendre table
    // par table dans un ordre qui varie d'une exécution à l'autre.
    // Le tri rend en plus l'ordre de verrouillage identique à chaque appel.
    const listeTables = tables
        .slice()
        .sort()
        .map((table) => `"${table}"`)
        .join(", ");

    // RESTART IDENTITY remet les séquences à zéro : les identifiants
    // redeviennent prévisibles d'un test à l'autre, ce dont dépendent les
    // départages d'ex aequo par identifiant croissant.
    await TestDataSource.query(`TRUNCATE TABLE ${listeTables} RESTART IDENTITY CASCADE`);
}
