import "reflect-metadata";
import express, {json} from "express";
import { AppDataSource } from "./data-source";
import {UtilisateursRouteur} from "./routes/UtilisateursRoute";
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

    app.use((req, res) => {
        res.status(404).json({ message: "not found" });
    });

    app.listen(port, () => {
        console.log(`🚀 Server started on port ${port}`);
    });
}

main();