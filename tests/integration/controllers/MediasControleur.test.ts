import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Response } from "express";
import sharp from "sharp";

// Le stockage objet est simulé : ces tests portent sur la logique du contrôleur
// (validation, droits, cohérence base/fichier), pas sur le dialogue avec MinIO,
// couvert par les tests unitaires de StockageService.
const televerser = jest.fn<(buffer: Buffer, cle: string, mimetype: string) => Promise<void>>();
const supprimerObjet = jest.fn<(cle: string) => Promise<void>>();

jest.mock("../../../src/services/StockageService", () => ({
    genererCle: (dossier: string, extension = "webp") => `${dossier}/cle-de-test.${extension}`,
    televerser: (buffer: Buffer, cle: string, mimetype: string) => televerser(buffer, cle, mimetype),
    supprimer: (cle: string) => supprimerObjet(cle),
    urlPublique: (cle: string) => `https://stockage.test/topiking/${cle}`,
}));

import {
    lireMedia,
    listerMedias,
    supprimerMedia,
    uploadMedia,
} from "../../../src/controllers/MediasControleur";
import { Media } from "../../../src/entities/Media";
import { Utilisateur } from "../../../src/entities/Utilisateur";
import { RequeteAuthentifiee } from "../../../src/middlewares/VerifAuth";
import { creerContexteMinimal, creerMedia, creerUtilisateur } from "../../helpers/fixtures";

function fabriquerReponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res),
        send: jest.fn(() => res),
    };

    return res as unknown as Response & {
        status: jest.Mock;
        json: jest.Mock;
        send: jest.Mock;
    };
}

function fabriquerRequete(
    utilisateur: Utilisateur,
    params: Record<string, string> = {},
    file?: { buffer: Buffer; originalname: string }
): RequeteAuthentifiee {
    return { body: {}, params, utilisateur, file } as unknown as RequeteAuthentifiee;
}

