import express from "express";
import {definirIllustration, listerDeck} from "../controllers/CartesControleur";
import {verifAuth} from "../middlewares/VerifAuth";
import {validerBody} from "../middlewares/Validation";
import {RattacherMediaDto} from "../dto/RattacherMediaDto";

export const CartesRouteur = express.Router();

CartesRouteur.get("/", listerDeck);
CartesRouteur.put("/:id/illustration", verifAuth, validerBody(RattacherMediaDto), definirIllustration);
