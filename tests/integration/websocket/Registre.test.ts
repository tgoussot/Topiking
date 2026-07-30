import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { WebSocket } from "ws";

import {
    demarrerServeurDeTest,
    arreterServeurDeTest,
    ServeurDeTest,
    connecter,
    cookieParticipant,
    fermerSocket,
    fermerSockets,
    laisserArriverLesMessages,
} from "../../helpers/serveurTest";
import { genererTokenParticipant } from "../../../src/services/AuthService";
import { creerContexteMinimal, creerSession, creerParticipant } from "../../helpers/fixtures";
import { compterConnexions, sessionsEnregistrees } from "../../../src/websocket/Registre";

describe("Registre WebSocket — cycle de vie des connexions", () => {
    let serveur: ServeurDeTest;
    const sockets: WebSocket[] = [];

    beforeEach(async () => {
        serveur = await demarrerServeurDeTest();
    });

    afterEach(async () => {
        await fermerSockets(sockets.splice(0));
        await arreterServeurDeTest(serveur);
    });

    it("deux joueurs de la même session sont tous deux comptés", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurA = await creerParticipant(session.id);
        const joueurB = await creerParticipant(session.id);

        const wsA = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurA)));
        const wsB = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurB)));
        sockets.push(wsA, wsB);

        expect(compterConnexions(session.id)).toBe(2);
    });

    it("la déconnexion d'un seul joueur fait retomber le compte à 1", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurA = await creerParticipant(session.id);
        const joueurB = await creerParticipant(session.id);

        const wsA = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurA)));
        const wsB = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurB)));
        sockets.push(wsA, wsB);

        await fermerSocket(wsA);

        await laisserArriverLesMessages(50);

        expect(compterConnexions(session.id)).toBe(1);
    });

    it("le départ du dernier joueur fait disparaître la clé de la session", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);

        const ws = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueur)));
        sockets.push(ws);

        await fermerSocket(ws);
        await laisserArriverLesMessages(50);

        expect(sessionsEnregistrees()).not.toContain(session.id);
        expect(compterConnexions(session.id)).toBe(0);
    });

    it("deux sessions différentes ne mélangent jamais leurs connexions", async () => {
        const { animateur } = await creerContexteMinimal();
        const sessionA = await creerSession(animateur.id);
        const sessionB = await creerSession(animateur.id);
        const joueurA = await creerParticipant(sessionA.id);
        const joueurB = await creerParticipant(sessionB.id);

        const wsA = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurA)));
        const wsB = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurB)));
        sockets.push(wsA, wsB);

        const clesEnregistrees = sessionsEnregistrees();

        expect(clesEnregistrees).toContain(sessionA.id);
        expect(clesEnregistrees).toContain(sessionB.id);
        expect(compterConnexions(sessionA.id)).toBe(1);
        expect(compterConnexions(sessionB.id)).toBe(1);
    });

    it("un même participant sur deux appareils n'est retiré que d'un seul à la fois", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const token = genererTokenParticipant(joueur);

        const telephone = await connecter(serveur.urlWs, cookieParticipant(token));
        const tablette = await connecter(serveur.urlWs, cookieParticipant(token));
        sockets.push(telephone, tablette);

        expect(compterConnexions(session.id)).toBe(2);

        await fermerSocket(telephone);
        await laisserArriverLesMessages(50);

        expect(compterConnexions(session.id)).toBe(1);
    });
});
