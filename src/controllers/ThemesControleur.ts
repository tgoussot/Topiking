import express from "express";
import {Theme} from "../entities/Theme";
import {Question} from "../entities/Question";
import {SessionTheme} from "../entities/SessionTheme";
import {RequeteAuthentifiee} from "../middlewares/VerifAuth";

// Utils
function presenterTheme(theme: Theme) {
    return {
        id: theme.id,
        libelle: theme.libelle,
        description: theme.description ?? null,
        actif: theme.actif,
        id_organisation: theme.id_organisation,
    };
}

async function themeDeLOrganisation(
    idTheme: number,
    idOrganisation: number,
    res: express.Response
): Promise<Theme | null> {
    const theme = await Theme.findOneBy({id: idTheme});

    if (!theme) {
        res.status(404).json({erreur: "Thème introuvable"});
        return null;
    }

    if (theme.id_organisation !== idOrganisation) {
        res.status(403).json({erreur: "Ce thème appartient à une autre organisation"});
        return null;
    }

    return theme;
}

export async function listerThemes(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;

    const themes = await Theme.find({
        where: {id_organisation: req.utilisateur.id_organisation},
        order: {id: "ASC"},
    });

    return res.status(200).json(themes.map(presenterTheme));
}

export async function lireTheme(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de thème invalide"});
    }

    const theme = await themeDeLOrganisation(id, req.utilisateur.id_organisation, res);
    if (!theme) {
        return;
    }

    return res.status(200).json(presenterTheme(theme));
}

export async function creerTheme(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const {libelle, description, actif} = req.body;

    const theme = Theme.create({
        libelle: libelle,
        description: description ?? null,
        actif: actif ?? true,
        id_organisation: req.utilisateur.id_organisation,
    });

    await theme.save();

    return res.status(201).json(presenterTheme(theme));
}

export async function modifierTheme(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de thème invalide"});
    }

    const theme = await themeDeLOrganisation(id, req.utilisateur.id_organisation, res);
    if (!theme) {
        return;
    }

    const {libelle, description, actif} = req.body;

    if (libelle !== undefined) {
        theme.libelle = libelle;
    }

    if (description !== undefined) {
        theme.description = description;
    }

    if (actif !== undefined) {
        theme.actif = actif;
    }

    await theme.save();

    return res.status(200).json(presenterTheme(theme));
}

export async function supprimerTheme(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de thème invalide"});
    }

    const theme = await themeDeLOrganisation(id, req.utilisateur.id_organisation, res);
    if (!theme) {
        return;
    }

    const manches = await SessionTheme.countBy({id_theme: id});

    if (manches > 0) {
        return res.status(409).json({erreur: "Ce thème a déjà été joué, il ne peut plus être supprimé"});
    }

    const questions = await Question.countBy({id_theme: id});

    if (questions > 0) {
        return res.status(409).json({erreur: "Ce thème contient des questions, supprimez-les d'abord"});
    }

    await theme.remove();

    return res.status(204).send();
}
