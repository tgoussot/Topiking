import { Participant } from "../../entities/Participant";
import { ReceptionCarte } from "../../entities/ReceptionCarte";
import { Session } from "../../entities/Session";
import { classementGeneral, dernier, ScoreParticipant } from "./ClassementService";
import { fenetreCartesOuverte } from "./SessionService";
import { SEUIL_CIBLAGE_MULTIPLE, CIBLES_MULTIPLES } from "../../config/config";


export async function dejaToucheDansLaManche(idCible: number, numeroManche: number): Promise<boolean> {
    const attaques = await ReceptionCarte.findBy({
        id_cible: idCible,
        manche_application: numeroManche,
        statut: "jouee",
    });

    return attaques.length > 0;
}


// Parcourt le classement dans l'ordre et retient les joueurs visables
async function filtrerCibles(classement: ScoreParticipant[], idAttaquant: number, mancheApplication: number, limite: number | null): Promise<ScoreParticipant[]> {
    const dernierDuClassement = dernier(classement);

    const cibles: ScoreParticipant[] = [];

    for (let i = 0; i < classement.length; i++) {
        if (limite !== null && cibles.length >= limite) {
            break;
        }

        const candidat = classement[i];

        if (candidat === undefined) {
            continue;
        }

        if (candidat.idParticipant === idAttaquant) {
            continue;
        }

        if (dernierDuClassement !== null && candidat.idParticipant === dernierDuClassement.idParticipant) {
            continue;
        }

        // Un joueur déjà touché cette manche ne peut pas l'être une seconde fois.
        const dejaTouche = await dejaToucheDansLaManche(candidat.idParticipant, mancheApplication);

        if (dejaTouche === true) {
            continue;
        }

        cibles.push(candidat);
    }

    return cibles;
}

// Liste les joueurs qu'un attaquant a le droit de viser avec un malus.
export async function ciblesEligibles(idSession: number, idAttaquant: number, mancheApplication: number, classementConnu: ScoreParticipant[] | null = null): Promise<ScoreParticipant[]> {
    const classement = classementConnu ?? (await classementGeneral(idSession));

    if (classement.length > SEUIL_CIBLAGE_MULTIPLE) {
        return await filtrerCibles(classement, idAttaquant, mancheApplication, CIBLES_MULTIPLES);
    }

    return await filtrerCibles(classement, idAttaquant, mancheApplication, null);
}

// Cibles imposées (+ participant que seuil):
export async function ciblesImposees(idSession: number, idAttaquant: number, mancheApplication: number, classementConnu: ScoreParticipant[] | null = null): Promise<ScoreParticipant[]> {
    const classement = classementConnu ?? (await classementGeneral(idSession));

    return await filtrerCibles(classement, idAttaquant, mancheApplication, CIBLES_MULTIPLES);
}

// Vérifie qu'un joueur peut bien jouer cette carte maintenant.
export async function verifierCarteJouable(idParticipant: number, idReception: number): Promise<ReceptionCarte> {
    const reception = await ReceptionCarte.findOne({
        where: { id: idReception },
        relations: { carte: true },
    });

    if (reception === null) {
        throw new Error("Carte introuvable");
    }

    if (reception.id_participant !== idParticipant) {
        throw new Error("Cette carte ne vous appartient pas");
    }

    if (reception.statut !== "en_main") {
        throw new Error(`Cette carte est déjà ${reception.statut}`);
    }

    return reception;
}

export async function jouerCarte(idParticipant: number, idReception: number, idCible: number | null): Promise<ReceptionCarte[]> {
    const reception = await verifierCarteJouable(idParticipant, idReception);

    const participant = await Participant.findOneBy({ id: idParticipant });

    if (participant === null) {
        throw new Error("Participant introuvable");
    }

    const session = await Session.findOneBy({ id: participant.id_session });

    if (session === null) {
        throw new Error("Session introuvable");
    }

    if (session.numero_manche_courante === null) {
        throw new Error("La partie n'a pas démarré");
    }

    // Les cartes ne se jouent que dans la fenêtre entre deux manches,
    if (fenetreCartesOuverte(session) === false) {
        throw new Error("La fenêtre pour jouer une carte est fermée");
    }

    // Une carte jouée entre la manche N et N+1 agit à la manche N+1.
    const mancheApplication = session.numero_manche_courante + 1;

    if (reception.carte.type === "bonus") {
        return await jouerBonus(reception, idCible, mancheApplication);
    }

    return await jouerMalus(reception, participant.id_session, idParticipant, idCible, mancheApplication);
}

// Un bonus s'applique toujours à celui qui le joue.
export async function jouerBonus(reception: ReceptionCarte, idCible: number | null, mancheApplication: number): Promise<ReceptionCarte[]> {
    if (idCible !== null) {
        throw new Error("Un bonus s'applique à vous-même, il ne se lance pas sur un adversaire");
    }

    reception.statut = "jouee";
    reception.manche_application = mancheApplication;
    reception.id_cible = null;

    await reception.save();

    return [reception];
}

export async function jouerMalus(reception: ReceptionCarte, idSession: number, idAttaquant: number, idCible: number | null, mancheApplication: number): Promise<ReceptionCarte[]> {
    const classement = await classementGeneral(idSession);

    // + seuil attaquant choisis pas
    if (classement.length > SEUIL_CIBLAGE_MULTIPLE) {
        const imposees = await ciblesImposees(idSession, idAttaquant, mancheApplication, classement);

        if (imposees.length === 0) {
            throw new Error("Aucune cible disponible pour ce malus");
        }

        return await appliquerMalusAPlusieurs(reception, imposees, mancheApplication);
    }

    if (idCible === null) {
        throw new Error("Un malus doit viser un adversaire");
    }

    const eligibles = await ciblesEligibles(idSession, idAttaquant, mancheApplication, classement);

    let autorisee = false;

    for (let i = 0; i < eligibles.length; i++) {
        const candidat = eligibles[i];

        if (candidat === undefined) {
            continue;
        }

        if (candidat.idParticipant === idCible) {
            autorisee = true;
        }
    }

    if (autorisee === false) {
        throw new Error("Cette cible n'est pas autorisée");
    }

    reception.statut = "jouee";
    reception.manche_application = mancheApplication;
    reception.id_cible = idCible;

    await reception.save();

    return [reception];
}

export async function appliquerMalusAPlusieurs(reception: ReceptionCarte, cibles: ScoreParticipant[], mancheApplication: number): Promise<ReceptionCarte[]> {
    const lignes: ReceptionCarte[] = [];

    for (let i = 0; i < cibles.length; i++) {
        const cible = cibles[i];

        if (cible === undefined) {
            continue;
        }

        if (i === 0) {
            reception.statut = "jouee";
            reception.manche_application = mancheApplication;
            reception.id_cible = cible.idParticipant;

            await reception.save();

            lignes.push(reception);
            continue;
        }

        const supplementaire = new ReceptionCarte();
        supplementaire.id_participant = reception.id_participant;
        supplementaire.id_carte = reception.id_carte;
        supplementaire.numero_manche = reception.numero_manche;
        supplementaire.manche_application = mancheApplication;
        supplementaire.statut = "jouee";
        supplementaire.id_cible = cible.idParticipant;

        await supplementaire.save();

        lignes.push(supplementaire);
    }

    return lignes;
}
