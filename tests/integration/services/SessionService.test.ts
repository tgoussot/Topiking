import { describe, it, expect, jest } from "@jest/globals";
import {
    verifierThemes,
    genererCodeAcces,
    creer,
    trouverParCode,
    ouvrirFenetreCartes,
    fermerFenetreCartes,
    fenetreCartesOuverte,
    demarrer,
    terminer,
    annuler,
    expirerCartesNonJouees,
} from "../../../src/services/Jeux/SessionService";
import { Session } from "../../../src/entities/Session";
import { SessionTheme } from "../../../src/entities/SessionTheme";
import { SessionQuestion } from "../../../src/entities/SessionQuestion";
import { Question } from "../../../src/entities/Question";
import { Theme } from "../../../src/entities/Theme";
import { ReceptionCarte } from "../../../src/entities/ReceptionCarte";
import {
    NOMBRE_MANCHES,
    QUESTIONS_PAR_MANCHE,
    CODE_ACCES_MINIMUM,
    CODE_ACCES_MAXIMUM,
    TENTATIVES_CODE_ACCES,
    FENETRE_CARTES_S,
} from "../../../src/config/config";
import {
    creerContexteMinimal,
    creerOrganisation,
    creerUtilisateur,
    creerTheme,
    creerThemeAvecQuestions,
    creerSession,
    creerParticipant,
    creerParticipants,
    creerCarte,
    creerReceptionCarte,
} from "../../helpers/fixtures";

// Prépare une organisation, son animateur et NOMBRE_MANCHES thèmes jouables.
async function contexteAvecThemesJouables(): Promise<{
    idOrganisation: number;
    idAnimateur: number;
    idsThemes: number[];
}> {
    const { organisation, animateur } = await creerContexteMinimal();

    const idsThemes: number[] = [];

    for (let i = 0; i < NOMBRE_MANCHES; i++) {
        const { theme } = await creerThemeAvecQuestions(organisation.id);
        idsThemes.push(theme.id);
    }

    return {
        idOrganisation: organisation.id,
        idAnimateur: animateur.id,
        idsThemes,
    };
}

