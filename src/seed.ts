import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { Organisation } from "./entities/Organisation";
import { Utilisateur } from "./entities/Utilisateur";
import { Theme } from "./entities/Theme";
import { Question } from "./entities/Question";
import { Session } from "./entities/Session";
import { SessionTheme } from "./entities/SessionTheme";
import { SessionQuestion } from "./entities/SessionQuestion";
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
            "session_question", "session_theme", "session", "question", "theme",
            "utilisateur", "organisation", "carte"
        RESTART IDENTITY CASCADE
    `);

    // ---------------------------------------------------------------- ORGANISATION
    const organisations = await AppDataSource.getRepository(Organisation).save([
        { nom: "Lycée Victor Hugo", slug: "lycee-victor-hugo",code_invitation: 100001 },
        { nom: "IUT Informatique Lyon", slug: "iut-info-lyon",code_invitation: 100002 },
        { nom: "Acme Formation", slug: "acme-formation", code_invitation:100003 },
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
        q(thHistoire, "En quelle année la Première Guerre mondiale prend-elle fin ?", ["1916", "1917", "1918", "1919"], 3, 20, "L'armistice est signé le 11 novembre 1918."),
        // Algorithmique
        q(thAlgo, "Complexité moyenne du tri rapide ?", ["O(n)", "O(n log n)", "O(n²)", "O(log n)"], 2, 30, "Le pire cas reste en O(n²)."),
        q(thAlgo, "Quelle structure suit le principe LIFO ?", ["File", "Pile", "Arbre", "Graphe"], 2, 20, "Last In, First Out."),
        q(thAlgo, "Complexité d'une recherche dichotomique ?", ["O(1)", "O(log n)", "O(n)", "O(n log n)"], 2, 25, null),
        // Réseaux
        q(thReseaux, "Combien de couches dans le modèle OSI ?", ["4", "5", "7", "9"], 3, 15, "Physique à Application."),
        q(thReseaux, "Quel port utilise HTTPS par défaut ?", ["21", "80", "443", "8080"], 3, 15, null),
        q(thReseaux, "Que traduit le protocole DNS ?", ["Une adresse IP en nom de domaine", "Un nom de domaine en adresse IP", "Un port en service", "Une adresse MAC en IP"], 2, 20, "Le DNS résout les noms de domaine en adresses IP."),
        // Sécurité (thème d'une autre organisation, jamais joué)
        q(thSecu, "Que signifie EPI ?", ["Équipement de Protection Individuelle", "Étude Préalable Interne", "Examen Périodique Imposé", "Entretien Programmé Industriel"], 1, 20, null),

        // --- Questions de réserve ---
        // Ajoutées à la fin pour ne décaler aucun index at() ci-dessous.
        // Elles donnent de quoi piocher : une manche tire 3 questions parmi celles
        // du thème, donc sans réserve deux parties poseraient toujours les mêmes.
        q(thCulture, "Quel est le plus long fleuve du monde ?", ["Le Nil", "L'Amazone", "Le Yangtsé", "Le Mississippi"], 2, 20, "L'Amazone est aujourd'hui reconnu comme le plus long."),
        q(thCulture, "Combien de continents compte la Terre ?", ["4", "5", "6", "7"], 4, 15, null),
        q(thCulture, "Qui a écrit Les Misérables ?", ["Zola", "Balzac", "Hugo", "Flaubert"], 3, 20, "Victor Hugo, publié en 1862."),
        q(thCulture, "Quelle planète est la plus proche du Soleil ?", ["Vénus", "Mercure", "Mars", "Terre"], 2, 15, null),
        q(thCulture, "En quelle année l'homme a-t-il marché sur la Lune ?", ["1965", "1969", "1972", "1975"], 2, 20, "Apollo 11, le 20 juillet 1969."),

        q(thHistoire, "Qui était le roi de France en 1789 ?", ["Louis XIV", "Louis XV", "Louis XVI", "Charles X"], 3, 20, "Louis XVI règne de 1774 à 1792."),
        q(thHistoire, "Quand la Ve République est-elle instaurée ?", ["1945", "1958", "1962", "1968"], 2, 20, "En 1958, avec le retour de De Gaulle."),
        q(thHistoire, "Quel traité met fin à la Première Guerre mondiale ?", ["Traité de Vienne", "Traité de Versailles", "Traité de Rome", "Traité de Paris"], 2, 25, null),
        q(thHistoire, "En quelle année la Seconde Guerre mondiale commence-t-elle ?", ["1937", "1939", "1940", "1941"], 2, 15, "Le 1er septembre 1939."),
        q(thHistoire, "Qui a proclamé l'abolition de l'esclavage en France en 1848 ?", ["Napoléon III", "Victor Schoelcher", "Jules Ferry", "Léon Gambetta"], 2, 25, null),

        q(thAlgo, "Quelle structure suit le principe FIFO ?", ["Pile", "File", "Arbre", "Tas"], 2, 20, "First In, First Out."),
        q(thAlgo, "Complexité du tri par insertion dans le pire cas ?", ["O(n)", "O(n log n)", "O(n²)", "O(2^n)"], 3, 25, null),
        q(thAlgo, "Quel parcours d'arbre visite la racine en premier ?", ["Préfixe", "Infixe", "Suffixe", "Par niveau"], 1, 20, "Le parcours préfixe traite la racine avant les sous-arbres."),
        q(thAlgo, "Que garantit un algorithme glouton ?", ["L'optimum global", "Un choix localement optimal", "Une complexité linéaire", "Une solution unique"], 2, 30, null),
        q(thAlgo, "Combien de comparaisons pour une dichotomie sur 1024 éléments ?", ["10", "32", "512", "1024"], 1, 25, "log2(1024) = 10."),

        q(thReseaux, "Que signifie l'acronyme IP ?", ["Internet Protocol", "Internal Process", "Information Packet", "Interface Port"], 1, 15, null),
        q(thReseaux, "Quel protocole garantit la livraison des paquets ?", ["UDP", "TCP", "ICMP", "ARP"], 2, 20, "TCP est orienté connexion, contrairement à UDP."),
        q(thReseaux, "Quelle couche OSI gère le routage ?", ["Liaison", "Réseau", "Transport", "Session"], 2, 20, "La couche 3, réseau."),
        q(thReseaux, "Combien de bits dans une adresse IPv4 ?", ["16", "32", "64", "128"], 2, 15, null),
        q(thReseaux, "À quoi sert le protocole ARP ?", ["Résoudre une IP en adresse MAC", "Chiffrer les échanges", "Attribuer une IP", "Router les paquets"], 1, 25, null),
    ]);
    const qCult1 = at(questions, 0);
    const qCult2 = at(questions, 1);
    const qCult3 = at(questions, 2);
    const qHist1 = at(questions, 3);
    const qHist2 = at(questions, 4);
    const qAlgo1 = at(questions, 6);
    const qAlgo2 = at(questions, 7);
    const qAlgo3 = at(questions, 8);
    const qRes1 = at(questions, 9);
    const qRes2 = at(questions, 10);

    // ---------------------------------------------------------------- CARTE
    // Les 7 cartes des règles (§7). "effet" est le code lu par EffetsService,
    // "intensite" la valeur du réglage (secondes, points, index...).
    // Principes d'équilibrage : aucun malus ne retire de points ni ne fait perdre
    // un tour, aucun bonus ne vaut plus d'un tiers d'une bonne réponse.
    const cartes = await AppDataSource.getRepository(Carte).save([
        // Deck malus : pour le vainqueur de la manche, à lancer sur un adversaire
        { libelle: "Brouillage", type: "malus", effet: "melange_propositions", intensite: 2 },
        { libelle: "Contre-la-montre", type: "malus", effet: "retrait_temps_s", intensite: 5 },
        { libelle: "Flou", type: "malus", effet: "floutage_proposition_s", intensite: 3 },
        // Deck bonus : pour le dernier, à s'appliquer à soi-même
        { libelle: "Rallonge", type: "bonus", effet: "ajout_temps_s", intensite: 5 },
        { libelle: "Indice", type: "bonus", effet: "elimination_proposition", intensite: 1 },
        { libelle: "Élan", type: "bonus", effet: "ajout_points", intensite: 25 },
        { libelle: "Anticipation", type: "bonus", effet: "revelation_anticipee_s", intensite: 3 },
    ]);
    const cBrouillage = at(cartes, 0);
    const cContreMontre = at(cartes, 1);
    const cRallonge = at(cartes, 3);
    const cIndice = at(cartes, 4);
    const cElan = at(cartes, 5);
    // "Flou" (index 2) et "Anticipation" (index 6) ne sont jamais distribuées → testent RECOIT 0,n côté 0

    // ---------------------------------------------------------------- SESSION (ANIME 0,n — 1,1)
    const sessions = await AppDataSource.getRepository(Session).save([
        // Session terminée et complète : c'est elle qui porte le jeu de données riche
        {
            code_acces: 481203, statut: "terminee",
            date_debut: new Date("2026-03-10T09:00:00Z"),
            date_fin: new Date("2026-03-10T09:45:00Z"),
            id_animateur: uClaire.id,
        },
        // Session en cours : réponses partielles
        {
            code_acces: 573914, statut: "en_cours",
            date_debut: new Date("2026-03-12T14:00:00Z"),
            date_fin: null,
            id_animateur: uClaire.id, // Claire anime 2 sessions → teste ANIME 0,n
        },
        // Session en attente : ni date_debut ni date_fin, aucun participant
        {
            code_acces: 620857, statut: "en_attente",
            date_debut: null,
            date_fin: null,
            id_animateur: uMarc.id,
        },
        // Session d'une autre organisation (IUT)
        {
            code_acces: 738261, statut: "terminee",
            date_debut: new Date("2026-03-05T10:00:00Z"),
            date_fin: new Date("2026-03-05T10:30:00Z"),
            id_animateur: uHugo.id,
        },
        {
            code_acces: 194736, statut: "en_cours",
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

    // ---------------------------------------------------------------- SESSION_QUESTION (tirage figé des questions)
    // En production, ces lignes sont écrites par SessionService.creer() qui mélange
    // les questions du thème. Ici on les fixe pour rester cohérent avec les
    // ReponseParticipant ci-dessous, qui portent sur des questions précises.
    await AppDataSource.getRepository(SessionQuestion).save([
        // Session terminée, manche 1 (Culture générale)
        { id_session: sTerminee.id, id_question: qCult1.id, numero_manche: 1, ordre: 1 },
        { id_session: sTerminee.id, id_question: qCult2.id, numero_manche: 1, ordre: 2 },
        { id_session: sTerminee.id, id_question: qCult3.id, numero_manche: 1, ordre: 3 },
        // Session terminée, manche 2 (Histoire) : seulement 2 questions posées
        { id_session: sTerminee.id, id_question: qHist1.id, numero_manche: 2, ordre: 1 },
        { id_session: sTerminee.id, id_question: qHist2.id, numero_manche: 2, ordre: 2 },
        // Manche 3 (Géographie) sans question : thème vide, cas limite volontaire
        // Session en cours : manche 1 Histoire, manche 2 Culture
        { id_session: sEnCours.id, id_question: qHist1.id, numero_manche: 1, ordre: 1 },
        { id_session: sEnCours.id, id_question: qCult1.id, numero_manche: 2, ordre: 1 },
        // Sessions IUT
        { id_session: sIutTerminee.id, id_question: qAlgo1.id, numero_manche: 1, ordre: 1 },
        { id_session: sIutTerminee.id, id_question: qAlgo2.id, numero_manche: 1, ordre: 2 },
        { id_session: sIutTerminee.id, id_question: qAlgo3.id, numero_manche: 1, ordre: 3 },
        { id_session: sIutTerminee.id, id_question: qRes1.id, numero_manche: 2, ordre: 1 },
        { id_session: sIutTerminee.id, id_question: qRes2.id, numero_manche: 2, ordre: 2 },
        { id_session: sIutEnCours.id, id_question: qAlgo1.id, numero_manche: 1, ordre: 1 },
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
        { id_participant: pLea.id, id_carte: cElan.id, numero_manche: 1, manche_application: 1, statut: "jouee", id_cible: null },
        // Carte gardée une manche de plus : reçue en 2, jouée en 3 → c'est le cas que
        // numero_manche seul ne savait pas exprimer
        { id_participant: pLea.id, id_carte: cRallonge.id, numero_manche: 2, manche_application: 3, statut: "jouee", id_cible: null },
        { id_participant: pTom.id, id_carte: cElan.id, numero_manche: 2, manche_application: null, statut: "en_main", id_cible: null },
        { id_participant: pInes.id, id_carte: cRallonge.id, numero_manche: 1, manche_application: null, statut: "expiree", id_cible: null },
        // Malus avec cible → teste la relation auto-référencée vers Participant
        { id_participant: pTom.id, id_carte: cContreMontre.id, numero_manche: 3, manche_application: 3, statut: "jouee", id_cible: pLea.id },
        { id_participant: pInes.id, id_carte: cBrouillage.id, numero_manche: 2, manche_application: 2, statut: "jouee", id_cible: pTom.id },
        { id_participant: pLea.id, id_carte: cBrouillage.id, numero_manche: 3, manche_application: null, statut: "expiree", id_cible: pInes.id },
        // Session en cours
        { id_participant: pNora.id, id_carte: cElan.id, numero_manche: 1, manche_application: null, statut: "en_main", id_cible: null },
        { id_participant: pElsa.id, id_carte: cIndice.id, numero_manche: 1, manche_application: null, statut: "en_main", id_cible: null },
        { id_participant: pKarim.id, id_carte: cContreMontre.id, numero_manche: 1, manche_application: null, statut: "en_main", id_cible: pNora.id },
        // Sessions IUT
        { id_participant: pAlex.id, id_carte: cRallonge.id, numero_manche: 1, manche_application: 1, statut: "jouee", id_cible: null },
        { id_participant: pSam.id, id_carte: cContreMontre.id, numero_manche: 2, manche_application: 2, statut: "jouee", id_cible: pAlex.id },
        { id_participant: pAlex.id, id_carte: cBrouillage.id, numero_manche: 2, manche_application: null, statut: "en_main", id_cible: pSam.id },
    ]);

    // ---------------------------------------------------------------- Récapitulatif
    for (const entity of [
        Organisation, Utilisateur, Theme, Question, Carte,
        Session, SessionTheme, SessionQuestion, Participant, ReponseParticipant, ReceptionCarte,
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
