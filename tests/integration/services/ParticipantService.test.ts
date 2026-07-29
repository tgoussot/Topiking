import { describe, it, expect } from "@jest/globals";
import {
    nettoyerPseudo,
    verifierPseudo,
    pseudoDejaPris,
    rejoindre,
    lister,
    compter,
    quitter,
    ajouterPoints,
} from "../../../src/services/ParticipantService";
import { Participant } from "../../../src/entities/Participant";
import {
    creerContexteMinimal,
    creerSession,
    creerParticipant,
} from "../../helpers/fixtures";

describe("nettoyerPseudo", () => {
    it("retire les espaces en début et en fin", () => {
        expect(nettoyerPseudo("   Alice   ")).toBe("Alice");
    });

    it("réduit les espaces multiples internes à un seul", () => {
        expect(nettoyerPseudo("Jean    Michel")).toBe("Jean Michel");
    });

    it("laisse inchangé un pseudo déjà propre", () => {
        expect(nettoyerPseudo("Jean Michel")).toBe("Jean Michel");
    });
});

describe("verifierPseudo", () => {
    it("renvoie le pseudo nettoyé", () => {
        expect(verifierPseudo("  Jean   Michel  ")).toBe("Jean Michel");
    });

    it("rejette un pseudo trop court", () => {
        expect(() => verifierPseudo("a")).toThrow("au moins 2 caractères");
    });

    it("rejette un pseudo trop long", () => {
        expect(() => verifierPseudo("a".repeat(21))).toThrow("ne doit pas dépasser 20 caractères");
    });

    it("accepte les longueurs aux bornes exactes", () => {
        expect(verifierPseudo("ab")).toBe("ab");
        expect(verifierPseudo("a".repeat(20))).toBe("a".repeat(20));
    });

    it("rejette une chaîne uniquement composée d'espaces", () => {
        expect(() => verifierPseudo("      ")).toThrow("au moins 2 caractères");
    });

    it("mesure la longueur après nettoyage", () => {
        // "  ab  " ne fait que 2 caractères une fois nettoyé : c'est valide.
        expect(verifierPseudo("  ab  ")).toBe("ab");
    });
});

describe("pseudoDejaPris", () => {
    it("détecte un pseudo identique", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipant(session.id, { pseudo: "Alice" });

        expect(await pseudoDejaPris(session.id, "Alice")).toBe(true);
    });

    it("est insensible à la casse", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipant(session.id, { pseudo: "Alice" });

        expect(await pseudoDejaPris(session.id, "ALICE")).toBe(true);
    });

    it("ne détecte pas un pseudo appartenant à une autre session", async () => {
        const { animateur } = await creerContexteMinimal();
        const premiereSession = await creerSession(animateur.id);
        const secondeSession = await creerSession(animateur.id);
        await creerParticipant(premiereSession.id, { pseudo: "Alice" });

        expect(await pseudoDejaPris(secondeSession.id, "Alice")).toBe(false);
    });

    it("renvoie false sur une session sans participant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);

        expect(await pseudoDejaPris(session.id, "Alice")).toBe(false);
    });
});

describe("rejoindre", () => {
    it("crée un participant avec un score total à zéro", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { code_acces: 123456 });

        const participant = await rejoindre(123456, "Alice");

        expect(participant.pseudo).toBe("Alice");
        expect(participant.score_total).toBe(0);
        expect(participant.id_session).toBe(session.id);
    });

    it("rejette un code d'accès inexistant", async () => {
        await expect(rejoindre(999999, "Alice")).rejects.toThrow("Aucune partie ne correspond à ce code");
    });

    it("rejette une partie déjà commencée", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 123456, statut: "en_cours" });

        await expect(rejoindre(123456, "Alice")).rejects.toThrow("La partie a déjà commencé");
    });

    it("rejette un pseudo déjà pris dans la même partie", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { code_acces: 123456 });
        await creerParticipant(session.id, { pseudo: "Alice" });

        await expect(rejoindre(123456, "Alice")).rejects.toThrow("est déjà pris dans cette partie");
    });

    it("rejette un pseudo déjà pris avec une casse différente", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { code_acces: 123456 });
        await creerParticipant(session.id, { pseudo: "Alice" });

        await expect(rejoindre(123456, "aLiCe")).rejects.toThrow("est déjà pris dans cette partie");
    });

    it("accepte le même pseudo dans deux parties différentes", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 123456 });
        await creerSession(animateur.id, { code_acces: 654321 });

        const premier = await rejoindre(123456, "Alice");
        const second = await rejoindre(654321, "Alice");

        expect(premier.id_session).not.toBe(second.id_session);
    });

    it("enregistre le pseudo nettoyé et non la saisie brute", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerSession(animateur.id, { code_acces: 123456 });

        const participant = await rejoindre(123456, "  Jean   Michel  ");

        const relu = await Participant.findOneBy({ id: participant.id });
        expect(relu?.pseudo).toBe("Jean Michel");
    });

    it("rejette un pseudo invalide avant même de chercher la partie", async () => {
        // Le code n'existe pas non plus : c'est bien l'erreur de pseudo qui doit remonter.
        await expect(rejoindre(999999, "a")).rejects.toThrow("au moins 2 caractères");
    });
});

