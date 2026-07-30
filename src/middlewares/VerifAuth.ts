import express from "express";
import jwt from "jsonwebtoken";
import {JWT_SECRET} from "../config/auth.config";
import {Utilisateur} from "../entities/Utilisateur";

export interface RequeteAuthentifiee extends express.Request { utilisateur: Utilisateur }

export async function verifAuth(baseRequest: express.Request, res: express.Response, next: express.NextFunction){
    const req = baseRequest as RequeteAuthentifiee;

    const token = req.cookies.token;
    if(!token){
        return res.status(401).json({erreur:"Token invalide"});
    }

    // TODO : A expliquer en même temps que Argon
    let payload: jwt.JwtPayload;
    try{
        payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch (e){
        return res.status(401).json({erreur:"Token invalide"});
    }

    const utilisateur = await Utilisateur.findOneBy({id:Number(payload.sub)});
    if(!utilisateur){
        return res.status(401).json({erreur:"Token invalide"});
    }

    req.utilisateur = utilisateur;
    next();
}
