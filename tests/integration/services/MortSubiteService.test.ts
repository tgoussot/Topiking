import { describe, it, expect } from "@jest/globals";
import {
    MANCHE_MORT_SUBITE,
    egaliteEnTete,
    questionsDejaPosees,
    choisirQuestionInedite,
    ouvrirMortSubite,
    repondreMortSubite,
    vainqueurMortSubite,
    cloturerMortSubite,
} from "../../../src/services/MortSubiteService";
import { Session } from "../../../src/entities/Session";
import { Question } from "../../../src/entities/Question";
import { SessionQuestion } from "../../../src/entities/SessionQuestion";
import { ReponseParticipant } from "../../../src/entities/ReponseParticipant";
import { Participant } from "../../../src/entities/Participant";
import { Organisation } from "../../../src/entities/Organisation";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { Theme } from "../../../src/entities/Theme";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipants,
    creerTheme,
    creerQuestion,
    creerThemeAvecQuestions,
    creerSessionQuestion,
    creerReponse,
    creerUtilisateur,
    creerOrganisation,
} from "../../helpers/fixtures";

type Contexte = {
    organisation: Organisation;
    animateur: Utilisateur;
    session: Session;
    theme: Theme;
    questions: Question[];
    participants: Participant[];
};

// Met en place une partie « en_cours » avec des scores imposés et un thème
// dont les `questionsTirees` premières questions ont déjà été posées.
// La quasi-totalité des tests part de cette situation.
async function preparerPartie(
    scores: number[] = [300, 300, 100],
    questionsDuTheme: number = 4,
    questionsTirees: number = 3
): Promise<Contexte> {
    const { organisation, animateur } = await creerContexteMinimal();
    const { theme, questions } = await creerThemeAvecQuestions(organisation.id, questionsDuTheme);
    const session = await creerSession(animateur.id, { statut: "en_cours" });
    const participants = await creerParticipants(session.id, scores);

    for (let i = 0; i < questionsTirees; i++) {
        const question = questions[i];

        if (question === undefined) {
            continue;
        }

        await creerSessionQuestion(session.id, question.id, 1, i + 1);
    }

    return { organisation, animateur, session, theme, questions, participants };
}

describe("MANCHE_MORT_SUBITE", () => {
    it("vaut la manche suivant la dernière manche normale", () => {
        expect(MANCHE_MORT_SUBITE).toBe(4);
    });
});

describe("egaliteEnTete", () => {
    it("renvoie les joueurs à égalité en tête", async () => {
        const { session } = await preparerPartie([300, 300, 100]);

        const exAequo = await egaliteEnTete(session.id);

        expect(exAequo.map((joueur) => joueur.idParticipant).sort()).toEqual([1, 2]);
    });

    it("renvoie un tableau vide s'il n'y a qu'un seul leader", async () => {
        const { session } = await preparerPartie([300, 200, 100]);

        expect(await egaliteEnTete(session.id)).toEqual([]);
    });

    it("renvoie un tableau vide pour une session sans participant", async () => {
        const { session } = await preparerPartie([]);

        expect(await egaliteEnTete(session.id)).toEqual([]);
    });

    it("renvoie 3 joueurs si 3 sont à égalité", async () => {
        const { session } = await preparerPartie([300, 300, 300]);

        expect(await egaliteEnTete(session.id)).toHaveLength(3);
    });

    it("ignore les joueurs qui ne sont pas en tête", async () => {
        const { session } = await preparerPartie([300, 300, 299, 0]);

        const exAequo = await egaliteEnTete(session.id);

        expect(exAequo.every((joueur) => joueur.points === 300)).toBe(true);
    });
});

