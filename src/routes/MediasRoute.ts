import express from "express";
import multer from "multer";
import {verifAuth} from "../middlewares/VerifAuth";
import {TAILLE_MAXIMUM_OCTETS} from "../config/stockage.config";
import {
    lireMedia,
    listerMedias,
    supprimerMedia,
    uploadMedia,
} from "../controllers/MediasControleur";

export const MediasRouteur = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: TAILLE_MAXIMUM_OCTETS, files: 1},
});

MediasRouteur.get("/", verifAuth, listerMedias);
MediasRouteur.get("/:id", verifAuth, lireMedia);
MediasRouteur.post("/:dossier", verifAuth, upload.single("image"), uploadMedia);
MediasRouteur.delete("/:id", verifAuth, supprimerMedia);
