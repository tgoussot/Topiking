import { ReceptionCarte } from "../../entities/ReceptionCarte";
import { Question } from "../../entities/Question";

export type EffetsJoueur = {
    // carte Élan.
    bonusPoints: number;

    // carte Brouillage
    propositionsMelangees: boolean;

    // carte Flou.
    propositionFloutee: number | null;
    floutageDureeMs: number;

    // carte Indice.
    propositionEliminee: number | null;

    // carte Anticipation.
    revelationAnticipeeMs: number;

    melangeApresMs: number;
    dureeDeltaMs: number;
};


// Aucune carte
export function effetsNeutres(): EffetsJoueur {
    return {
        dureeDeltaMs: 0,
        bonusPoints: 0,
        propositionsMelangees: false,
        melangeApresMs: 0,
        propositionFloutee: null,
        floutageDureeMs: 0,
        propositionEliminee: null,
        revelationAnticipeeMs: 0,
    };
}


export async function cartesActives(idParticipant: number, numeroManche: number): Promise<ReceptionCarte[]> {
    const actives: ReceptionCarte[] = [];

    // Bonus
    const bonus = await ReceptionCarte.find({
        where: {
            id_participant: idParticipant,
            manche_application: numeroManche,
            statut: "jouee",
        },
        relations: { carte: true },
    });

    for (let i = 0; i < bonus.length; i++) {
        const reception = bonus[i];

        if (reception === undefined) {
            continue;
        }

        if (reception.carte.type === "bonus") {
            actives.push(reception);
        }
    }

    // Malus
    const malus = await ReceptionCarte.find({
        where: {
            id_cible: idParticipant,
            manche_application: numeroManche,
            statut: "jouee",
        },
        relations: { carte: true },
    });

    for (let i = 0; i < malus.length; i++) {
        const reception = malus[i];

        if (reception === undefined) {
            continue;
        }

        if (reception.carte.type === "malus") {
            actives.push(reception);
        }
    }

    return actives;
}


// Nombre stable tiré de deux identifiants.
export function grainePour(idParticipant: number, idQuestion: number): number {
    return (idParticipant * 31 + idQuestion * 17) % 1000;
}


// Choisit une mauvaise proposition à éliminer ou à flouter.
export function choisirMauvaiseProposition(question: Question, graine: number): number {
    const mauvaises: number[] = [];

    for (let index = 1; index <= 4; index++) {
        if (index !== question.index_bonne_reponse) {
            mauvaises.push(index);
        }
    }

    const position = graine % mauvaises.length;

    const choisie = mauvaises[position];

    if (choisie === undefined) {
        return 1;
    }

    return choisie;
}


// Application effet
export async function effetsPourJoueur(idParticipant: number, question: Question, numeroManche: number): Promise<EffetsJoueur> {
    const effets = effetsNeutres();

    const actives = await cartesActives(idParticipant, numeroManche);

    const graine = grainePour(idParticipant, question.id);

    for (let i = 0; i < actives.length; i++) {
        const reception = actives[i];

        if (reception === undefined) {
            continue;
        }

        const carte = reception.carte;

        if (carte.effet === "ajout_temps_s") {
            effets.dureeDeltaMs = effets.dureeDeltaMs + carte.intensite * 1000;
        }

        if (carte.effet === "retrait_temps_s") {
            effets.dureeDeltaMs = effets.dureeDeltaMs - carte.intensite * 1000;
        }

        if (carte.effet === "ajout_points") {
            effets.bonusPoints = effets.bonusPoints + carte.intensite;
        }

        if (carte.effet === "melange_propositions") {
            effets.propositionsMelangees = true;
            effets.melangeApresMs = carte.intensite * 1000;
        }

        if (carte.effet === "floutage_proposition_s") {
            effets.propositionFloutee = choisirMauvaiseProposition(question, graine);
            effets.floutageDureeMs = carte.intensite * 1000;
        }

        if (carte.effet === "elimination_proposition") {
            effets.propositionEliminee = choisirMauvaiseProposition(question, graine);
        }

        if (carte.effet === "revelation_anticipee_s") {
            effets.revelationAnticipeeMs = carte.intensite * 1000;
        }
    }

    return effets;
}


export function appliquerDureeTimer(question: Question, effets: EffetsJoueur): number {
    const base = question.duree_s * 1000;

    const avecCartes = base + effets.dureeDeltaMs;

    if (avecCartes < 1000) {
        return 1000;
    }

    return avecCartes;
}


// Ordre des questions
export function ordreDesPropositions(effets: EffetsJoueur, graine: number): number[] {
    const ordre: number[] = [];

    for (let index = 1; index <= 4; index++) {
        ordre.push(index);
    }

    if (effets.propositionsMelangees === false) {
        return ordre;
    }

    // même graine = même ordre.
    let courante = graine;

    for (let i = ordre.length - 1; i > 0; i--) {
        courante = (courante * 7 + 13) % 1000;

        const j = courante % (i + 1);

        const temporaire = ordre[i];
        const tire = ordre[j];

        if (temporaire === undefined || tire === undefined) {
            continue;
        }

        ordre[i] = tire;
        ordre[j] = temporaire;
    }

    return ordre;
}


// Rassemble tout ce qu'il faut pour envoyer la question à un joueur précis
export async function preparerQuestionPourJoueur(idParticipant: number, question: Question, numeroManche: number): Promise<{ effets: EffetsJoueur; dureeTimerMs: number; ordre: number[] }> {
    const effets = await effetsPourJoueur(idParticipant, question, numeroManche);

    const dureeTimerMs = appliquerDureeTimer(question, effets);

    const graine = grainePour(idParticipant, question.id);

    const ordre = ordreDesPropositions(effets, graine);

    return { effets: effets, dureeTimerMs: dureeTimerMs, ordre: ordre };
}


// Car élan ? (manche actuel)
export async function aBonusElan(idParticipant: number, numeroManche: number): Promise<boolean> {
    const actives = await cartesActives(idParticipant, numeroManche);

    for (let i = 0; i < actives.length; i++) {
        const reception = actives[i];

        if (reception === undefined) {
            continue;
        }

        if (reception.carte.effet === "ajout_points") {
            return true;
        }
    }

    return false;
}
