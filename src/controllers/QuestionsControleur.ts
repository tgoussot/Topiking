import express from "express";
import {Question} from "../entities/Question";
import {Theme} from "../entities/Theme";
import {SessionQuestion} from "../entities/SessionQuestion";
import {RequeteAuthentifiee} from "../middlewares/VerifAuth";

function presenterQuestion(question: Question) {
    return {
        id: question.id,
        enonce: question.enonce,
        explication: question.explication ?? null,
        proposition_1: question.proposition_1,
        proposition_2: question.proposition_2,
        proposition_3: question.proposition_3,
        proposition_4: question.proposition_4,
        index_bonne_reponse: question.index_bonne_reponse,
        duree_s: question.duree_s,
        id_theme: question.id_theme,
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

async function questionDeLOrganisation(
    idQuestion: number,
    idOrganisation: number,
    res: express.Response
): Promise<Question | null> {
    const question = await Question.findOneBy({id: idQuestion});

    if (!question) {
        res.status(404).json({erreur: "Question introuvable"});
        return null;
    }

    const theme = await Theme.findOneBy({id: question.id_theme});

    if (!theme || theme.id_organisation !== idOrganisation) {
        res.status(403).json({erreur: "Cette question appartient à une autre organisation"});
        return null;
    }

    return question;
}

export async function listerQuestionsDuTheme(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const idTheme = Number(req.params.idTheme);

    if (!Number.isInteger(idTheme)) {
        return res.status(400).json({erreur: "Identifiant de thème invalide"});
    }

    const theme = await themeDeLOrganisation(idTheme, req.utilisateur.id_organisation, res);
    if (!theme) {
        return;
    }

    const questions = await Question.find({
        where: {id_theme: idTheme},
        order: {id: "ASC"},
    });

    return res.status(200).json(questions.map(presenterQuestion));
}

export async function creerQuestion(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const idTheme = Number(req.params.idTheme);

    if (!Number.isInteger(idTheme)) {
        return res.status(400).json({erreur: "Identifiant de thème invalide"});
    }

    const theme = await themeDeLOrganisation(idTheme, req.utilisateur.id_organisation, res);
    if (!theme) {
        return;
    }

    const {
        enonce,
        explication,
        proposition_1,
        proposition_2,
        proposition_3,
        proposition_4,
        index_bonne_reponse,
        duree_s,
    } = req.body;

    const question = Question.create({
        enonce: enonce,
        explication: explication ?? null,
        proposition_1: proposition_1,
        proposition_2: proposition_2,
        proposition_3: proposition_3,
        proposition_4: proposition_4,
        index_bonne_reponse: index_bonne_reponse,
        duree_s: duree_s,
        id_theme: idTheme,
    });

    await question.save();

    return res.status(201).json(presenterQuestion(question));
}

export async function lireQuestion(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de question invalide"});
    }

    const question = await questionDeLOrganisation(id, req.utilisateur.id_organisation, res);
    if (!question) {
        return;
    }

    return res.status(200).json(presenterQuestion(question));
}

export async function modifierQuestion(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de question invalide"});
    }

    const question = await questionDeLOrganisation(id, req.utilisateur.id_organisation, res);
    if (!question) {
        return;
    }

    const {
        enonce,
        explication,
        proposition_1,
        proposition_2,
        proposition_3,
        proposition_4,
        index_bonne_reponse,
        duree_s,
    } = req.body;

    if (enonce !== undefined) {
        question.enonce = enonce;
    }

    if (explication !== undefined) {
        question.explication = explication;
    }

    if (proposition_1 !== undefined) {
        question.proposition_1 = proposition_1;
    }

    if (proposition_2 !== undefined) {
        question.proposition_2 = proposition_2;
    }

    if (proposition_3 !== undefined) {
        question.proposition_3 = proposition_3;
    }

    if (proposition_4 !== undefined) {
        question.proposition_4 = proposition_4;
    }

    if (index_bonne_reponse !== undefined) {
        question.index_bonne_reponse = index_bonne_reponse;
    }

    if (duree_s !== undefined) {
        question.duree_s = duree_s;
    }

    await question.save();

    return res.status(200).json(presenterQuestion(question));
}

export async function supprimerQuestion(baseRequest: express.Request, res: express.Response) {
    const req = baseRequest as RequeteAuthentifiee;
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({erreur: "Identifiant de question invalide"});
    }

    const question = await questionDeLOrganisation(id, req.utilisateur.id_organisation, res);
    if (!question) {
        return;
    }

    const tirages = await SessionQuestion.countBy({id_question: id});

    if (tirages > 0) {
        return res.status(409).json({erreur: "Cette question a déjà été tirée dans une partie"});
    }

    await question.remove();

    return res.status(204).send();
}