describe("verifierThemes", () => {
    it("rejette un nombre de thèmes inférieur à NOMBRE_MANCHES", async () => {
        const { idOrganisation, idsThemes } = await contexteAvecThemesJouables();

        await expect(verifierThemes(idsThemes.slice(0, 2), idOrganisation)).rejects.toThrow(
            `Il faut choisir exactement ${NOMBRE_MANCHES} thèmes`
        );
    });

    it("rejette un nombre de thèmes supérieur à NOMBRE_MANCHES", async () => {
        const { organisation, animateur: _animateur } = await creerContexteMinimal();

        const idsThemes: number[] = [];

        for (let i = 0; i < NOMBRE_MANCHES + 1; i++) {
            const { theme } = await creerThemeAvecQuestions(organisation.id);
            idsThemes.push(theme.id);
        }

        await expect(verifierThemes(idsThemes, organisation.id)).rejects.toThrow(
            `Il faut choisir exactement ${NOMBRE_MANCHES} thèmes`
        );
    });

    it("rejette deux thèmes identiques", async () => {
        const { idOrganisation, idsThemes } = await contexteAvecThemesJouables();

        const premierTheme = idsThemes[0];
        const avecDoublon = idsThemes.slice();
        avecDoublon[1] = premierTheme ?? 0;

        await expect(verifierThemes(avecDoublon, idOrganisation)).rejects.toThrow(
            "Les thèmes choisis doivent être différents"
        );
    });

    it("rejette un thème inexistant", async () => {
        const { idOrganisation, idsThemes } = await contexteAvecThemesJouables();

        const avecFantome = idsThemes.slice();
        avecFantome[2] = 9999;

        await expect(verifierThemes(avecFantome, idOrganisation)).rejects.toThrow(
            "Thème 9999 introuvable"
        );
    });

    it("rejette un thème appartenant à une autre organisation", async () => {
        const { idOrganisation, idsThemes } = await contexteAvecThemesJouables();

        // Le thème existe mais n'appartient pas à l'organisation
        // qui crée la session, elle ne doit pas pouvoir le jouer.
        const autreOrganisation = await creerOrganisation();
        const { theme: themeEtranger } = await creerThemeAvecQuestions(autreOrganisation.id);

        const avecIntrus = idsThemes.slice();
        avecIntrus[1] = themeEtranger.id;

        await expect(verifierThemes(avecIntrus, idOrganisation)).rejects.toThrow(
            `Thème ${themeEtranger.id} inaccessible pour cette organisation`
        );
    });

    it("rejette un thème désactivé", async () => {
        const { idOrganisation, idsThemes } = await contexteAvecThemesJouables();

        const { theme: themeInactif } = await creerThemeAvecQuestions(
            idOrganisation,
            QUESTIONS_PAR_MANCHE,
            { actif: false }
        );

        const avecInactif = idsThemes.slice();
        avecInactif[0] = themeInactif.id;

        await expect(verifierThemes(avecInactif, idOrganisation)).rejects.toThrow("est désactivé");
    });

    it("rejette un thème comptant moins de QUESTIONS_PAR_MANCHE questions", async () => {
        const { idOrganisation, idsThemes } = await contexteAvecThemesJouables();

        const { theme: themePauvre } = await creerThemeAvecQuestions(
            idOrganisation,
            QUESTIONS_PAR_MANCHE - 1
        );

        const avecThemePauvre = idsThemes.slice();
        avecThemePauvre[0] = themePauvre.id;

        await expect(verifierThemes(avecThemePauvre, idOrganisation)).rejects.toThrow(
            `il en faut au moins ${QUESTIONS_PAR_MANCHE}`
        );
    });

    it("accepte NOMBRE_MANCHES thèmes valides et renvoie les entités Theme", async () => {
        const { idOrganisation, idsThemes } = await contexteAvecThemesJouables();

        const themes = await verifierThemes(idsThemes, idOrganisation);

        expect(themes.map((theme) => theme.id)).toEqual(idsThemes);
    });
});

describe("genererCodeAcces", () => {
    it("renvoie un code dans les bornes autorisées", async () => {
        const code = await genererCodeAcces();

        expect(code).toBeGreaterThanOrEqual(CODE_ACCES_MINIMUM);
        expect(code).toBeLessThanOrEqual(CODE_ACCES_MAXIMUM);
    });

    it("ne réutilise pas le code d'une session en attente", async () => {
        const { animateur } = await creerContexteMinimal();
        const occupee = await creerSession(animateur.id, {
            code_acces: 123456,
            statut: "en_attente",
        });

        // Math.random forcé sur la valeur qui produirait exactement 123456 :
        // le service doit retirer et renvoyer un code différent.
        const tire = 123456 - CODE_ACCES_MINIMUM;
        const etendue = CODE_ACCES_MAXIMUM - CODE_ACCES_MINIMUM + 1;

        const aleatoire = jest
            .spyOn(Math, "random")
            .mockReturnValueOnce(tire / etendue)
            .mockReturnValue(0);

        const code = await genererCodeAcces();

        aleatoire.mockRestore();

        expect(code).not.toBe(occupee.code_acces);
    });

    it("ne réutilise pas le code d'une session en cours", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 123456, statut: "en_cours" });

        const tire = 123456 - CODE_ACCES_MINIMUM;
        const etendue = CODE_ACCES_MAXIMUM - CODE_ACCES_MINIMUM + 1;

        const aleatoire = jest
            .spyOn(Math, "random")
            .mockReturnValueOnce(tire / etendue)
            .mockReturnValue(0);

        const code = await genererCodeAcces();

        aleatoire.mockRestore();

        expect(code).not.toBe(123456);
    });

    it("réutilise le code d'une session terminée", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 123456, statut: "terminee" });

        // Seuls les statuts actifs bloquent un code : une partie close libère le sien.
        const tire = 123456 - CODE_ACCES_MINIMUM;
        const etendue = CODE_ACCES_MAXIMUM - CODE_ACCES_MINIMUM + 1;

        const aleatoire = jest.spyOn(Math, "random").mockReturnValue(tire / etendue);

        const code = await genererCodeAcces();

        aleatoire.mockRestore();

        expect(code).toBe(123456);
    });

    it("réutilise le code d'une session annulée", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 123456, statut: "annulee" });

        const tire = 123456 - CODE_ACCES_MINIMUM;
        const etendue = CODE_ACCES_MAXIMUM - CODE_ACCES_MINIMUM + 1;

        const aleatoire = jest.spyOn(Math, "random").mockReturnValue(tire / etendue);

        const code = await genererCodeAcces();

        aleatoire.mockRestore();

        expect(code).toBe(123456);
    });

    it("abandonne après TENTATIVES_CODE_ACCES tirages tous occupés", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 123456, statut: "en_attente" });

        // Toujours le même code, déjà pris : les TENTATIVES_CODE_ACCES essais échouent.
        const tire = 123456 - CODE_ACCES_MINIMUM;
        const etendue = CODE_ACCES_MAXIMUM - CODE_ACCES_MINIMUM + 1;

        const aleatoire = jest.spyOn(Math, "random").mockReturnValue(tire / etendue);

        await expect(genererCodeAcces()).rejects.toThrow(
            "Impossible de trouver un code d'accès libre"
        );

        expect(aleatoire).toHaveBeenCalledTimes(TENTATIVES_CODE_ACCES);

        aleatoire.mockRestore();
    });
});

