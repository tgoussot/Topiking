import { Participant } from "../../entities/Participant";
import { Session } from "../../entities/Session";
import { trouverParCode } from "./SessionService";
import { PSEUDO_LONGUEUR_MINIMUM, PSEUDO_LONGUEUR_MAXIMUM } from "../../config/config";


export function nettoyerPseudo(pseudo: string): string {
    let propre = pseudo.trim();
    while (propre.indexOf("  ") !== -1) {
        propre = propre.replace("  ", " ");
    }

    return propre;
}

export function verifierPseudo(pseudo: string): string {
    const propre = nettoyerPseudo(pseudo);

    if (propre.length < PSEUDO_LONGUEUR_MINIMUM) {
        throw new Error(`Le pseudo doit faire au moins ${PSEUDO_LONGUEUR_MINIMUM} caractères`);
    }

    if (propre.length > PSEUDO_LONGUEUR_MAXIMUM) {
        throw new Error(`Le pseudo ne doit pas dépasser ${PSEUDO_LONGUEUR_MAXIMUM} caractères`);
    }

    return propre;
}

export async function pseudoDejaPris(idSession: number, pseudo: string): Promise<boolean> {
    const participants = await Participant.findBy({ id_session: idSession });

    const recherche = pseudo.toLowerCase();

    for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];

        if (participant === undefined) {
            continue;
        }

        if (participant.pseudo.toLowerCase() === recherche) {
            return true;
        }
    }

    return false;
}

export async function rejoindre(codeAcces: number, pseudo: string): Promise<Participant> {
    const propre = verifierPseudo(pseudo);

    const session = await trouverParCode(codeAcces);

    if (session === null) {
        throw new Error("Aucune partie ne correspond à ce code");
    }

    // On ne rejoint pas une partie déjà lancée
    if (session.statut !== "en_attente") {
        throw new Error("La partie a déjà commencé");
    }

    const dejaPris = await pseudoDejaPris(session.id, propre);

    if (dejaPris === true) {
        throw new Error(`Le pseudo "${propre}" est déjà pris dans cette partie`);
    }

    const participant = new Participant();
    participant.pseudo = propre;
    participant.score_total = 0;
    participant.id_session = session.id;

    await participant.save();

    return participant;
}


export async function lister(idSession: number): Promise<Participant[]> {
    return await Participant.find({
        where: { id_session: idSession },
        order: { id: "ASC" },
    });
}


export async function compter(idSession: number): Promise<number> {
    return await Participant.countBy({ id_session: idSession });
}


export async function quitter(idParticipant: number): Promise<void> {
    const participant = await Participant.findOneBy({ id: idParticipant });

    if (participant === null) {
        throw new Error("Participant introuvable");
    }

    const session = await Session.findOneBy({ id: participant.id_session });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    // Une fois la partie lancée, on garde le joueur
    if (session.statut !== "en_attente") {
        throw new Error("Impossible de quitter une partie déjà commencée");
    }

    await participant.remove();
}


export async function ajouterPoints(idParticipant: number, points: number): Promise<Participant> {
    const participant = await Participant.findOneBy({ id: idParticipant });

    if (participant === null) {
        throw new Error("Participant introuvable");
    }

    // Aucun point n'est jamais retiré
    if (points < 0) {
        throw new Error("On ne retire jamais de points à un participant");
    }

    participant.score_total = participant.score_total + points;

    await participant.save();

    return participant;
}
