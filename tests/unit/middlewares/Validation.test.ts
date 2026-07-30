import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { validerBody } from "../../../src/middlewares/Validation";
import { RegisterDto } from "../../../src/dto/RegisterDto";

// Le middleware est testé sans serveur HTTP : on lui passe des objets req/res
// simulés, réduits aux seules méthodes qu'il emploie. C'est suffisant, et cela
// évite de monter Express et une base pour valider une règle de validation.

const BODY_VALIDE = {
    email: "animateur@exemple.fr",
    nom: "Animateur",
    mot_de_passe: "MonMotDePasse1!",
    nom_organisation: "Acme Formation",
};

// res.status(...).json(...) est chaîné dans le middleware : status doit donc
// renvoyer l'objet lui-même pour que .json() existe derrière.
function fabriquerReponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res),
    };

    return res as unknown as Response & {
        status: jest.Mock;
        json: jest.Mock;
    };
}

function fabriquerRequete(body: unknown): Request {
    return { body } as Request;
}

// Récupère le corps JSON passé à res.json(), tel qu'un client le recevrait.
function corpsRenvoye(res: ReturnType<typeof fabriquerReponse>): unknown {
    return res.json.mock.calls[0]?.[0];
}

describe("validerBody", () => {
    it("appelle next() et remplace req.body par une instance du DTO", async () => {
        const req = fabriquerRequete({ ...BODY_VALIDE });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await validerBody(RegisterDto)(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();

        // Le body n'est plus un objet JSON anonyme mais une instance typée :
        // c'est ce qui permet au contrôleur de se fier aux champs déclarés.
        expect(req.body).toBeInstanceOf(RegisterDto);
        expect(req.body.email).toBe(BODY_VALIDE.email);
    });

    it("répond 400 et n'appelle jamais next() sur un body invalide", async () => {
        const req = fabriquerRequete({ ...BODY_VALIDE, email: "pas-un-email" });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await validerBody(RegisterDto)(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it("liste le champ fautif dans la réponse", async () => {
        const req = fabriquerRequete({ ...BODY_VALIDE, email: "pas-un-email" });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await validerBody(RegisterDto)(req, res, next);

        // Le client doit savoir QUEL champ corriger, sans qu'on lui rappelle
        // la valeur qu'il a envoyée.
        expect(corpsRenvoye(res)).toEqual({
            champs: [
                {
                    propriete: "email",
                    messages: expect.any(Array),
                },
            ],
        });
    });

    it("répond 400 sur un champ non déclaré, via forbidNonWhitelisted", async () => {
        // Cœur de la protection contre le mass assignment : id_organisation
        // n'est pas déclaré dans RegisterDto, donc un client ne peut pas se
        // rattacher lui-même à l'organisation de son choix.
        const req = fabriquerRequete({ ...BODY_VALIDE, id_organisation: 1 });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await validerBody(RegisterDto)(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();

        const corps = corpsRenvoye(res) as { champs: { propriete: string }[] };
        expect(corps.champs.map((champ) => champ.propriete)).toContain("id_organisation");
    });

    it("ne renvoie jamais la valeur reçue dans la réponse", async () => {
        const MOT_DE_PASSE_ENVOYE = "court";
        const req = fabriquerRequete({
            ...BODY_VALIDE,
            email: "email-invalide-tres-reconnaissable",
            mot_de_passe: MOT_DE_PASSE_ENVOYE,
        });
        const res = fabriquerReponse();
        const next = jest.fn() as unknown as NextFunction;

        await validerBody(RegisterDto)(req, res, next);

        // On sérialise toute la réponse et on y cherche les valeurs envoyées :
        // un message d'erreur qui recopierait le mot de passe le ferait fuiter
        // dans les journaux du client comme dans ceux des intermédiaires.
        const serialisee = JSON.stringify(corpsRenvoye(res));

        expect(serialisee.includes(MOT_DE_PASSE_ENVOYE)).toBe(false);
        expect(serialisee.includes("email-invalide-tres-reconnaissable")).toBe(false);
    });
});