describe("creer", () => {
    it("crée une session en attente sans aucun champ de timing renseigné", async () => {
        const { idOrganisation, idAnimateur, idsThemes } = await contexteAvecThemesJouables();

        const session = await creer(idAnimateur, idOrganisation, idsThemes);

        expect({
            statut: session.statut,
            date_debut: session.date_debut,
            date_fin: session.date_fin,
            id_question_courante: session.id_question_courante,
            numero_manche_courante: session.numero_manche_courante,
            date_debut_question: session.date_debut_question,
            date_debut_fenetre_cartes: session.date_debut_fenetre_cartes,
        }).toEqual({
            statut: "en_attente",
            date_debut: null,
            date_fin: null,
            id_question_courante: null,
            numero_manche_courante: null,
            date_debut_question: null,
            date_debut_fenetre_cartes: null,
        });
    });

    it("crée une ligne SessionTheme par manche, dans l'ordre des thèmes fournis", async () => {
        const { idOrganisation, idAnimateur, idsThemes } = await contexteAvecThemesJouables();

        const session = await creer(idAnimateur, idOrganisation, idsThemes);

        const manches = await SessionTheme.find({
            where: { id_session: session.id },
            order: { numero_manche: "ASC" },
        });

        expect(manches.map((manche) => [manche.numero_manche, manche.id_theme])).toEqual(
            idsThemes.map((idTheme, index) => [index + 1, idTheme])
        );
    });

    it("fige le tirage complet des questions de la partie", async () => {
        const { idOrganisation, idAnimateur, idsThemes } = await contexteAvecThemesJouables();

        const session = await creer(idAnimateur, idOrganisation, idsThemes);

        const tirages = await SessionQuestion.countBy({ id_session: session.id });

        expect(tirages).toBe(NOMBRE_MANCHES * QUESTIONS_PAR_MANCHE);
    });

    it("numérote les questions de 1 à QUESTIONS_PAR_MANCHE dans chaque manche", async () => {
        const { idOrganisation, idAnimateur, idsThemes } = await contexteAvecThemesJouables();

        const session = await creer(idAnimateur, idOrganisation, idsThemes);

        const ordresAttendus: number[] = [];

        for (let i = 0; i < QUESTIONS_PAR_MANCHE; i++) {
            ordresAttendus.push(i + 1);
        }

        for (let manche = 1; manche <= NOMBRE_MANCHES; manche++) {
            const tirages = await SessionQuestion.find({
                where: { id_session: session.id, numero_manche: manche },
                order: { ordre: "ASC" },
            });

            expect(tirages.map((tirage) => tirage.ordre)).toEqual(ordresAttendus);
        }
    });

    it("ne tire que des questions du thème de la manche correspondante", async () => {
        const { idOrganisation, idAnimateur, idsThemes } = await contexteAvecThemesJouables();

        const session = await creer(idAnimateur, idOrganisation, idsThemes);

        for (let manche = 1; manche <= NOMBRE_MANCHES; manche++) {
            const idThemeAttendu = idsThemes[manche - 1];

            const tirages = await SessionQuestion.findBy({
                id_session: session.id,
                numero_manche: manche,
            });

            for (const tirage of tirages) {
                const question = await Question.findOneBy({ id: tirage.id_question });

                expect(question?.id_theme).toBe(idThemeAttendu);
            }
        }
    });

    it("ne crée aucune session quand les thèmes sont invalides", async () => {
        const { idOrganisation, idAnimateur, idsThemes } = await contexteAvecThemesJouables();

        await expect(creer(idAnimateur, idOrganisation, idsThemes.slice(0, 2))).rejects.toThrow();

        expect(await Session.count()).toBe(0);
    });

    it("n'enregistre rien si une manche échoue après la création de la session", async () => {
        // La création est transactionnelle : une erreur survenant APRÈS
        // l'enregistrement de la session ne doit pas laisser en base une
        // session orpheline, sans manche ni tirage.
        const { idOrganisation, idAnimateur, idsThemes } = await contexteAvecThemesJouables();

        // On fait échouer le thème d'une manche en le supprimant juste après
        // la validation initiale : la clé étrangère de SessionTheme rompt.
        const idThemeSupprime = idsThemes[NOMBRE_MANCHES - 1];

        if (idThemeSupprime === undefined) {
            throw new Error("Thème attendu");
        }

        const themesValides = await verifierThemes(idsThemes, idOrganisation);
        expect(themesValides).toHaveLength(NOMBRE_MANCHES);

        await Question.delete({ id_theme: idThemeSupprime });
        await Theme.delete({ id: idThemeSupprime });

        await expect(creer(idAnimateur, idOrganisation, idsThemes)).rejects.toThrow();

        // Aucune trace résiduelle : ni session, ni manche, ni tirage.
        expect(await Session.count()).toBe(0);
        expect(await SessionTheme.count()).toBe(0);
        expect(await SessionQuestion.count()).toBe(0);
    });
});