describe("lister", () => {
    it("renvoie les participants d'une partie triés par identifiant croissant", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        await creerParticipant(session.id, { pseudo: "Alice" });
        await creerParticipant(session.id, { pseudo: "Bob" });
        await creerParticipant(session.id, { pseudo: "Chloé" });

        const participants = await lister(session.id);

        expect(participants.map((p) => p.pseudo)).toEqual(["Alice", "Bob", "Chloé"]);
    });

    it("ne renvoie pas les participants d'une autre partie", async () => {
        const { animateur } = await creerContexteMinimal();
        const premiereSession = await creerSession(animateur.id);
        const secondeSession = await creerSession(animateur.id);
        await creerParticipant(premiereSession.id, { pseudo: "Alice" });
        await creerParticipant(secondeSession.id, { pseudo: "Bob" });

        const participants = await lister(premiereSession.id);

        expect(participants.map((p) => p.pseudo)).toEqual(["Alice"]);
    });
});

describe("compter", () => {
    it("renvoie le nombre de participants de la partie", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const autreSession = await creerSession(animateur.id);
        await creerParticipant(session.id);
        await creerParticipant(session.id);
        await creerParticipant(autreSession.id);

        expect(await compter(session.id)).toBe(2);
    });
});

describe("quitter", () => {
    it("supprime le participant quand la partie est en attente", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const participant = await creerParticipant(session.id);

        await quitter(participant.id);

        expect(await Participant.findOneBy({ id: participant.id })).toBeNull();
    });

    it("rejette quand la partie est déjà commencée", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id, { statut: "en_cours" });
        const participant = await creerParticipant(session.id);

        await expect(quitter(participant.id)).rejects.toThrow(
            "Impossible de quitter une partie déjà commencée"
        );
    });

    it("rejette un participant inexistant", async () => {
        await expect(quitter(404)).rejects.toThrow("Participant introuvable");
    });
});

describe("ajouterPoints", () => {
    it("ajoute les points au score total et les persiste", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const participant = await creerParticipant(session.id, { score_total: 100 });

        await ajouterPoints(participant.id, 50);

        const relu = await Participant.findOneBy({ id: participant.id });
        expect(relu?.score_total).toBe(150);
    });

    it("cumule les points sur plusieurs appels", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const participant = await creerParticipant(session.id, { score_total: 0 });

        await ajouterPoints(participant.id, 10);
        await ajouterPoints(participant.id, 20);
        const dernier = await ajouterPoints(participant.id, 30);

        expect(dernier.score_total).toBe(60);
    });

    it("rejette un montant négatif", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const participant = await creerParticipant(session.id, { score_total: 100 });

        await expect(ajouterPoints(participant.id, -10)).rejects.toThrow(
            "On ne retire jamais de points à un participant"
        );
    });

    it("accepte un montant nul", async () => {
        const { animateur } = await creerContexteMinimal();
        const session = await creerSession(animateur.id);
        const participant = await creerParticipant(session.id, { score_total: 100 });

        const misAJour = await ajouterPoints(participant.id, 0);

        expect(misAJour.score_total).toBe(100);
    });

    it("rejette un participant inexistant", async () => {
        await expect(ajouterPoints(404, 10)).rejects.toThrow("Participant introuvable");
    });
});
