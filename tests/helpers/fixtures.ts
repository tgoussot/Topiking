import { Organisation } from "../../src/entities/Organisation";
import { Utilisateur } from "../../src/entities/Utilisateur";
import { Theme } from "../../src/entities/Theme";
import { Question } from "../../src/entities/Question";
import { Carte } from "../../src/entities/Carte";
import { Session } from "../../src/entities/Session";
import { SessionTheme } from "../../src/entities/SessionTheme";
import { SessionQuestion } from "../../src/entities/SessionQuestion";
import { Participant } from "../../src/entities/Participant";
import { ReceptionCarte } from "../../src/entities/ReceptionCarte";
import { ReponseParticipant } from "../../src/entities/ReponseParticipant";
import { QUESTIONS_PAR_MANCHE } from "../../src/config";

// Fabriques de données de test.
// Chaque fabrique remplit des valeurs par défaut valides et accepte des
// surcharges, pour qu'un test ne déclare que ce qui l'intéresse vraiment.

let compteur = 0;

// Évite les collisions sur les colonnes uniques (slug, email) entre deux
// appels d'un même test, sans dépendre de l'aléatoire.
function suffixeUnique(): string {
    compteur = compteur + 1;
    return String(compteur);
}

// Remis à zéro en même temps que les tables et les séquences, pour que les
// suffixes restent alignés sur les identifiants d'un test à l'autre.
export function reinitialiserCompteur(): void {
    compteur = 0;
}

export async function creerOrganisation(surcharges: Partial<Organisation> = {}): Promise<Organisation> {
    const suffixe = suffixeUnique();

    const organisation = new Organisation();
    organisation.nom = surcharges.nom ?? `Organisation ${suffixe}`;
    organisation.slug = surcharges.slug ?? `organisation-${suffixe}`;

    return await organisation.save();
}

export async function creerUtilisateur(
    idOrganisation: number,
    surcharges: Partial<Utilisateur> = {}
): Promise<Utilisateur> {
    const suffixe = suffixeUnique();

    const utilisateur = new Utilisateur();
    utilisateur.email = surcharges.email ?? `animateur${suffixe}@exemple.fr`;
    utilisateur.nom = surcharges.nom ?? `Animateur ${suffixe}`;
    utilisateur.mot_de_passe = surcharges.mot_de_passe ?? "motdepasse";
    utilisateur.id_organisation = idOrganisation;

    return await utilisateur.save();
}

export async function creerTheme(idOrganisation: number, surcharges: Partial<Theme> = {}): Promise<Theme> {
    const suffixe = suffixeUnique();

    const theme = new Theme();
    theme.libelle = surcharges.libelle ?? `Thème ${suffixe}`;
    theme.description = surcharges.description ?? null;
    theme.actif = surcharges.actif ?? true;
    theme.id_organisation = idOrganisation;

    return await theme.save();
}

export async function creerQuestion(idTheme: number, surcharges: Partial<Question> = {}): Promise<Question> {
    const suffixe = suffixeUnique();

    const question = new Question();
    question.enonce = surcharges.enonce ?? `Énoncé de la question ${suffixe} ?`;
    question.explication = surcharges.explication ?? null;
    question.proposition_1 = surcharges.proposition_1 ?? "Proposition 1";
    question.proposition_2 = surcharges.proposition_2 ?? "Proposition 2";
    question.proposition_3 = surcharges.proposition_3 ?? "Proposition 3";
    question.proposition_4 = surcharges.proposition_4 ?? "Proposition 4";
    question.index_bonne_reponse = surcharges.index_bonne_reponse ?? 1;
    question.duree_s = surcharges.duree_s ?? 10;
    question.id_theme = idTheme;

    return await question.save();
}

// Crée un thème garni du nombre de questions demandé.
// Par défaut, juste assez pour qu'une manche puisse aller au bout.
export async function creerThemeAvecQuestions(
    idOrganisation: number,
    nombreQuestions: number = QUESTIONS_PAR_MANCHE,
    surchargesTheme: Partial<Theme> = {}
): Promise<{ theme: Theme; questions: Question[] }> {
    const theme = await creerTheme(idOrganisation, surchargesTheme);

    const questions: Question[] = [];

    for (let i = 0; i < nombreQuestions; i++) {
        questions.push(await creerQuestion(theme.id));
    }

    return { theme, questions };
}