describe("trouverParCode", () => {
    it("retrouve une session en attente", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            code_acces: 111111,
            statut: "en_attente",
        });

        const trouvee = await trouverParCode(111111);

        expect(trouvee?.id).toBe(session.id);
    });

    it("retrouve une session en cours", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            code_acces: 222222,
            statut: "en_cours",
        });

        const trouvee = await trouverParCode(222222);

        expect(trouvee?.id).toBe(session.id);
    });

    it("ignore une session terminée", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 333333, statut: "terminee" });

        expect(await trouverParCode(333333)).toBeNull();
    });

    it("renvoie null pour un code inexistant", async () => {
        expect(await trouverParCode(444444)).toBeNull();
    });
});

describe("ouvrirFenetreCartes", () => {
    it("horodate l'ouverture de la fenêtre", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const ouverte = await ouvrirFenetreCartes(session.id);

        expect(ouverte.date_debut_fenetre_cartes).toBeInstanceOf(Date);
    });

    it("rejette une session qui n'est pas en cours", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_attente" });

        await expect(ouvrirFenetreCartes(session.id)).rejects.toThrow(
            "Impossible d'ouvrir la fenêtre : session en_attente"
        );
    });

    it("rejette tant qu'une question est ouverte", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const { questions } = await creerThemeAvecQuestions(organisation.id);

        const question = questions[0];

        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            id_question_courante: question?.id ?? null,
        });

        await expect(ouvrirFenetreCartes(session.id)).rejects.toThrow(
            "Une question est encore ouverte"
        );
    });
});

