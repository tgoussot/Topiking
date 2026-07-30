import { Participant } from "../../entities/Participant";
import { ReponseParticipant } from "../../entities/ReponseParticipant";
import { questionsDeLaManche } from "./SessionService";

export type ScoreParticipant = {
    idParticipant: number;
    pseudo: string;
    points: number;
    tempsCumuleMs: number;
};


export function passeDevant(participantA: ScoreParticipant, participantB: ScoreParticipant): boolean {
    if (participantA.points > participantB.points) {
        return true;
    }

    if (participantA.points < participantB.points) {
        return false;
    }

    // Egalite 1 : le plus rapide passe devant.
    if (participantA.tempsCumuleMs < participantB.tempsCumuleMs) {
        return true;
    }

    if (participantA.tempsCumuleMs > participantB.tempsCumuleMs) {
        return false;
    }

    // Egalite 2 : on tranche grâce à l'identifiant
    return participantA.idParticipant < participantB.idParticipant;
}


// Trie sélection
export function classer(participants: ScoreParticipant[]): ScoreParticipant[] {
    const resultat = [...participants];

    for (let i = 0; i < resultat.length; i++) {
        let indexMeilleur = i;

        for (let j = i + 1; j < resultat.length; j++) {
            const candidat = resultat[j];
            const meilleurActuel = resultat[indexMeilleur];

            if (candidat === undefined || meilleurActuel === undefined) {
                continue;
            }

            if (passeDevant(candidat, meilleurActuel) === true) {
                indexMeilleur = j;
            }
        }

        // On échange le meilleur trouvé avec la position courante.
        const temporaire = resultat[i];
        const meilleur = resultat[indexMeilleur];

        if (temporaire === undefined || meilleur === undefined) {
            continue;
        }

        resultat[i] = meilleur;
        resultat[indexMeilleur] = temporaire;
    }

    return resultat;
}

export function premier(classement: ScoreParticipant[]): ScoreParticipant | null {
    const participant = classement[0];

    if (participant === undefined) {
        return null;
    }

    return participant;
}


export function dernier(classement: ScoreParticipant[]): ScoreParticipant | null {
    const participant = classement[classement.length - 1];

    if (participant === undefined) {
        return null;
    }

    return participant;
}

export function exAequoEnTete(classement: ScoreParticipant[]): ScoreParticipant[] {
    const resultat: ScoreParticipant[] = [];

    const tete = premier(classement);

    if (tete === null) {
        return resultat;
    }

    for (let i = 0; i < classement.length; i++) {
        const participant = classement[i];

        if (participant === undefined) {
            continue;
        }

        if (participant.points === tete.points) {
            resultat.push(participant);
        }
    }

    return resultat;
}


// Classement sur le score cumulé depuis le début de la partie.
export async function classementGeneral(idSession: number): Promise<ScoreParticipant[]> {
    const participants = await Participant.findBy({ id_session: idSession });

    const scores: ScoreParticipant[] = [];

    for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];

        if (participant === undefined) {
            continue;
        }

        scores.push({
            idParticipant: participant.id,
            pseudo: participant.pseudo,
            points: participant.score_total,
            // Le classement général ne départage pas au temps
            tempsCumuleMs: 0,
        });
    }

    return classer(scores);
}


// Classement sur les seules réponses données pendant une manche précise.
export async function classementDeLaManche(idSession: number, numeroManche: number): Promise<ScoreParticipant[]> {
    const tirage = await questionsDeLaManche(idSession, numeroManche);

    const participants = await Participant.findBy({ id_session: idSession });

    const scores: ScoreParticipant[] = [];

    for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];

        if (participant === undefined) {
            continue;
        }

        let points = 0;
        let tempsCumuleMs = 0;

        for (let j = 0; j < tirage.length; j++) {
            const ligne = tirage[j];

            if (ligne === undefined) {
                continue;
            }

            const reponse = await ReponseParticipant.findOneBy({
                id_participant: participant.id,
                id_question: ligne.id_question,
            });

            if (reponse === null) {
                continue;
            }

            points = points + reponse.points;
            tempsCumuleMs = tempsCumuleMs + reponse.temps_reponse_ms;
        }

        scores.push({
            idParticipant: participant.id,
            pseudo: participant.pseudo,
            points: points,
            tempsCumuleMs: tempsCumuleMs,
        });
    }

    return classer(scores);
}
