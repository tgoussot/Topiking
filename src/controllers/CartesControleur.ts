 import express from "express";
import {Carte} from "../entities/Carte";
import {Participant} from "../entities/Participant";
import {ReceptionCarte} from "../entities/ReceptionCarte";
import {Session} from "../entities/Session";
import {SEUIL_CIBLAGE_MULTIPLE} from "../config/config";
import {cartesEnMain} from "../services/Jeux/DistributionCarteService";
import {ciblesEligibles, ciblesImposees, jouerCarte} from "../services/Jeux/CiblageService";
import {classementGeneral} from "../services/Jeux/ClassementService";
import {urlPublique} from "../services/StockageService";
import {Media} from "../entities/Media";
 import {versSession} from "../websocket/Registre";

function messageDe(erreur: unknown): string {
    if (erreur instanceof Error) {
        return erreur.message;
    }

    return "Erreur inattendue";
}

function presenterCarte(carte: Carte) {
    return {
        id: carte.id,
        libelle: carte.libelle,
        type: carte.type,
        effet: carte.effet,
        intensite: carte.intensite,
        illustration: carte.illustration ? urlPublique(carte.illustration.cle) : null,
    };
}

function presenterCarteEnMain(reception: ReceptionCarte) {
    return {
        id_reception: reception.id,
        id_carte: reception.id_carte,
        libelle: reception.carte.libelle,
        type: reception.carte.type,
        effet: reception.carte.effet,
        intensite: reception.carte.intensite,
        numero_manche: reception.numero_manche,
        statut: reception.statut,
    };
}

function presenterCarteJouee(reception: ReceptionCarte) {
    return {
        id_reception: reception.id,
        id_carte: reception.id_carte,
        statut: reception.statut,
        manche_application: reception.manche_application,
        id_cible: reception.id_cible,
    };
}

export async function listerDeck(req: express.Request, res: express.Response) {
    const cartes = await Carte.find({order: {id: "ASC"}, relations: {illustration: true}});

    return res.status(200).json(cartes.map(presenterCarte));
}

export async function definirIllustration(req: express.Request, res: express.Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de carte invalide"});
    }

    const carte = await Carte.findOneBy({id: id});

    if (!carte) {
        return res.status(404).json({erreur: "Carte introuvable"});
    }

    const {id_media} = req.body;

    if (id_media !== null) {
        const media = await Media.findOneBy({id: id_media});

        if (!media) {
            return res.status(404).json({erreur: "Média introuvable"});
        }
    }

    carte.id_media = id_media;
    await carte.save();

    const rechargee = await Carte.findOne({where: {id: id}, relations: {illustration: true}});

    return res.status(200).json(presenterCarte(rechargee!));
}

export async function listerCartesEnMain(req: express.Request, res: express.Response) {
    const idParticipant = Number(req.params.idParticipant);

    if (!Number.isInteger(idParticipant)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const participant = await Participant.findOneBy({id: idParticipant});

    if (!participant) {
        return res.status(404).json({erreur: "Participant introuvable"});
    }

    const cartes = await cartesEnMain(idParticipant);

    return res.status(200).json(cartes.map(presenterCarteEnMain));
}

export async function listerCiblesPossibles(req: express.Request, res: express.Response) {
    const idParticipant = Number(req.params.idParticipant);

    if (!Number.isInteger(idParticipant)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const participant = await Participant.findOneBy({id: idParticipant});

    if (!participant) {
        return res.status(404).json({erreur: "Participant introuvable"});
    }

    const session = await Session.findOneBy({id: participant.id_session});

    if (!session) {
        return res.status(404).json({erreur: "Session introuvable"});
    }

    if (session.numero_manche_courante === null) {
        return res.status(409).json({erreur: "La partie n'a pas démarré"});
    }

    const mancheApplication = session.numero_manche_courante + 1;

    const classement = await classementGeneral(session.id);

    const imposees = classement.length > SEUIL_CIBLAGE_MULTIPLE;

    const cibles = imposees
        ? await ciblesImposees(session.id, idParticipant, mancheApplication, classement)
        : await ciblesEligibles(session.id, idParticipant, mancheApplication, classement);

    return res.status(200).json({
        imposees: imposees,
        cibles: cibles.map((cible) => ({
            id_participant: cible.idParticipant,
            pseudo: cible.pseudo,
            points: cible.points,
        })),
    });
}

export async function jouerUneCarte(req: express.Request, res: express.Response) {
    const idParticipant = Number(req.params.idParticipant);

    if (!Number.isInteger(idParticipant)) {
        return res.status(400).json({erreur: "Identifiant de participant invalide"});
    }

    const {id_reception, id_cible} = req.body;


    const participant = await Participant.findOneBy({id: idParticipant});
    if(!participant){
        return res.status(404).json({erreur: "Participant introuvable"});
    }

    try {
        const lignes = await jouerCarte(idParticipant, id_reception, id_cible ?? null);
        versSession(participant.id_session, "carte.jouee", { cartes: lignes.map(presenterCarteJouee) })
        return res.status(200).json(lignes.map(presenterCarteJouee));
    } catch (erreur) {
        const message = messageDe(erreur);

        if (message === "Cette carte ne vous appartient pas") {
            return res.status(403).json({erreur: message});
        }

        if (
            message === "Carte introuvable" ||
            message === "Participant introuvable" ||
            message === "Session introuvable"
        ) {
            return res.status(404).json({erreur: message});
        }

        return res.status(409).json({erreur: message});
    }
}