describe("fermerFenetreCartes", () => {
    it("efface l'horodatage d'ouverture", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            date_debut_fenetre_cartes: new Date(),
        });

        const fermee = await fermerFenetreCartes(session.id);

        expect(fermee.date_debut_fenetre_cartes).toBeNull();
    });

    it("rejette une session introuvable", async () => {
        await expect(fermerFenetreCartes(999999)).rejects.toThrow("Session introuvable");
    });

    it("rejette une session qui n'est pas en cours", async () => {
        // Symétrique d'ouvrirFenetreCartes : la fenêtre n'a de sens que
        // pendant une partie en cours.
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "terminee" });

        await expect(fermerFenetreCartes(session.id)).rejects.toThrow(
            "Impossible de fermer la fenêtre"
        );
    });

    it("rejette une session encore en attente", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_attente" });

        await expect(fermerFenetreCartes(session.id)).rejects.toThrow(
            "Impossible de fermer la fenêtre"
        );
    });
});

describe("fenetreCartesOuverte", () => {
    it("renvoie false quand aucune fenêtre n'a été ouverte", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        expect(fenetreCartesOuverte(session)).toBe(false);
    });

    it("renvoie true juste après l'ouverture", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const ouverte = await ouvrirFenetreCartes(session.id);

        expect(fenetreCartesOuverte(ouverte)).toBe(true);
    });

    it("renvoie true juste avant l'expiration de la fenêtre", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const ouverte = await ouvrirFenetreCartes(session.id);

        const instantOuverture = ouverte.date_debut_fenetre_cartes?.getTime() ?? 0;

        jest.useFakeTimers();
        jest.setSystemTime(instantOuverture + (FENETRE_CARTES_S - 1) * 1000);

        const encoreOuverte = fenetreCartesOuverte(ouverte);

        jest.useRealTimers();

        expect(encoreOuverte).toBe(true);
    });

    it("renvoie false une fois la fenêtre expirée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const ouverte = await ouvrirFenetreCartes(session.id);

        const instantOuverture = ouverte.date_debut_fenetre_cartes?.getTime() ?? 0;

        jest.useFakeTimers();
        jest.setSystemTime(instantOuverture + (FENETRE_CARTES_S + 1) * 1000);

        const toujoursOuverte = fenetreCartesOuverte(ouverte);

        jest.useRealTimers();

        expect(toujoursOuverte).toBe(false);
    });
});

describe("demarrer", () => {
    it("passe la session en cours sur la première manche", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_attente" });
        await creerParticipants(session.id, [0, 0]);

        const demarree = await demarrer(session.id, animateur.id);

        expect({
            statut: demarree.statut,
            numero_manche_courante: demarree.numero_manche_courante,
            dateDebutPosee: demarree.date_debut instanceof Date,
        }).toEqual({
            statut: "en_cours",
            numero_manche_courante: 1,
            dateDebutPosee: true,
        });
    });

    it("rejette un appelant qui n'est pas l'animateur de la session", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const intrus = await creerUtilisateur(organisation.id);

        const session = await creerSession(animateur.id, { statut: "en_attente" });
        await creerParticipants(session.id, [0, 0]);

        await expect(demarrer(session.id, intrus.id)).rejects.toThrow(
            "Seul l'animateur de la session peut la démarrer"
        );
    });

    it("rejette une session qui n'est plus en attente", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });
        await creerParticipants(session.id, [0, 0]);

        await expect(demarrer(session.id, animateur.id)).rejects.toThrow("Session déjà en_cours");
    });

    it("rejette une session comptant moins de deux participants", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_attente" });
        await creerParticipant(session.id);

        await expect(demarrer(session.id, animateur.id)).rejects.toThrow(
            "Il faut au moins 2 participants pour démarrer"
        );
    });
});

