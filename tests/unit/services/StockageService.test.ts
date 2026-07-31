import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Le SDK est remplacé avant l'import du service : StockageService construit son
// client au chargement du module, un mock posé après serait ignoré.
const envoyer = jest.fn<(commande: unknown) => Promise<unknown>>();

// Les options passées au constructeur sont mémorisées à part : clearMocks
// (jest.config.ts) efface l'historique des appels avant chaque test, alors que
// le client n'est construit qu'une fois, au chargement du module.
const optionsClient: Record<string, unknown>[] = [];

jest.mock("@aws-sdk/client-s3", () => {
    class CommandeFactice {
        constructor(public readonly input: Record<string, unknown>) {}
    }

    return {
        S3Client: jest.fn().mockImplementation((...args: unknown[]) => {
            optionsClient.push(args[0] as Record<string, unknown>);
            return { send: envoyer };
        }),
        PutObjectCommand: class PutObjectCommand extends CommandeFactice {},
        DeleteObjectCommand: class DeleteObjectCommand extends CommandeFactice {},
    };
});

import { genererCle, supprimer, televerser, urlPublique } from "../../../src/services/StockageService";
import { S3_BUCKET, S3_URL_PUBLIQUE } from "../../../src/config/stockage.config";

beforeEach(() => {
    envoyer.mockReset();
    envoyer.mockResolvedValue({});
});

describe("client S3", () => {
    it("active forcePathStyle, sans quoi MinIO serait injoignable", () => {
        // MinIO ne gère pas le virtual-host style : sans cette option le SDK
        // viserait "<bucket>.<domaine>" au lieu de "<domaine>/<bucket>".
        expect(optionsClient[0]?.forcePathStyle).toBe(true);
    });
});

describe("genererCle", () => {
    it("préfixe la clé par le dossier et termine en .webp par défaut", () => {
        const cle = genererCle("cartes");

        expect(cle).toMatch(/^cartes\/[0-9a-f-]{36}\.webp$/);
    });

    it("accepte une autre extension", () => {
        expect(genererCle("avatars", "png")).toMatch(/\.png$/);
    });

    it("ne produit jamais deux fois la même clé", () => {
        // Un horodatage suffirait à collisionner sur deux appels rapprochés :
        // c'est bien un UUID qui garantit l'unicité.
        const cles = new Set(Array.from({ length: 200 }, () => genererCle("cartes")));

        expect(cles.size).toBe(200);
    });
});

describe("televerser", () => {
    it("envoie le buffer avec le bucket, la clé et le type de contenu", async () => {
        const buffer = Buffer.from("image-factice");

        await televerser(buffer, "cartes/abc.webp", "image/webp");

        expect(envoyer).toHaveBeenCalledTimes(1);

        const commande = envoyer.mock.calls[0]?.[0] as { input: Record<string, unknown> };

        expect(commande.input).toEqual({
            Bucket: S3_BUCKET,
            Key: "cartes/abc.webp",
            Body: buffer,
            // Sans ContentType, MinIO sert le fichier en application/octet-stream
            // et le navigateur le télécharge au lieu de l'afficher.
            ContentType: "image/webp",
        });
    });

    it("laisse remonter l'erreur du SDK", async () => {
        envoyer.mockRejectedValue(new Error("stockage indisponible"));

        await expect(televerser(Buffer.from("x"), "cartes/a.webp", "image/webp"))
            .rejects.toThrow("stockage indisponible");
    });
});

describe("supprimer", () => {
    it("envoie le bucket et la clé", async () => {
        await supprimer("cartes/abc.webp");

        const commande = envoyer.mock.calls[0]?.[0] as { input: Record<string, unknown> };

        expect(commande.input).toEqual({ Bucket: S3_BUCKET, Key: "cartes/abc.webp" });
    });
});

describe("urlPublique", () => {
    it("construit le lien à partir de l'URL publique, pas de l'endpoint interne", () => {
        // L'endpoint interne est une IP privée : un navigateur ne peut pas l'atteindre.
        expect(urlPublique("cartes/abc.webp")).toBe(`${S3_URL_PUBLIQUE}/${S3_BUCKET}/cartes/abc.webp`);
    });

    it("n'appelle pas le réseau", () => {
        urlPublique("cartes/abc.webp");

        expect(envoyer).not.toHaveBeenCalled();
    });
});