describe("questionsDejaPosees", () => {
    it("renvoie les identifiants des questions tirées dans la session", async () => {
        const { session, questions } = await preparerPartie();

        const posees = await questionsDejaPosees(session.id);

        expect(posees.sort()).toEqual(questions.slice(0, 3).map((question) => question.id).sort());
    });

    it("renvoie un tableau vide si aucun tirage", async () => {
        const { session } = await preparerPartie([300, 300], 4, 0);

        expect(await questionsDejaPosees(session.id)).toEqual([]);
    });

    it("ne renvoie pas les questions d'une AUTRE session", async () => {
        const { animateur, questions, session } = await preparerPartie();

        const autreSession = await creerSession(animateur.id, { statut: "en_cours" });
        const quatrieme = questions[3];

        if (quatrieme === undefined) {
            throw new Error("Le thème doit contenir une quatrième question");
        }

        await creerSessionQuestion(autreSession.id, quatrieme.id, 1, 1);

        expect(await questionsDejaPosees(session.id)).not.toContain(quatrieme.id);
    });
});

describe("choisirQuestionInedite", () => {
    it("ne renvoie jamais une question déjà posée dans la session", async () => {
        const { session } = await preparerPartie();

        const posees = await questionsDejaPosees(session.id);
        const choisie = await choisirQuestionInedite(session.id);

        expect(posees).not.toContain(choisie?.id);
    });

    it("renvoie une question du même thème si disponible", async () => {
        const { session, theme } = await preparerPartie();

        const choisie = await choisirQuestionInedite(session.id);

        expect(choisie?.id_theme).toBe(theme.id);
    });

    it("élargit à l'organisation quand les thèmes de la session sont épuisés", async () => {
        // Le thème joué est intégralement consommé : la seule issue est l'autre thème.
        const { organisation, session } = await preparerPartie([300, 300], 3, 3);

        const autreTheme = await creerTheme(organisation.id);
        const secours = await creerQuestion(autreTheme.id);

        const choisie = await choisirQuestionInedite(session.id);

        expect(choisie?.id).toBe(secours.id);
    });

    it("renvoie null si toutes les questions de l'organisation ont été posées", async () => {
        const { session } = await preparerPartie([300, 300], 3, 3);

        expect(await choisirQuestionInedite(session.id)).toBeNull();
    });

    it("renvoie null si la session n'a aucun tirage", async () => {
        const { session } = await preparerPartie([300, 300], 4, 0);

        expect(await choisirQuestionInedite(session.id)).toBeNull();
    });

    it("ne renvoie pas une question d'une AUTRE organisation", async () => {
        const { session } = await preparerPartie([300, 300], 3, 3);

        const autreOrganisation = await creerOrganisation();
        const themeEtranger = await creerTheme(autreOrganisation.id);
        await creerQuestion(themeEtranger.id);

        expect(await choisirQuestionInedite(session.id)).toBeNull();
    });

    it("ne renvoie pas une question d'un thème désactivé lors de l'élargissement", async () => {
        const { organisation, session } = await preparerPartie([300, 300], 3, 3);

        const themeInactif = await creerTheme(organisation.id, { actif: false });
        await creerQuestion(themeInactif.id);

        expect(await choisirQuestionInedite(session.id)).toBeNull();
    });
});

describe("ouvrirMortSubite", () => {
    it("rejette si la session n'est pas \"en_cours\"", async () => {
        const { session } = await preparerPartie();

        session.statut = "terminee";
        await session.save();

        await expect(ouvrirMortSubite(session.id)).rejects.toThrow("session terminee");
    });

    it("rejette s'il n'y a pas d'égalité en tête", async () => {
        const { session } = await preparerPartie([300, 200]);

        await expect(ouvrirMortSubite(session.id)).rejects.toThrow("Pas d'égalité en tête");
    });

    it("rejette si aucune question inédite n'est disponible", async () => {
        const { session } = await preparerPartie([300, 300], 3, 3);

        await expect(ouvrirMortSubite(session.id)).rejects.toThrow("Aucune question inédite");
    });

    it("crée une ligne SessionQuestion sur la manche de mort subite, en premier", async () => {
        const { session } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);

        const tirage = await SessionQuestion.findOneBy({
            id_session: session.id,
            id_question: question.id,
        });

        expect(tirage?.numero_manche).toBe(MANCHE_MORT_SUBITE);
        expect(tirage?.ordre).toBe(1);
    });

    it("pose la question courante, la manche courante et le départ du timer", async () => {
        const { session } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);

        const rechargee = await Session.findOneBy({ id: session.id });

        expect(rechargee?.id_question_courante).toBe(question.id);
        expect(rechargee?.numero_manche_courante).toBe(MANCHE_MORT_SUBITE);
        expect(rechargee?.date_debut_question).not.toBeNull();
    });
});

