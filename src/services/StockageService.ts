import {S3Client, PutObjectCommand, DeleteObjectCommand} from "@aws-sdk/client-s3";
import {randomUUID} from "node:crypto";
import {
    S3_ACCESS_KEY,
    S3_BUCKET,
    S3_ENDPOINT,
    S3_REGION,
    S3_SECRET_KEY,
    S3_URL_PUBLIQUE
} from "../config/stockage.config";

const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY
    },
    forcePathStyle: true
});

export function genererCle(dossier: string, extension: string = "webp"): string {
    return `${dossier}/${randomUUID()}.${extension}`;
}

export async function televerser(buffer: Buffer, cle: string, mimetype: string): Promise<void> {
    await client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: cle,
        Body: buffer,
        ContentType: mimetype
    }));
}

export async function supprimer(cle: string): Promise<void> {
    await client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: cle
    }));
}

export function urlPublique(cle: string): string {
    const base = S3_URL_PUBLIQUE.replace(/\/$/, "");
    return `${base}/${S3_BUCKET}/${cle}`;
}