export async function creerCarte(surcharges: Partial<Carte> = {}): Promise<Carte> {
    const suffixe = suffixeUnique();

    const carte = new Carte();
    carte.libelle = surcharges.libelle ?? `Carte ${suffixe}`;
    carte.type = surcharges.type ?? "malus";
    carte.effet = surcharges.effet ?? "retrait_temps_s";
    carte.intensite = surcharges.intensite ?? 5;

    return await carte.save();
}

export async function creerSession(idAnimateur: number, surcharges: Partial<Session> = {}): Promise<Session> {
    // Le code doit rester à 6 chiffres : on boucle dans la plage 100000-999999
    // plutôt que de laisser le compteur déborder au fil des tests.
    const rang = Number(suffixeUnique());
    const codeParDefaut = 100000 + (rang % 900000);

    const session = new Session();
    session.code_acces = surcharges.code_acces ?? codeParDefaut;
    session.statut = surcharges.statut ?? "en_attente";
    session.date_debut = surcharges.date_debut ?? null;
    session.date_fin = surcharges.date_fin ?? null;
    session.id_question_courante = surcharges.id_question_courante ?? null;
    session.numero_manche_courante = surcharges.numero_manche_courante ?? null;
    session.date_debut_question = surcharges.date_debut_question ?? null;
    session.date_debut_fenetre_cartes = surcharges.date_debut_fenetre_cartes ?? null;
    session.id_animateur = idAnimateur;

    return await session.save();
}

export async function creerParticipant(
    idSession: number,
    surcharges: Partial<Participant> = {}
): Promise<Participant> {
    const suffixe = suffixeUnique();

    const participant = new Participant();
    participant.pseudo = surcharges.pseudo ?? `Joueur${suffixe}`;
    participant.score_total = surcharges.score_total ?? 0;
    participant.id_session = idSession;

    return await participant.save();
}

// Crée plusieurs participants d'un coup, avec des scores imposés si fournis.
// L'ordre du tableau de scores fixe l'ordre de création, donc les identifiants.
export async function creerParticipants(idSession: number, scores: number[]): Promise<Participant[]> {
    const participants: Participant[] = [];

    for (let i = 0; i < scores.length; i++) {
        participants.push(
            await creerParticipant(idSession, { score_total: scores[i] ?? 0 })
        );
    }

    return participants;
}

export async function creerSessionTheme(
    idSession: number,
    idTheme: number,
    numeroManche: number
): Promise<SessionTheme> {
    const sessionTheme = new SessionTheme();
    sessionTheme.id_session = idSession;
    sessionTheme.id_theme = idTheme;
    sessionTheme.numero_manche = numeroManche;

    return await sessionTheme.save();
}

export async function creerSessionQuestion(
    idSession: number,
    idQuestion: number,
    numeroManche: number,
    ordre: number
): Promise<SessionQuestion> {
    const tirage = new SessionQuestion();
    tirage.id_session = idSession;
    tirage.id_question = idQuestion;
    tirage.numero_manche = numeroManche;
    tirage.ordre = ordre;

    return await tirage.save();
}

export async function creerReceptionCarte(
    idParticipant: number,
    idCarte: number,
    surcharges: Partial<ReceptionCarte> = {}
): Promise<ReceptionCarte> {
    const reception = new ReceptionCarte();
    reception.id_participant = idParticipant;
    reception.id_carte = idCarte;
    reception.numero_manche = surcharges.numero_manche ?? 1;
    reception.manche_application = surcharges.manche_application ?? null;
    reception.statut = surcharges.statut ?? "en_main";
    reception.id_cible = surcharges.id_cible ?? null;

    return await reception.save();
}

export async function creerReponse(
    idParticipant: number,
    idQuestion: number,
    surcharges: Partial<ReponseParticipant> = {}
): Promise<ReponseParticipant> {
    const reponse = new ReponseParticipant();
    reponse.id_participant = idParticipant;
    reponse.id_question = idQuestion;
    reponse.reponse_choisie = surcharges.reponse_choisie ?? 1;
    reponse.temps_reponse_ms = surcharges.temps_reponse_ms ?? 1000;
    reponse.points = surcharges.points ?? 100;

    return await reponse.save();
}

// Raccourci le plus courant : une organisation, son animateur, et rien d'autre.
export async function creerContexteMinimal(): Promise<{
    organisation: Organisation;
    animateur: Utilisateur;
}> {
    const organisation = await creerOrganisation();
    const animateur = await creerUtilisateur(organisation.id);

    return { organisation, animateur };
}
