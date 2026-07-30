import express from "express";
import {validerBody} from "../middlewares/Validation";
import {RegisterDto} from "../dto/RegisterDto";
import {creerToken, creerUtilisateur, moi, supprimerToken} from "../controllers/UtilisateursControleur";
import {LoginDto} from "../dto/LoginDto";
import {verifAuth} from "../middlewares/VerifAuth";

export const UtilisateursRouteur = express.Router()

UtilisateursRouteur.post("/", validerBody(RegisterDto), creerUtilisateur); // POST /api/utilisateurs
UtilisateursRouteur.get("/moi", verifAuth, moi);                           // GET /api/utilisateurs
UtilisateursRouteur.delete("/tokens", supprimerToken);                     // DELETE /api/utilisateurs
UtilisateursRouteur.post("/tokens", validerBody(LoginDto), creerToken);    // POST /api/utilisateurs/tokens

