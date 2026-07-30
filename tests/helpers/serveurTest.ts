import express, { json } from "express";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import cookieParser = require("cookie-parser");
import { WebSocket } from "ws";

import { UtilisateursRouteur } from "../../src/routes/UtilisateursRoute";
import { SessionsRouteur } from "../../src/routes/SessionsRoute";
import { ParticipantsRouteur } from "../../src/routes/ParticipantsRoute";
import { ThemesRouteur } from "../../src/routes/ThemesRoute";
import { QuestionsRouteur } from "../../src/routes/QuestionsRoute";
import { CartesRouteur } from "../../src/routes/CartesRoute";
import { GestionWebSocket } from "../../src/websocket/ServeurSocket";
import { Message, TypeMessage } from "../../src/websocket/Message";

export function construireApplicationDeTest() {
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

    return app;
}

export type ServeurDeTest = {
    httpServer: Server;
    port: number;
    urlWs: string;
    urlHttp: string;
};

export async function demarrerServeurDeTest(): Promise<ServeurDeTest> {
    const httpServer = createServer(construireApplicationDeTest());
    GestionWebSocket(httpServer);

    await new Promise<void>((resolve) => {
        httpServer.listen(0, "127.0.0.1", () => resolve());
    });

    const port = (httpServer.address() as AddressInfo).port;

    return {
        httpServer,
        port,
        urlWs: `ws://127.0.0.1:${port}/ws`,
        urlHttp: `http://127.0.0.1:${port}`,
    };
}

export async function arreterServeurDeTest(serveur: ServeurDeTest | undefined): Promise<void> {
    if (!serveur) {
        return;
    }

    serveur.httpServer.closeAllConnections();

    await new Promise<void>((resolve) => {
        serveur.httpServer.close(() => resolve());
    });
}

export function ouvrirSocket(urlWs: string, cookie?: string): WebSocket {
    const options = cookie === undefined ? {} : { headers: { Cookie: cookie } };

    return new WebSocket(urlWs, options);
}

export type EchecHandshake = {
    statut: number | null;
    message: string;
};

export function attendreHandshake(ws: WebSocket): Promise<{ ouvert: boolean; echec?: EchecHandshake }> {
    return new Promise((resolve) => {
        ws.on("open", () => resolve({ ouvert: true }));

        ws.on("unexpected-response", (_requete, reponse) => {
            resolve({
                ouvert: false,
                echec: { statut: reponse.statusCode ?? null, message: `HTTP ${reponse.statusCode}` },
            });
            ws.terminate();
        });

        ws.on("error", (erreur: Error) => {
            resolve({ ouvert: false, echec: { statut: null, message: erreur.message } });
        });
    });
}

export async function connecter(urlWs: string, cookie: string): Promise<WebSocket> {
    const ws = ouvrirSocket(urlWs, cookie);
    const resultat = await attendreHandshake(ws);

    if (!resultat.ouvert) {
        throw new Error(`Handshake refusé : ${resultat.echec?.message}`);
    }

    return ws;
}

export function cookieParticipant(token: string): string {
    return `token_participant=${token}`;
}

export function attendreMessage(
    ws: WebSocket,
    type: TypeMessage,
    delaiMs: number = 2000
): Promise<Message> {
    return new Promise((resolve, reject) => {
        const minuteur = setTimeout(() => {
            ws.off("message", surMessage);
            reject(new Error(`Aucun message "${type}" reçu en ${delaiMs} ms`));
        }, delaiMs);

        function surMessage(donnees: unknown) {
            const message = JSON.parse(String(donnees)) as Message;

            if (message.type === type) {
                clearTimeout(minuteur);
                ws.off("message", surMessage);
                resolve(message);
            }
        }

        ws.on("message", surMessage);
    });
}

export function collecterMessages(ws: WebSocket): () => Message[] {
    const recus: Message[] = [];

    ws.on("message", (donnees) => {
        recus.push(JSON.parse(String(donnees)) as Message);
    });

    return () => [...recus];
}

export function laisserArriverLesMessages(delaiMs: number = 150): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delaiMs));
}

export function fermerSocket(ws: WebSocket | undefined): Promise<void> {
    return new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
        }

        ws.on("close", () => resolve());
        ws.close();
    });
}

export async function fermerSockets(sockets: (WebSocket | undefined)[]): Promise<void> {
    await Promise.all(sockets.map((ws) => fermerSocket(ws)));

    await laisserArriverLesMessages(50);
}