// Vraie image, pour que sharp ait quelque chose de valide à convertir.
async function imageValide(largeur = 100, hauteur = 80): Promise<Buffer> {
    return await sharp({
        create: { width: largeur, height: hauteur, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();
}

beforeEach(() => {
    televerser.mockReset();
    televerser.mockResolvedValue(undefined);
    supprimerObjet.mockReset();
    supprimerObjet.mockResolvedValue(undefined);
});

describe("uploadMedia", () => {
    it("convertit l'image en WebP, l'envoie au stockage et enregistre la ligne", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        await uploadMedia(
            fabriquerRequete(animateur, { dossier: "cartes" }, { buffer: await imageValide(), originalname: "photo.png" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(201);
        expect(televerser).toHaveBeenCalledTimes(1);

        // Le buffer envoyé est bien du WebP, pas le PNG d'origine : c'est cette
        // réécriture qui neutralise un fichier piégé déguisé en image.
        const [buffer, cle, mimetype] = televerser.mock.calls[0] as [Buffer, string, string];

        expect(buffer.subarray(8, 12).toString()).toBe("WEBP");
        expect(cle).toBe("cartes/cle-de-test.webp");
        expect(mimetype).toBe("image/webp");

        const enregistre = await Media.findOneBy({ cle: "cartes/cle-de-test.webp" });

        expect(enregistre).not.toBeNull();
        expect(enregistre?.nom_original).toBe("photo.png");
        expect(enregistre?.id_utilisateur).toBe(animateur.id);
    });

    it("refuse un fichier qui n'est pas une image", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        await uploadMedia(
            fabriquerRequete(animateur, { dossier: "cartes" }, {
                buffer: Buffer.from("<script>alert(1)</script>"),
                originalname: "piege.png",
            }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(televerser).not.toHaveBeenCalled();
        expect(await Media.count()).toBe(0);
    });

    it("refuse un dossier hors de la liste autorisée", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        await uploadMedia(
            fabriquerRequete(animateur, { dossier: "../../etc" }, { buffer: await imageValide(), originalname: "a.png" }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(televerser).not.toHaveBeenCalled();
    });

    it("refuse une requête sans fichier", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        await uploadMedia(fabriquerRequete(animateur, { dossier: "cartes" }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("retire le fichier du stockage si l'enregistrement en base échoue", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        // Une clé déjà prise viole la contrainte d'unicité : sans compensation,
        // le fichier resterait orphelin dans le bucket.
        await creerMedia(animateur.id, { cle: "cartes/cle-de-test.webp" });

        await expect(
            uploadMedia(
                fabriquerRequete(animateur, { dossier: "cartes" }, { buffer: await imageValide(), originalname: "b.png" }),
                res
            )
        ).rejects.toThrow();

        expect(supprimerObjet).toHaveBeenCalledWith("cartes/cle-de-test.webp");
    });
});

describe("listerMedias", () => {
    it("renvoie les médias de toutes les organisations", async () => {
        // Les médias ne sont pas cloisonnés : le deck de cartes étant commun à
        // tout le jeu, ses illustrations doivent être visibles par tous.
        const { animateur } = await creerContexteMinimal();
        const autre = await creerContexteMinimal();

        await creerMedia(animateur.id, { nom_original: "le-mien.png" });
        await creerMedia(autre.animateur.id, { nom_original: "celui-du-voisin.png" });

        const res = fabriquerReponse();
        await listerMedias(fabriquerRequete(animateur), res);

        expect(res.status).toHaveBeenCalledWith(200);

        const corps = JSON.stringify(res.json.mock.calls[0]?.[0]);

        expect(corps).toContain("le-mien.png");
        expect(corps).toContain("celui-du-voisin.png");
    });

    it("expose une URL publique et jamais la clé brute", async () => {
        const { animateur } = await creerContexteMinimal();
        await creerMedia(animateur.id, { cle: "cartes/abc.webp" });

        const res = fabriquerReponse();
        await listerMedias(fabriquerRequete(animateur), res);

        const corps = res.json.mock.calls[0]?.[0] as Array<Record<string, unknown>>;

        expect(corps[0]?.url).toBe("https://stockage.test/topiking/cartes/abc.webp");
        expect(corps[0]).not.toHaveProperty("cle");
    });
});

describe("lireMedia", () => {
    it("renvoie 404 sur un identifiant inconnu", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        await lireMedia(fabriquerRequete(animateur, { id: "9999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("renvoie 400 sur un identifiant non numérique", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        await lireMedia(fabriquerRequete(animateur, { id: "abc" }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe("supprimerMedia", () => {
    it("supprime la ligne puis le fichier", async () => {
        const { animateur } = await creerContexteMinimal();
        const media = await creerMedia(animateur.id, { cle: "cartes/a-supprimer.webp" });

        const res = fabriquerReponse();
        await supprimerMedia(fabriquerRequete(animateur, { id: String(media.id) }), res);

        expect(res.status).toHaveBeenCalledWith(204);
        expect(supprimerObjet).toHaveBeenCalledWith("cartes/a-supprimer.webp");
        expect(await Media.findOneBy({ id: media.id })).toBeNull();
    });

    it("refuse la suppression par quelqu'un d'autre que l'auteur", async () => {
        const { organisation, animateur } = await creerContexteMinimal();
        const media = await creerMedia(animateur.id);

        const intrus = await creerUtilisateur(organisation.id);

        const res = fabriquerReponse();
        await supprimerMedia(fabriquerRequete(intrus, { id: String(media.id) }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(supprimerObjet).not.toHaveBeenCalled();
        expect(await Media.findOneBy({ id: media.id })).not.toBeNull();
    });

    it("renvoie 404 sur un média déjà supprimé", async () => {
        const { animateur } = await creerContexteMinimal();
        const res = fabriquerReponse();

        await supprimerMedia(fabriquerRequete(animateur, { id: "9999" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(supprimerObjet).not.toHaveBeenCalled();
    });
});
