import "reflect-metadata";
import express, {json} from "express";
import { AppDataSource } from "./data-source";
import {UtilisateursRouteur} from "./routes/UtilisateursRoute";
import {SessionsRouteur} from "./routes/SessionsRoute";
import {ParticipantsRouteur} from "./routes/ParticipantsRoute";
import {ThemesRouteur} from "./routes/ThemesRoute";
import {QuestionsRouteur} from "./routes/QuestionsRoute";
import {CartesRouteur} from "./routes/CartesRoute";
import {MediasRouteur} from "./routes/MediasRoute";
import cookieParser = require("cookie-parser");
import {createServer} from "node:http";
import {GestionWebSocket} from "./websocket/ServeurSocket";


const port = process.env.PORT || 3301;

async function main() {
    await AppDataSource.initialize();

    const app = express();
    app.use(json());
    app.use(cookieParser());

    app.get("/healthcheck", async (req, res) => {
        try {
            await AppDataSource.query("SELECT 1");
            res.json({ statut: "ok", base: "joignable" });
        } catch {
            res.status(503).json({ statut: "degrade", base: "injoignable" });
        }
    });
    app.use("/api/utilisateurs", UtilisateursRouteur);
    app.use("/api/sessions", SessionsRouteur);
    app.use("/api/participants", ParticipantsRouteur);
    app.use("/api/themes", ThemesRouteur);
    app.use("/api/questions", QuestionsRouteur);
    app.use("/api/cartes", CartesRouteur);
    app.use("/api/medias", MediasRouteur);

    app.use((req, res) => {
        res.status(404).json({ message: "not found" });
    });

    const httpServer = createServer(app);
    GestionWebSocket(httpServer);
    httpServer.listen(port, () => {
        console.log(`🚀 Server started on port ${port}`);
    });
}

main();