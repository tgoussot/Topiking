import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { Organisation } from "./entities/Organisation";
import { Utilisateur } from "./entities/Utilisateur";
import { Theme } from "./entities/Theme";
import { Question } from "./entities/Question";
import { Session } from "./entities/Session";
import { SessionTheme } from "./entities/SessionTheme";
import { Participant } from "./entities/Participant";
import { ReponseParticipant } from "./entities/ReponseParticipant";
import { Carte } from "./entities/Carte";
import { ReceptionCarte } from "./entities/ReceptionCarte";

const hash = (n: number) => n.toString(16).padStart(2, "0").repeat(32).slice(0, 64);

function at<T>(rows: T[], index: number): T {
    const row = rows[index];
    if (row === undefined) throw new Error(`Ligne ${index} absente après insertion`);
    return row;
}

async function seed() {
    await AppDataSource.initialize();

    // On vide les tables dans l'ordre inverse des dépendances (RESTART IDENTITY remet les séquences à 1)
    await AppDataSource.query(`
        TRUNCATE TABLE
            "reception_carte", "reponse_participant", "participant",
            "session_theme", "session", "question", "theme",
            "utilisateur", "organisation", "carte"
        RESTART IDENTITY CASCADE
    `);

    // ---------------------------------------------------------------- ORGANISATION
    const organisations = await AppDataSource.getRepository(Organisation).save([
        { nom: "Lycée Victor Hugo", slug: "lycee-victor-hugo" },
        { nom: "IUT Informatique Lyon", slug: "iut-info-lyon" },
        { nom: "Acme Formation", slug: "acme-formation" },
    ]);
    const orgLycee = at(organisations, 0);
    const orgIut = at(organisations, 1);
    const orgAcme = at(organisations, 2);

    // ---------------------------------------------------------------- UTILISATEUR (REGROUPE 1,n — 1,1)
    // orgLycee : 3 utilisateurs, orgIut : 2, orgAcme : 1 → teste la cardinalité 1,n
    const utilisateurs = await AppDataSource.getRepository(Utilisateur).save([
        { email: "claire.dubois@vhugo.fr", nom: "Claire Dubois", mot_de_passe: hash(1), id_organisation: orgLycee.id },
        { email: "marc.leroy@vhugo.fr", nom: "Marc Leroy", mot_de_passe: hash(2), id_organisation: orgLycee.id },
        { email: "sonia.bertrand@vhugo.fr", nom: "Sonia Bertrand", mot_de_passe: hash(3), id_organisation: orgLycee.id },
        { email: "hugo.martin@iut-lyon.fr", nom: "Hugo Martin", mot_de_passe: hash(4), id_organisation: orgIut.id },
        { email: "nadia.chen@iut-lyon.fr", nom: "Nadia Chen", mot_de_passe: hash(5), id_organisation: orgIut.id },
        { email: "paul.riviere@acme.io", nom: "Paul Rivière", mot_de_passe: hash(6), id_organisation: orgAcme.id },
    ]);
    const uClaire = at(utilisateurs, 0);
    const uMarc = at(utilisateurs, 1);
    const uHugo = at(utilisateurs, 3);
    const uNadia = at(utilisateurs, 4);
    // Sonia (index 2) et Paul (index 5) n'animent aucune session → testent le cas ANIME 0,n côté 0

    // ---------------------------------------------------------------- THEME (PROPOSE 1,n — 1,1)
    const themes = await AppDataSource.getRepository(Theme).save([
        { libelle: "Culture générale", description: "Questions variées tous domaines", actif: true, id_organisation: orgLycee.id },
        { libelle: "Histoire de France", description: "De 1789 à nos jours", actif: true, id_organisation: orgLycee.id },
        { libelle: "Géographie", description: null, actif: false, id_organisation: orgLycee.id }, // description null + inactif
        { libelle: "Algorithmique", description: "Complexité, tris, structures", actif: true, id_organisation: orgIut.id },
        { libelle: "Réseaux", description: "Modèle OSI, TCP/IP", actif: true, id_organisation: orgIut.id },
        { libelle: "Sécurité au travail", description: "Bonnes pratiques", actif: true, id_organisation: orgAcme.id },
    ]);
    const thCulture = at(themes, 0);
    const thHistoire = at(themes, 1);
    const thGeo = at(themes, 2);
    const thAlgo = at(themes, 3);
    const thReseaux = at(themes, 4);
    const thSecu = at(themes, 5);
    // Géographie (index 2) reste sans question → teste CONTIENT côté 0
    // Sécurité (index 5) n'est rattaché à aucune manche → teste PORTE SUR côté 0

    // ---------------------------------------------------------------- QUESTION (CONTIENT 1,n — 1,1)
    const q = (
        theme: Theme,
        enonce: string,
        props: [string, string, string, string],
        bonne: number,
        duree: number,
        explication: string | null
    ) => ({
        enonce,
        explication,
        proposition_1: props[0],
        proposition_2: props[1],
        proposition_3: props[2],
        proposition_4: props[3],
        index_bonne_reponse: bonne,
        duree_s: duree,
        id_theme: theme.id,
    });

    const questions = await AppDataSource.getRepository(Question).save([
        // Culture générale
        q(thCulture, "Quelle est la capitale de l'Australie ?", ["Sydney", "Melbourne", "Canberra", "Perth"], 3, 20, "Canberra a été choisie comme compromis entre Sydney et Melbourne."),
        q(thCulture, "Combien de côtés a un hexagone ?", ["5", "6", "7", "8"], 2, 15, null), // explication null
        q(thCulture, "Qui a peint La Joconde ?", ["Raphaël", "Michel-Ange", "Léonard de Vinci", "Le Caravage"], 3, 20, "Peinte vers 1503-1519."),
        // Histoire
        q(thHistoire, "En quelle année a lieu la prise de la Bastille ?", ["1787", "1789", "1791", "1799"], 2, 15, "Le 14 juillet 1789."),
        q(thHistoire, "Qui était président en mai 1968 ?", ["Pompidou", "De Gaulle", "Giscard", "Mitterrand"], 2, 25, null),
        // Algorithmique
        q(thAlgo, "Complexité moyenne du tri rapide ?", ["O(n)", "O(n log n)", "O(n²)", "O(log n)"], 2, 30, "Le pire cas reste en O(n²)."),
        q(thAlgo, "Quelle structure suit le principe LIFO ?", ["File", "Pile", "Arbre", "Graphe"], 2, 20, "Last In, First Out."),
        q(thAlgo, "Complexité d'une recherche dichotomique ?", ["O(1)", "O(log n)", "O(n)", "O(n log n)"], 2, 25, null),
        // Réseaux
        q(thReseaux, "Combien de couches dans le modèle OSI ?", ["4", "5", "7", "9"], 3, 15, "Physique à Application."),
        q(thReseaux, "Quel port utilise HTTPS par défaut ?", ["21", "80", "443", "8080"], 3, 15, null),
        // Sécurité (thème d'une autre organisation, jamais joué)
        q(thSecu, "Que signifie EPI ?", ["Équipement de Protection Individuelle", "Étude Préalable Interne", "Examen Périodique Imposé", "Entretien Programmé Industriel"], 1, 20, null),
    ]);
    const qCult1 = at(questions, 0);
    const qCult2 = at(questions, 1);
    const qCult3 = at(questions, 2);
    const qHist1 = at(questions, 3);
    const qHist2 = at(questions, 4);
    const qAlgo1 = at(questions, 5);
    const qAlgo2 = at(questions, 6);
    const qAlgo3 = at(questions, 7);
    const qRes1 = at(questions, 8);
    const qRes2 = at(questions, 9);

    // ---------------------------------------------------------------- CARTE
    const cartes = await AppDataSource.getRepository(Carte).save([
        { libelle: "Double points", type: "bonus", effet: "multiplicateur_points", intensite: 2 },
        { libelle: "Temps supplémentaire", type: "bonus", effet: "ajout_temps_s", intensite: 10 },
        { libelle: "Second essai", type: "bonus", effet: "reponse_supplementaire", intensite: 1 },
        { libelle: "Vol de points", type: "malus", effet: "retrait_points_cible", intensite: 50 },
        { libelle: "Écran brouillé", type: "malus", effet: "masquage_propositions", intensite: 1 },
        { libelle: "Temps réduit", type: "malus", effet: "retrait_temps_s", intensite: 5 },
    ]);
    const cDouble = at(cartes, 0);
    const cTemps = at(cartes, 1);
    const cVol = at(cartes, 3);
    const cBrouille = at(cartes, 4);
    const cTempsRed = at(cartes, 5);
    // "Second essai" (index 2) n'est jamais distribuée → teste RECOIT 0,n côté 0

    // ---------------------------------------------------------------- SESSION (ANIME 0,n — 1,1)
    const sessions = await AppDataSource.getRepository(Session).save([
        // Session terminée et complète : c'est elle qui porte le jeu de données riche
        {
            code_acces: "AB12CD", statut: "terminee",
            date_debut: new Date("2026-03-10T09:00:00Z"),
            date_fin: new Date("2026-03-10T09:45:00Z"),
            id_animateur: uClaire.id,
        },
        // Session en cours : réponses partielles
        {
            code_acces: "EF34GH", statut: "en_cours",
            date_debut: new Date("2026-03-12T14:00:00Z"),
            date_fin: null,
            id_animateur: uClaire.id, // Claire anime 2 sessions → teste ANIME 0,n
        },
        // Session en attente : ni date_debut ni date_fin, aucun participant
        {
            code_acces: "IJ56KL", statut: "en_attente",
            date_debut: null,
            date_fin: null,
            id_animateur: uMarc.id,
        },
        // Session d'une autre organisation (IUT)
        {
            code_acces: "MN78OP", statut: "terminee",
            date_debut: new Date("2026-03-05T10:00:00Z"),
            date_fin: new Date("2026-03-05T10:30:00Z"),
            id_animateur: uHugo.id,
        },
        {
            code_acces: "QR90ST", statut: "en_cours",
            date_debut: new Date("2026-03-14T16:00:00Z"),
            date_fin: null,
            id_animateur: uNadia.id,
        },
    ]);
    const sTerminee = at(sessions, 0);
    const sEnCours = at(sessions, 1);
    const sEnAttente = at(sessions, 2);
    const sIutTerminee = at(sessions, 3);
    const sIutEnCours = at(sessions, 4);

    // ---------------------------------------------------------------- SESSION_THEME (PORTE SUR, attribut numero_manche)
    await AppDataSource.getRepository(SessionTheme).save([
        // Session terminée : 3 manches sur 3 thèmes distincts (§2).
        // La manche 3 utilise Géographie, un thème sans question : cas limite volontaire.
        { id_session: sTerminee.id, id_theme: thCulture.id, numero_manche: 1 },
        { id_session: sTerminee.id, id_theme: thHistoire.id, numero_manche: 2 },
        { id_session: sTerminee.id, id_theme: thGeo.id, numero_manche: 3 },
        // Session en cours : 2 manches
        { id_session: sEnCours.id, id_theme: thHistoire.id, numero_manche: 1 },
        { id_session: sEnCours.id, id_theme: thCulture.id, numero_manche: 2 },
        // Session en attente : 1 manche prévue (session sans participant mais avec un thème)
        { id_session: sEnAttente.id, id_theme: thCulture.id, numero_manche: 1 },
        // Sessions IUT
        { id_session: sIutTerminee.id, id_theme: thAlgo.id, numero_manche: 1 },
        { id_session: sIutTerminee.id, id_theme: thReseaux.id, numero_manche: 2 },
        { id_session: sIutEnCours.id, id_theme: thAlgo.id, numero_manche: 1 },
    ]);

    // ---------------------------------------------------------------- PARTICIPANT (REJOINT 1,n — 1,1)
    const participants = await AppDataSource.getRepository(Participant).save([
        // Session terminée : 4 participants
        { pseudo: "Lea", score_total: 480, id_session: sTerminee.id },
        { pseudo: "Tom", score_total: 350, id_session: sTerminee.id },
        { pseudo: "Ines", score_total: 275, id_session: sTerminee.id },
        { pseudo: "Yanis", score_total: 0, id_session: sTerminee.id }, // aucune réponse → REPOND côté 0
        // Session en cours : 3 participants
        { pseudo: "Nora", score_total: 120, id_session: sEnCours.id },
        { pseudo: "Karim", score_total: 90, id_session: sEnCours.id },
        { pseudo: "Elsa", score_total: 60, id_session: sEnCours.id },
        // Sessions IUT
        { pseudo: "Dev_Alex", score_total: 300, id_session: sIutTerminee.id },
        { pseudo: "Dev_Sam", score_total: 240, id_session: sIutTerminee.id },
        { pseudo: "Dev_Zoe", score_total: 30, id_session: sIutEnCours.id },
    ]);
    const pLea = at(participants, 0);
    const pTom = at(participants, 1);
    const pInes = at(participants, 2);
    const pNora = at(participants, 4);
    const pKarim = at(participants, 5);
    const pElsa = at(participants, 6);
    const pAlex = at(participants, 7);
    const pSam = at(participants, 8);
    const pZoe = at(participants, 9);
    // Yanis (index 3) ne répond à rien et ne reçoit aucune carte → teste REPOND / RECOIT côté 0

    // ---------------------------------------------------------------- REPONSE_PARTICIPANT (REPOND, attributs portés)
    const r = (participant: Participant, question: Question, choisie: number, ms: number, points: number) => ({
        id_participant: participant.id,
        id_question: question.id,
        reponse_choisie: choisie,
        temps_reponse_ms: ms,
        points,
    });

    await AppDataSource.getRepository(ReponseParticipant).save([
        // --- Session terminée, manche 1 (Culture générale)
        r(pLea, qCult1, 3, 4200, 100),   // bonne réponse, rapide
        r(pTom, qCult1, 1, 8100, 60),    // mauvaise réponse (Sydney)
        r(pInes, qCult1, 3, 12500, 70),  // bonne mais lente
        r(pLea, qCult2, 2, 2100, 100),
        r(pTom, qCult2, 2, 3300, 90),
        r(pInes, qCult2, 4, 9800, 0),    // mauvaise réponse, 0 point
        r(pLea, qCult3, 3, 5000, 90),
        r(pTom, qCult3, 3, 6400, 80),
        // Ines n'a pas répondu à qCult3 → réponses partielles
        // --- Session terminée, manche 2 (Histoire)
        r(pLea, qHist1, 2, 3000, 100),
        r(pTom, qHist1, 2, 4500, 85),
        r(pInes, qHist1, 3, 11000, 0),
        r(pLea, qHist2, 2, 7000, 90),
        r(pInes, qHist2, 2, 8900, 75),
        // --- Session en cours (Histoire puis Culture) : partiel, personne sur qCult3
        r(pNora, qHist1, 2, 5200, 80),
        r(pKarim, qHist1, 4, 9100, 0),
        r(pElsa, qHist1, 2, 10400, 60),
        r(pNora, qCult1, 3, 6100, 40),
        r(pKarim, qCult1, 3, 7700, 90),
        // --- Sessions IUT
        r(pAlex, qAlgo1, 2, 4800, 100),
        r(pSam, qAlgo1, 3, 9200, 0),
        r(pAlex, qAlgo2, 2, 2600, 100),
        r(pSam, qAlgo2, 2, 3900, 90),
        r(pAlex, qAlgo3, 2, 5500, 100),
        r(pSam, qAlgo3, 1, 6800, 0),
        r(pAlex, qRes1, 3, 4100, 0),     // 0 point malgré la bonne réponse (malus appliqué)
        r(pSam, qRes1, 3, 5300, 90),
        r(pSam, qRes2, 3, 4400, 60),
        r(pZoe, qAlgo1, 2, 12000, 30),
    ]);

    // ---------------------------------------------------------------- RECEPTION_CARTE (RECOIT, attributs + cible optionnelle)
    await AppDataSource.getRepository(ReceptionCarte).save([
        // Bonus sans cible (id_cible null)
        // Jouée dans la manche de réception : manche_application == numero_manche
        { id_participant: pLea.id, id_carte: cDouble.id, numero_manche: 1, manche_application: 1, statut: "jouee", id_cible: null },
        // Carte gardée une manche de plus : reçue en 2, jouée en 3 → c'est le cas que
        // numero_manche seul ne savait pas exprimer
        { id_participant: pLea.id, id_carte: cTemps.id, numero_manche: 2, manche_application: 3, statut: "jouee", id_cible: null },
        { id_participant: pTom.id, id_carte: cDouble.id, numero_manche: 2, manche_application: null, statut: "en_main", id_cible: null },
        { id_participant: pInes.id, id_carte: cTemps.id, numero_manche: 1, manche_application: null, statut: "expiree", id_cible: null },
        // Malus avec cible → teste la relation auto-référencée vers Participant
        { id_participant: pTom.id, id_carte: cVol.id, numero_manche: 3, manche_application: 3, statut: "jouee", id_cible: pLea.id },
        { id_participant: pInes.id, id_carte: cBrouille.id, numero_manche: 2, manche_application: 2, statut: "jouee", id_cible: pTom.id },
        { id_participant: pLea.id, id_carte: cTempsRed.id, numero_manche: 3, manche_application: null, statut: "expiree", id_cible: pInes.id },
        // Session en cours
        { id_participant: pNora.id, id_carte: cDouble.id, numero_manche: 1, manche_application: null, statut: "en_main", id_cible: null },
        { id_participant: pKarim.id, id_carte: cVol.id, numero_manche: 1, manche_application: null, statut: "en_main", id_cible: pNora.id },
        // Sessions IUT
        { id_participant: pAlex.id, id_carte: cTemps.id, numero_manche: 1, manche_application: 1, statut: "jouee", id_cible: null },
        { id_participant: pSam.id, id_carte: cVol.id, numero_manche: 2, manche_application: 2, statut: "jouee", id_cible: pAlex.id },
        { id_participant: pAlex.id, id_carte: cBrouille.id, numero_manche: 2, manche_application: null, statut: "en_main", id_cible: pSam.id },
    ]);

    // ---------------------------------------------------------------- Récapitulatif
    for (const entity of [
        Organisation, Utilisateur, Theme, Question, Carte,
        Session, SessionTheme, Participant, ReponseParticipant, ReceptionCarte,
    ]) {
        const count = await AppDataSource.getRepository(entity).count();
        console.log(`${entity.name.padEnd(20)} ${count}`);
    }

    await AppDataSource.destroy();
    console.log("\n✅ Dataset inséré");
}

seed().catch(async (err) => {
    console.error("❌ Échec du seed :", err);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    throw err;
});
