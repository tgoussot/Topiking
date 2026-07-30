import express from "express";
import {validerBody} from "../middlewares/Validation";
import {RejoindreSessionDto} from "../dto/RejoindreSessionDto";
import {RepondreDto} from "../dto/RepondreDto";
import {JouerCarteDto} from "../dto/JouerCarteDto";
import {
    lireParticipant,
    quitterSession,
    rejoindreSession,
} from "../controllers/ParticipantsControleur";
import {
    listerMesReponses,
    questionCouranteDuJoueur,
    repondre,
} from "../controllers/QuestionsJeuControleur";
import {
    jouerUneCarte,
    listerCartesEnMain,
    listerCiblesPossibles,
} from "../controllers/CartesControleur";
import {repondreDepartage} from "../controllers/MortSubiteControleur";

export const ParticipantsRouteur = express.Router();

ParticipantsRouteur.post("/", validerBody(RejoindreSessionDto), rejoindreSession);
ParticipantsRouteur.get("/:idParticipant", lireParticipant);
ParticipantsRouteur.delete("/:idParticipant", quitterSession);

ParticipantsRouteur.get("/:idParticipant/question", questionCouranteDuJoueur);
ParticipantsRouteur.get("/:idParticipant/reponses", listerMesReponses);
ParticipantsRouteur.post("/:idParticipant/reponses", validerBody(RepondreDto), repondre);

ParticipantsRouteur.get("/:idParticipant/cartes", listerCartesEnMain);
ParticipantsRouteur.post("/:idParticipant/cartes", validerBody(JouerCarteDto), jouerUneCarte);
ParticipantsRouteur.get("/:idParticipant/cibles", listerCiblesPossibles);

ParticipantsRouteur.post("/:idParticipant/mort-subite", validerBody(RepondreDto), repondreDepartage);
