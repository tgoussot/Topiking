import express from "express";
import sharp from "sharp";
import {Media} from "../entities/Media";
import {RequeteAuthentifiee} from "../middlewares/VerifAuth";
import {genererCle, supprimer, televerser, urlPublique} from "../services/StockageService";
import {DOSSIERS_MEDIAS, LARGEUR_MAXIMUM, HAUTEUR_MAXIMUM} from "../config/stockage.config";

// Utils
function presenterMedia(media: Media) {
    return {
        id: media.id,
        url: urlPublique(media.cle),
        mimetype: media.mimetype,
        nom_original: media.nom_original,
        taille: media.taille,
        id_utilisateur: media.id_utilisateur,
    };
}

async function trouverMedia(idMedia: number, res: express.Response): Promise<Media | null> {
    const media = await Media.findOneBy({id: idMedia});

    if (!media) {
        res.status(404).json({erreur: "Média introuvable"});
        return null;
    }

    return media;
}

export async function listerMedias(req: express.Request, res: express.Response) {
    const medias = await Media.find({order: {id: "DESC"}});

    return res.status(200).json(medias.map(presenterMedia));
}

export async function lireMedia(req: express.Request, res: express.Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de média invalide"});
    }

    const media = await trouverMedia(id, res);
    if (!media) {
        return;
    }

    return res.status(200).json(presenterMedia(media));
}

export async function uploadMedia(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;

    if (!req.file) {
        return res.status(400).json({erreur: "Aucun fichier reçu"});
    }

    const dossier = String(req.params.dossier ?? "");

    if (!DOSSIERS_MEDIAS.includes(dossier)) {
        return res.status(400).json({erreur: "Dossier de média inconnu"});
    }

    let image: Buffer;
    try {
        image = await sharp(req.file.buffer)
            .rotate()
            .resize({width: LARGEUR_MAXIMUM, height: HAUTEUR_MAXIMUM, fit: "inside", withoutEnlargement: true})
            .webp()
            .toBuffer();
    } catch {
        return res.status(400).json({erreur: "Le fichier envoyé n'est pas une image valide"});
    }

    const cle = genererCle(dossier);

    await televerser(image, cle, "image/webp");

    const media = Media.create({
        cle: cle,
        mimetype: "image/webp",
        nom_original: req.file.originalname,
        taille: image.length,
        id_utilisateur: req.utilisateur.id,
    });

    try {
        await media.save();
    } catch (erreur) {
        await supprimer(cle);
        throw erreur;
    }

    return res.status(201).json(presenterMedia(media));
}

export async function supprimerMedia(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de média invalide"});
    }

    const media = await trouverMedia(id, res);
    if (!media) {
        return;
    }

    if (media.id_utilisateur !== req.utilisateur.id) {
        return res.status(403).json({erreur: "Seul l'auteur du média peut le supprimer"});
    }

    const cle = media.cle;

    await media.remove();
    await supprimer(cle);

    return res.status(204).send();
}