describe("terminer", () => {
    it("clôt la session et remet les champs de timing à zéro", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const { questions } = await creerThemeAvecQuestions(organisation.id);

        const session = await creerSession(animateur.id, {
            statut: "en_cours",
            id_question_courante: questions[0]?.id ?? null,
            date_debut_question: new Date(),
            date_debut_fenetre_cartes: new Date(),
        });

        const terminee = await terminer(session.id);

        expect({
            statut: terminee.statut,
            dateFinPosee: terminee.date_fin instanceof Date,
            id_question_courante: terminee.id_question_courante,
            date_debut_question: terminee.date_debut_question,
            date_debut_fenetre_cartes: terminee.date_debut_fenetre_cartes,
        }).toEqual({
            statut: "terminee",
            dateFinPosee: true,
            id_question_courante: null,
            date_debut_question: null,
            date_debut_fenetre_cartes: null,
        });
    });

    it("expire les cartes restées en main", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });
        const participant = await creerParticipant(session.id);
        const carte = await creerCarte();
        const reception = await creerReceptionCarte(participant.id, carte.id, {
            statut: "en_main",
        });

        await terminer(session.id);

        const rechargee = await ReceptionCarte.findOneBy({ id: reception.id });

        expect(rechargee?.statut).toBe("expiree");
    });

    it("reste sans effet à un second appel", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const premiereCloture = await terminer(session.id);
        const dateFinInitiale = premiereCloture.date_fin?.getTime() ?? 0;

        const secondeCloture = await terminer(session.id);

        expect({
            statut: secondeCloture.statut,
            dateFin: secondeCloture.date_fin?.getTime() ?? 0,
        }).toEqual({
            statut: "terminee",
            dateFin: dateFinInitiale,
        });
    });
});

describe("annuler", () => {
    it("bascule la session en annulée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const annulee = await annuler(session.id, animateur.id);

        expect(annulee.statut).toBe("annulee");
    });

    it("rejette un appelant qui n'est pas l'animateur de la session", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const intrus = await creerUtilisateur(organisation.id);

        const session = await creerSession(animateur.id, { statut: "en_cours" });

        await expect(annuler(session.id, intrus.id)).rejects.toThrow(
            "Seul l'animateur de la session peut l'annuler"
        );
    });

    it("rejette une session déjà terminée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "terminee" });

        await expect(annuler(session.id, animateur.id)).rejects.toThrow("Session déjà terminée");
    });

    it("est idempotent : un second appel ne réécrit pas la date de fin", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });

        const premiere = await annuler(session.id, animateur.id);
        const dateFinInitiale = premiere.date_fin?.getTime();

        const seconde = await annuler(session.id, animateur.id);

        expect(seconde.statut).toBe("annulee");
        expect(seconde.date_fin?.getTime()).toBe(dateFinInitiale);
    });
});

describe("expirerCartesNonJouees", () => {
    it("laisse intactes les cartes déjà jouées", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });
        const participant = await creerParticipant(session.id);
        const carte = await creerCarte();

        const jouee = await creerReceptionCarte(participant.id, carte.id, { statut: "jouee" });
        await creerReceptionCarte(participant.id, carte.id, { statut: "en_main" });

        await expirerCartesNonJouees(session.id);

        const rechargee = await ReceptionCarte.findOneBy({ id: jouee.id });

        expect(rechargee?.statut).toBe("jouee");
    });

    it("renvoie le nombre de cartes expirées", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });
        const carte = await creerCarte();

        const premierJoueur = await creerParticipant(session.id);
        const secondJoueur = await creerParticipant(session.id);

        await creerReceptionCarte(premierJoueur.id, carte.id, { statut: "en_main" });
        await creerReceptionCarte(premierJoueur.id, carte.id, { statut: "en_main" });
        await creerReceptionCarte(secondJoueur.id, carte.id, { statut: "en_main" });
        await creerReceptionCarte(secondJoueur.id, carte.id, { statut: "jouee" });

        expect(await expirerCartesNonJouees(session.id)).toBe(3);
    });
});
