import express from "express";
import {validerBody} from "../middlewares/Validation";
import {verifAuth} from "../middlewares/VerifAuth";
import {CreerThemeDto} from "../dto/CreerThemeDto";
import {ModifierThemeDto} from "../dto/ModifierThemeDto";
import {CreerQuestionDto} from "../dto/CreerQuestionDto";
import {
    creerTheme,
    lireTheme,
    listerThemes,
    modifierTheme,
    supprimerTheme,
} from "../controllers/ThemesControleur";
import {creerQuestion, listerQuestionsDuTheme} from "../controllers/QuestionsControleur";

export const ThemesRouteur = express.Router();

ThemesRouteur.get("/", verifAuth, listerThemes);
ThemesRouteur.post("/", verifAuth, validerBody(CreerThemeDto), creerTheme);
ThemesRouteur.get("/:id", verifAuth, lireTheme);
ThemesRouteur.patch("/:id", verifAuth, validerBody(ModifierThemeDto), modifierTheme);
ThemesRouteur.delete("/:id", verifAuth, supprimerTheme);

ThemesRouteur.get("/:idTheme/questions", verifAuth, listerQuestionsDuTheme);
ThemesRouteur.post("/:idTheme/questions", verifAuth, validerBody(CreerQuestionDto), creerQuestion);
