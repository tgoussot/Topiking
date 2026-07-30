import express from "express";
import {listerDeck} from "../controllers/CartesControleur";

export const CartesRouteur = express.Router();

CartesRouteur.get("/", listerDeck);
