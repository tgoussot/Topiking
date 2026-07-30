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
import {verifAuthParticipant} from "../middlewares/VerifParticipant";

export const ParticipantsRouteur = express.Router();

ParticipantsRouteur.post("/", validerBody(RejoindreSessionDto), rejoindreSession);
ParticipantsRouteur.get("/:idParticipant", verifAuthParticipant, lireParticipant);
ParticipantsRouteur.delete("/:idParticipant", verifAuthParticipant, quitterSession);

ParticipantsRouteur.get("/:idParticipant/question",verifAuthParticipant, questionCouranteDuJoueur);
ParticipantsRouteur.get("/:idParticipant/reponses",verifAuthParticipant, listerMesReponses);
ParticipantsRouteur.post("/:idParticipant/reponses",verifAuthParticipant, validerBody(RepondreDto), repondre);

ParticipantsRouteur.get("/:idParticipant/cartes",verifAuthParticipant, listerCartesEnMain);
ParticipantsRouteur.post("/:idParticipant/cartes",verifAuthParticipant, validerBody(JouerCarteDto), jouerUneCarte);
ParticipantsRouteur.get("/:idParticipant/cibles",verifAuthParticipant, listerCiblesPossibles);

ParticipantsRouteur.post("/:idParticipant/mort-subite",verifAuthParticipant, validerBody(RepondreDto), repondreDepartage);
