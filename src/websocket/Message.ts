export type TypeMessage =
    | "participant.rejoint"
    | "participant.parti"
    | "session.demarree"
    | "question.ouverte"
    | "question.cloturee"
    | "question.mon_resultat"
    | "manche.cloturee"
    | "cartes.fenetre_ouverte"
    | "carte.jouee"
    | "session.terminee";

// Cle = chaine, valeur = inconnu
export type DonneesMessage = Record<string, unknown>;

export type Message = {
    type: TypeMessage;
    donnees: DonneesMessage;
};

export function construireMessage(type: TypeMessage, donnees: DonneesMessage): Message {
    return {type, donnees};
}

export function encoderMessage(type: TypeMessage, donnees: DonneesMessage): string {
    return JSON.stringify(construireMessage(type, donnees));
}
