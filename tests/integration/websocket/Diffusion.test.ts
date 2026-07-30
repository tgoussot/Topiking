import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { WebSocket } from "ws";

import {
    demarrerServeurDeTest,
    arreterServeurDeTest,
    ServeurDeTest,
    connecter,
    cookieParticipant,
    fermerSockets,
    attendreMessage,
    collecterMessages,
    laisserArriverLesMessages,
} from "../../helpers/serveurTest";
import { genererTokenParticipant } from "../../../src/services/AuthService";
import { creerContexteMinimal, creerSession, creerParticipant } from "../../helpers/fixtures";
import { versSession, versParticipant } from "../../../src/websocket/Registre";

describe("Diffusion WebSocket — cloisonnement", () => {
    let serveur: ServeurDeTest;
    const sockets: WebSocket[] = [];

    beforeEach(async () => {
        serveur = await demarrerServeurDeTest();
    });

    afterEach(async () => {
        await fermerSockets(sockets.splice(0));
        await arreterServeurDeTest(serveur);
    });

    it("versSession atteint tous les joueurs de la session visée, aucun d'une autre", async () => {
        const { animateur } = await creerContexteMinimal();
        const sessionA = await creerSession(animateur.id);
        const sessionB = await creerSession(animateur.id);
        const joueurA1 = await creerParticipant(sessionA.id);
        const joueurA2 = await creerParticipant(sessionA.id);
        const joueurB = await creerParticipant(sessionB.id);

        const wsA1 = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurA1)));
        const wsA2 = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurA2)));
        const wsB = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurB)));
        sockets.push(wsA1, wsA2, wsB);

        const attenduA1 = attendreMessage(wsA1, "session.demarree");
        const attenduA2 = attendreMessage(wsA2, "session.demarree");
        const recuParB = collecterMessages(wsB);

        versSession(sessionA.id, "session.demarree", { manche: 1 });

        await attenduA1;
        await attenduA2;
        await laisserArriverLesMessages();

        expect(recuParB()).toHaveLength(0);
    });

    it("versParticipant ne fait jamais fuiter le payload d'un joueur vers un autre de la même session", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueurA = await creerParticipant(session.id);
        const joueurB = await creerParticipant(session.id);

        const wsA = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurA)));
        const wsB = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueurB)));
        sockets.push(wsA, wsB);

        const attenduA = attendreMessage(wsA, "question.ouverte");
        const attenduB = attendreMessage(wsB, "question.ouverte");

        versParticipant(session.id, joueurA.id, "question.ouverte", {
            propositions: ["p1", "p2", "p3", "p4"],
            duree_s: 10,
        });
        versParticipant(session.id, joueurB.id, "question.ouverte", {
            propositions: ["p1", "p2", "p3"],
            duree_s: 5,
            indice: true,
        });

        const messageA = await attenduA;
        const messageB = await attenduB;

        expect(messageA.donnees).toEqual({
            propositions: ["p1", "p2", "p3", "p4"],
            duree_s: 10,
        });
        expect(messageB.donnees).toEqual({
            propositions: ["p1", "p2", "p3"],
            duree_s: 5,
            indice: true,
        });

        expect(messageA.donnees).not.toEqual(messageB.donnees);
    });

    it("versParticipant atteint tous les appareils d'un même joueur", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur = await creerParticipant(session.id);
        const token = genererTokenParticipant(joueur);

        const telephone = await connecter(serveur.urlWs, cookieParticipant(token));
        const tablette = await connecter(serveur.urlWs, cookieParticipant(token));
        sockets.push(telephone, tablette);

        const attenduTelephone = attendreMessage(telephone, "carte.jouee");
        const attenduTablette = attendreMessage(tablette, "carte.jouee");

        versParticipant(session.id, joueur.id, "carte.jouee", { id_carte: 1 });

        const messageTelephone = await attenduTelephone;
        const messageTablette = await attenduTablette;

        expect(messageTelephone.donnees).toEqual({ id_carte: 1 });
        expect(messageTablette.donnees).toEqual({ id_carte: 1 });
    });

    it("diffuser vers une session absente du registre ne lève pas", async () => {
        expect(() => versSession(999999, "session.demarree", {})).not.toThrow();
        expect(() => versParticipant(999999, 999999, "session.demarree", {})).not.toThrow();
    });

    it("une socket fermée présente dans le registre n'interrompt pas la diffusion aux autres", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const joueur1 = await creerParticipant(session.id);
        const joueur2 = await creerParticipant(session.id);
        const joueur3 = await creerParticipant(session.id);

        const ws1 = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueur1)));
        const ws2 = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueur2)));
        const ws3 = await connecter(serveur.urlWs, cookieParticipant(genererTokenParticipant(joueur3)));
        sockets.push(ws1, ws2, ws3);

        const attendu1 = attendreMessage(ws1, "manche.cloturee");
        const attendu3 = attendreMessage(ws3, "manche.cloturee");

        ws2.terminate();
        versSession(session.id, "manche.cloturee", { numero_manche: 1 });

        const message1 = await attendu1;
        const message3 = await attendu3;

        expect(message1.donnees).toEqual({ numero_manche: 1 });
        expect(message3.donnees).toEqual({ numero_manche: 1 });
    });
});
