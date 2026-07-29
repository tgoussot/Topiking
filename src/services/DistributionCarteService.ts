import { Carte } from "../entities/Carte";
import { ReceptionCarte } from "../entities/ReceptionCarte";
import { classementDeLaManche, premier, dernier, ScoreParticipant } from "./ClassementService";

export type DistributionManche = {
    numeroManche: number;
    classement: ScoreParticipant[];
    malusAuPremier: ReceptionCarte | null;
    bonusAuDernier: ReceptionCarte | null;
};


export async function tirerMalus(): Promise<Carte | null> {
    const deck = await Carte.find({ where: { type: "malus" }, order: { id: "ASC" } });

    if (deck.length === 0) {
        return null;
    }

    // 'aléatoire'
    const index = Math.floor(Math.random() * deck.length);

    const carte = deck[index];

    if (carte === undefined) {
        return null;
    }

    return carte;
}

export async function choisirBonus(numeroManche: number): Promise<Carte | null> {
    const deck = await Carte.find({ where: { type: "bonus" }, order: { id: "ASC" } });

    if (deck.length === 0) {
        return null;
    }

    const index = (numeroManche - 1) % deck.length;

    const carte = deck[index];

    if (carte === undefined) {
        return null;
    }

    return carte;
}

export async function attribuerCarte(idParticipant: number, idCarte: number, numeroManche: number): Promise<ReceptionCarte> {
    const reception = new ReceptionCarte();
    reception.id_participant = idParticipant;
    reception.id_carte = idCarte;
    reception.numero_manche = numeroManche;
    reception.manche_application = null;
    reception.statut = "en_main";
    reception.id_cible = null;

    await reception.save();

    return reception;
}


export async function distribuerFinManche(idSession: number, numeroManche: number): Promise<DistributionManche> {
    const classement = await classementDeLaManche(idSession, numeroManche);

    const resultat: DistributionManche = {
        numeroManche: numeroManche,
        classement: classement,
        malusAuPremier: null,
        bonusAuDernier: null,
    };

    // Avec un seul joueur, "premier" et "dernier" désignent la même personne
    if (classement.length < 2) {
        return resultat;
    }

    const gagnant = premier(classement);
    const perdant = dernier(classement);

    if (gagnant === null || perdant === null) {
        return resultat;
    }

    const malus = await tirerMalus();

    if (malus !== null) {
        resultat.malusAuPremier = await attribuerCarte(gagnant.idParticipant, malus.id, numeroManche);
    }

    const bonus = await choisirBonus(numeroManche);

    if (bonus !== null) {
        resultat.bonusAuDernier = await attribuerCarte(perdant.idParticipant, bonus.id, numeroManche);
    }

    return resultat;
}


// Cartes qu'un joueur a encore en main.
export async function cartesEnMain(idParticipant: number): Promise<ReceptionCarte[]> {
    // carte : true | charge l'objet carte
    return await ReceptionCarte.find({
        where: { id_participant: idParticipant, statut: "en_main" },
        relations: { carte: true },
        order: { numero_manche: "ASC" },
    });
}
