import express from "express";
import { AppDataSource } from "./data-source.js";



const port = process.env.PORT || 3301;

async function main() {
    await AppDataSource.initialize();

    const app = express();

    app.get("/", (req, res) => {
        res.send("Hello World!");
    });

    app.use((req, res) => {
        res.status(404).json({ message: "not found" });
    });

    app.listen(port, () => {
        console.log(`🚀 Server started on port ${port}`);
    });
}

main();