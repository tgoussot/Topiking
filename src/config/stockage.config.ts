import "dotenv/config"

const endpoint = process.env.S3_ENDPOINT;
if (!endpoint){
    throw new Error("La variable S3_ENDPOINT n'est pas définie")
}

const bucket = process.env.S3_BUCKET;
if (!bucket){
    throw new Error("La variable S3_BUCKET n'est pas définie")
}

const accessKey = process.env.S3_ACCESS_KEY;
if (!accessKey){
    throw new Error("La variable S3_ACCESS_KEY n'est pas définie")
}

const secretKey = process.env.S3_SECRET_KEY;
if (!secretKey){
    throw new Error("La variable S3_SECRET_KEY n'est pas définie")
}

const urlPublique = process.env.S3_URL_PUBLIQUE;
if (!urlPublique){
    throw new Error("La variable S3_URL_PUBLIQUE n'est pas définie")
}

export const S3_ENDPOINT = endpoint;
export const S3_BUCKET = bucket;
export const S3_ACCESS_KEY = accessKey;
export const S3_SECRET_KEY = secretKey;
export const S3_URL_PUBLIQUE = urlPublique;
export const S3_REGION = process.env.S3_REGION || "us-east-1";

export const TAILLE_MAXIMUM_OCTETS = 5 * 1024 * 1024;
export const LARGEUR_MAXIMUM = 3840;
export const HAUTEUR_MAXIMUM = 2160;
export const DOSSIERS_MEDIAS = ["cartes", "avatars"];
