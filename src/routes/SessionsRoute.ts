import express from "express";
import {validerBody} from "../middlewares/Validation";
import {verifAuth} from "../middlewares/VerifAuth";
import {CreerSessionDto} from "../dto/CreerSessionDto";
import {OuvrirQuestionDto} from "../dto/OuvrirQuestionDto";
import {
    annulerSession,
    creerSession,
    demarrerSession,
    fermerFenetre,
    lireSession,
    lireSessionParCode,
    listerManches,
    listerQuestionsDeLaManche,
    ouvrirFenetre,
    terminerSession,
} from "../controllers/SessionsControleur";
import {compterParticipants, listerParticipants} from "../controllers/ParticipantsControleur";
import {classementDeLaPartie, classementParManche} from "../controllers/ClassementsControleur";
import {
    cloturerMancheCourante,
    cloturerQuestionCourante,
    mancheSuivante,
    ouvrirQuestionCourante,
} from "../controllers/QuestionsJeuControleur";
import {
    cloturerDepartage,
    lancerMortSubite,
    verifierEgalite,
} from "../controllers/MortSubiteControleur";

export const SessionsRouteur = express.Router();

SessionsRouteur.get("/code/:code", lireSessionParCode);

SessionsRouteur.get("/:id/participants", listerParticipants);
SessionsRouteur.get("/:id/participants/nombre", compterParticipants);
SessionsRouteur.get("/:id/classement", classementDeLaPartie);
SessionsRouteur.get("/:id/manches/:numero/classement", classementParManche);

SessionsRouteur.post("/", verifAuth, validerBody(CreerSessionDto), creerSession);
SessionsRouteur.get("/:id", verifAuth, lireSession);
SessionsRouteur.get("/:id/manches", verifAuth, listerManches);
SessionsRouteur.get("/:id/manches/:numero/questions", verifAuth, listerQuestionsDeLaManche);
SessionsRouteur.post("/:id/demarrage", verifAuth, demarrerSession);
SessionsRouteur.post("/:id/fenetre-cartes", verifAuth, ouvrirFenetre);
SessionsRouteur.delete("/:id/fenetre-cartes", verifAuth, fermerFenetre);
SessionsRouteur.post("/:id/fin", verifAuth, terminerSession);
SessionsRouteur.delete("/:id", verifAuth, annulerSession);

SessionsRouteur.post("/:id/questions", verifAuth, validerBody(OuvrirQuestionDto), ouvrirQuestionCourante);
SessionsRouteur.delete("/:id/questions/courante", verifAuth, cloturerQuestionCourante);
SessionsRouteur.post("/:id/manches/courante/cloture", verifAuth, cloturerMancheCourante);
SessionsRouteur.post("/:id/manches/suivante", verifAuth, mancheSuivante);

SessionsRouteur.get("/:id/mort-subite/egalite", verifAuth, verifierEgalite);
SessionsRouteur.post("/:id/mort-subite", verifAuth, lancerMortSubite);
SessionsRouteur.delete("/:id/mort-subite", verifAuth, cloturerDepartage);
