import {ClassConstructor, plainToInstance} from "class-transformer";
import {Request, Response, NextFunction} from "express";
import {validate} from "class-validator";

// paramètre de type ; contrainte ; fonction generique
export function validerBody<T extends object>(DtoClass:ClassConstructor<T>){
    return async function (req:Request,res:Response,next:NextFunction){
        const dto = plainToInstance(DtoClass, req.body)
        const erreurs = await validate(dto,{whitelist: true, forbidNonWhitelisted: true}); // supprime + rejette
        if(erreurs.length > 0) {
            return res.status(400).json({
                champs: erreurs.map(erreur => ({
                    propriete: erreur.property,
                    messages: Object.values(erreur.constraints ?? {})
                }))
            });
        }
        // Nettoie le body
        req.body = dto;
        next();
    };
}