describe("repondreMortSubite", () => {
    it("rejette un index hors bornes", async () => {
        const { session, participants } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("La partie doit avoir un premier participant");
        }

        await expect(repondreMortSubite(joueur.id, question.id, 0)).rejects.toThrow("index entre 1 et 4");
        await expect(repondreMortSubite(joueur.id, question.id, 5)).rejects.toThrow("index entre 1 et 4");
    });

    it("rejette un participant inexistant", async () => {
        const { session } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);

        await expect(repondreMortSubite(9999, question.id, 1)).rejects.toThrow("Participant introuvable");
    });

    it("rejette si la question n'est pas la question courante", async () => {
        const { session, participants, questions } = await preparerPartie();

        await ouvrirMortSubite(session.id);

        const joueur = participants[0];
        const autreQuestion = questions[0];

        if (joueur === undefined || autreQuestion === undefined) {
            throw new Error("Contexte incomplet");
        }

        await expect(repondreMortSubite(joueur.id, autreQuestion.id, 1)).rejects.toThrow(
            "Cette question n'est pas ouverte"
        );
    });

    it("rejette un joueur non concerné par le départage", async () => {
        const { session, participants } = await preparerPartie([300, 300, 100]);

        const question = await ouvrirMortSubite(session.id);
        const distance = participants[2];

        if (distance === undefined) {
            throw new Error("La partie doit avoir un troisième participant");
        }

        await expect(repondreMortSubite(distance.id, question.id, 1)).rejects.toThrow(
            "Vous n'êtes pas concerné"
        );
    });

    it("rejette une seconde réponse du même joueur", async () => {
        const { session, participants } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("La partie doit avoir un premier participant");
        }

        await repondreMortSubite(joueur.id, question.id, 2);

        await expect(repondreMortSubite(joueur.id, question.id, 2)).rejects.toThrow("déjà répondu");
    });

    it("rejette si le départage est déjà tranché", async () => {
        const { session, participants } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);
        const premierJoueur = participants[0];
        const secondJoueur = participants[1];

        if (premierJoueur === undefined || secondJoueur === undefined) {
            throw new Error("La partie doit avoir deux participants à égalité");
        }

        await repondreMortSubite(premierJoueur.id, question.id, question.index_bonne_reponse);

        await expect(
            repondreMortSubite(secondJoueur.id, question.id, question.index_bonne_reponse)
        ).rejects.toThrow("déjà tranché");
    });

    it("enregistre la réponse avec zéro point", async () => {
        const { session, participants } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("La partie doit avoir un premier participant");
        }

        await repondreMortSubite(joueur.id, question.id, question.index_bonne_reponse);

        const reponse = await ReponseParticipant.findOneBy({
            id_participant: joueur.id,
            id_question: question.id,
        });

        expect(reponse?.points).toBe(0);
    });

    it("renvoie un vainqueur nul pour une mauvaise réponse", async () => {
        const { session, participants } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("La partie doit avoir un premier participant");
        }

        const mauvaisIndex = question.index_bonne_reponse === 1 ? 2 : 1;

        const resultat = await repondreMortSubite(joueur.id, question.id, mauvaisIndex);

        expect(resultat.idVainqueur).toBeNull();
        expect(resultat.pseudoVainqueur).toBeNull();
    });

    it("désigne le joueur comme vainqueur pour une bonne réponse", async () => {
        const { session, participants } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("La partie doit avoir un premier participant");
        }

        const resultat = await repondreMortSubite(joueur.id, question.id, question.index_bonne_reponse);

        expect(resultat.idVainqueur).toBe(joueur.id);
        expect(resultat.pseudoVainqueur).toBe(joueur.pseudo);
    });
});

