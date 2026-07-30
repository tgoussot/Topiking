import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { WebSocket } from "ws";
import jwt from "jsonwebtoken";

import {
    demarrerServeurDeTest,
    arreterServeurDeTest,
    ServeurDeTest,
    ouvrirSocket,
    attendreHandshake,
    cookieParticipant,
    fermerSockets,
} from "../../helpers/serveurTest";
import { genererToken, genererTokenParticipant } from "../../../src/services/AuthService";
import { JWT_SECRET } from "../../../src/config/auth.config";
import { creerContexteMinimal, creerSession, creerParticipant } from "../../helpers/fixtures";

describe("Handshake WebSocket — contrôle d'accès", () => {
    let serveur: ServeurDeTest;
    const sockets: WebSocket[] = [];

    beforeEach(async () => {
        serveur = await demarrerServeurDeTest();
    });

    afterEach(async () => {
        await fermerSockets(sockets.splice(0));
        await arreterServeurDeTest(serveur);
    });

    it("refuse une connexion sans cookie avec un vrai 401 HTTP", async () => {
        const ws = ouvrirSocket(serveur.urlWs);
        sockets.push(ws);

        const resultat = await attendreHandshake(ws);

        expect(resultat.ouvert).toBe(false);
        expect(resultat.echec?.statut).toBe(401);
    });

    it("accepte une connexion porteuse d'un token_participant valide", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);

        const ws = ouvrirSocket(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueur)));
        sockets.push(ws);

        const resultat = await attendreHandshake(ws);

        expect(resultat.ouvert).toBe(true);
        expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it("refuse un cookie présent mais sans token_participant", async () => {
        const ws = ouvrirSocket(serveur.urlWs, "autre_cookie=valeur");
        sockets.push(ws);

        const resultat = await attendreHandshake(ws);

        expect(resultat.ouvert).toBe(false);
        expect(resultat.echec?.statut).toBe(401);
    });

    it("refuse un token d'animateur posé dans le cookie token_participant", async () => {
        const { animateur } = await creerContexteMinimal();

        const ws = ouvrirSocket(serveur.urlWs, cookieParticipant(genererToken(animateur)));
        sockets.push(ws);

        const resultat = await attendreHandshake(ws);

        expect(resultat.ouvert).toBe(false);
        expect(resultat.echec?.statut).toBe(401);
    });

    it("refuse un token_participant expiré", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);

        const perime = jwt.sign(
            {
                sub: joueur.id,
                session: joueur.id_session,
                role: "participant",
            },
            JWT_SECRET,
            { expiresIn: "-1s" }
        );

        const ws = ouvrirSocket(serveur.urlWs, cookieParticipant(perime));
        sockets.push(ws);

        const resultat = await attendreHandshake(ws);

        expect(resultat.ouvert).toBe(false);
        expect(resultat.echec?.statut).toBe(401);
    });

    it("refuse un token dont le sub a été maquillé", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurA = await creerParticipant(session.id);
        const joueurB = await creerParticipant(session.id);

        const token = genererTokenParticipant(joueurA);
        const [entete, , signature] = token.split(".");
        const payloadTrafique = Buffer.from(
            JSON.stringify({
                sub: joueurB.id,
                session: joueurB.id_session,
                role: "participant",
            })
        ).toString("base64url");

        const ws = ouvrirSocket(
            serveur.urlWs,
            cookieParticipant(`${entete}.${payloadTrafique}.${signature}`)
        );
        sockets.push(ws);

        const resultat = await attendreHandshake(ws);

        expect(resultat.ouvert).toBe(false);
        expect(resultat.echec?.statut).toBe(401);
    });

    it("détruit sans réponse HTTP une connexion sur une autre URL que /ws", async () => {
        const urlAutre = serveur.urlWs.replace(/\/ws$/, "/autre");
        const ws = ouvrirSocket(urlAutre);
        sockets.push(ws);

        const resultat = await attendreHandshake(ws);

        expect(resultat.ouvert).toBe(false);
        expect(resultat.echec?.statut).toBeNull();
        expect(resultat.echec?.message).toMatch(/socket hang up/);
    });
});
