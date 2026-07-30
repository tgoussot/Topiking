import "reflect-metadata";
import express, {json} from "express";
import { AppDataSource } from "./data-source";
import {UtilisateursRouteur} from "./routes/UtilisateursRoute";
import {SessionsRouteur} from "./routes/SessionsRoute";
import {ParticipantsRouteur} from "./routes/ParticipantsRoute";
import {ThemesRouteur} from "./routes/ThemesRoute";
import {QuestionsRouteur} from "./routes/QuestionsRoute";
import {CartesRouteur} from "./routes/CartesRoute";
import cookieParser = require("cookie-parser");



const port = process.env.PORT || 3301;

async function main() {
    await AppDataSource.initialize();

    const app = express();
    app.use(json());
    app.use(cookieParser());

    app.get("/healthcheck", (req, res) => {
        res.send("API fonctionnel");
    });
    app.use("/api/utilisateurs", UtilisateursRouteur);
    app.use("/api/sessions", SessionsRouteur);
    app.use("/api/participants", ParticipantsRouteur);
    app.use("/api/themes", ThemesRouteur);
    app.use("/api/questions", QuestionsRouteur);
    app.use("/api/cartes", CartesRouteur);

    app.use((req, res) => {
        res.status(404).json({ message: "not found" });
    });

    app.listen(port, () => {
        console.log(`🚀 Server started on port ${port}`);
    });
}

main();