describe("vainqueurMortSubite", () => {
    it("renvoie le joueur ayant répondu juste", async () => {
        const { session, participants, questions } = await preparerPartie();

        const question = questions[0];
        const joueur = participants[0];

        if (question === undefined || joueur === undefined) {
            throw new Error("Contexte incomplet");
        }

        await creerReponse(joueur.id, question.id, {
            reponse_choisie: question.index_bonne_reponse,
        });

        const vainqueur = await vainqueurMortSubite(session.id, question.id);

        expect(vainqueur?.id).toBe(joueur.id);
    });

    it("renvoie le plus rapide si plusieurs ont répondu juste", async () => {
        const { session, participants, questions } = await preparerPartie();

        const question = questions[0];
        const lent = participants[0];
        const rapide = participants[1];

        if (question === undefined || lent === undefined || rapide === undefined) {
            throw new Error("Contexte incomplet");
        }

        await creerReponse(lent.id, question.id, {
            reponse_choisie: question.index_bonne_reponse,
            temps_reponse_ms: 5000,
        });
        await creerReponse(rapide.id, question.id, {
            reponse_choisie: question.index_bonne_reponse,
            temps_reponse_ms: 1200,
        });

        const vainqueur = await vainqueurMortSubite(session.id, question.id);

        expect(vainqueur?.id).toBe(rapide.id);
    });

    it("renvoie null si personne n'a répondu juste", async () => {
        const { session, participants, questions } = await preparerPartie();

        const question = questions[0];
        const joueur = participants[0];

        if (question === undefined || joueur === undefined) {
            throw new Error("Contexte incomplet");
        }

        const mauvaisIndex = question.index_bonne_reponse === 1 ? 2 : 1;

        await creerReponse(joueur.id, question.id, { reponse_choisie: mauvaisIndex });

        expect(await vainqueurMortSubite(session.id, question.id)).toBeNull();
    });

    it("ignore les bonnes réponses de participants d'une AUTRE session", async () => {
        // Une même question peut être posée dans plusieurs parties : les réponses
        // d'une autre partie ne doivent jamais départager celle-ci.
        const { animateur, session, questions } = await preparerPartie();

        const question = questions[0];

        if (question === undefined) {
            throw new Error("Contexte incomplet");
        }

        const autreSession = await creerSession(animateur.id, { statut: "en_cours" });
        const etrangers = await creerParticipants(autreSession.id, [300]);
        const etranger = etrangers[0];

        if (etranger === undefined) {
            throw new Error("L'autre partie doit avoir un participant");
        }

        await creerReponse(etranger.id, question.id, {
            reponse_choisie: question.index_bonne_reponse,
            temps_reponse_ms: 1,
        });

        expect(await vainqueurMortSubite(session.id, question.id)).toBeNull();
    });

    it("renvoie null si la question n'existe pas", async () => {
        const { session } = await preparerPartie();

        expect(await vainqueurMortSubite(session.id, 9999)).toBeNull();
    });
});

describe("cloturerMortSubite", () => {
    it("remet la question courante et le départ du timer à null", async () => {
        const { session } = await preparerPartie();

        await ouvrirMortSubite(session.id);
        await cloturerMortSubite(session.id);

        const rechargee = await Session.findOneBy({ id: session.id });

        expect(rechargee?.id_question_courante).toBeNull();
        expect(rechargee?.date_debut_question).toBeNull();
    });

    it("renvoie le vainqueur s'il y en a un", async () => {
        const { session, participants } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);
        const joueur = participants[0];

        if (joueur === undefined) {
            throw new Error("La partie doit avoir un premier participant");
        }

        await repondreMortSubite(joueur.id, question.id, question.index_bonne_reponse);

        const resultat = await cloturerMortSubite(session.id);

        expect(resultat.idVainqueur).toBe(joueur.id);
        expect(resultat.pseudoVainqueur).toBe(joueur.pseudo);
    });

    it("renvoie un vainqueur nul si personne n'a trouvé", async () => {
        // Égalité persistante : l'appelant doit relancer une mort subite.
        const { session } = await preparerPartie();

        const question = await ouvrirMortSubite(session.id);

        const resultat = await cloturerMortSubite(session.id);

        expect(resultat.idQuestion).toBe(question.id);
        expect(resultat.idVainqueur).toBeNull();
    });

    it("rejette si aucune mort subite n'est en cours", async () => {
        const { session } = await preparerPartie();

        await expect(cloturerMortSubite(session.id)).rejects.toThrow("Aucune mort subite en cours");
    });
});
