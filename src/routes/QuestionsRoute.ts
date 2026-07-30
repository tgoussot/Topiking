import express from "express";
import {validerBody} from "../middlewares/Validation";
import {verifAuth} from "../middlewares/VerifAuth";
import {ModifierQuestionDto} from "../dto/ModifierQuestionDto";
import {
    lireQuestion,
    modifierQuestion,
    supprimerQuestion,
} from "../controllers/QuestionsControleur";

export const QuestionsRouteur = express.Router();

QuestionsRouteur.get("/:id", verifAuth, lireQuestion);
QuestionsRouteur.patch("/:id", verifAuth, validerBody(ModifierQuestionDto), modifierQuestion);
QuestionsRouteur.delete("/:id", verifAuth, supprimerQuestion);
