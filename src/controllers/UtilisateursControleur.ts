import express from "express";
import {Utilisateur} from "../entities/Utilisateur";
import {genererToken, hacherMotDePasse, verifierMotDePasse} from "../services/AuthService";
import {Organisation} from "../entities/Organisation";
import {fabriquerSlug, genererCodeInvitation} from "../services/Jeux/OrganisationService";
import {RequeteAuthentifiee} from "../middlewares/VerifAuth";

export async function creerUtilisateur(req: express.Request, res: express.Response){
    const { email, nom, mot_de_passe, code_invitation, nom_organisation } = req.body;

    const existant = await Utilisateur.findOneBy({email: email});
    if(existant){
        return res.status(409).json({erreur:"Un utilisateur est déjà créé avec ce mail"});
    }

    let organisation: Organisation | null = null;
    if (code_invitation && nom_organisation) {
        return res.status(400).json({ erreur: "Vous pouvez pas avoir une invitation et vouloir créer une organisation" });
    }
    else if (code_invitation) {
        organisation = await Organisation.findOneBy({ code_invitation: code_invitation });
        if (!organisation) {
            return res.status(404).json({ erreur: "Le code d'invitation n'est pas bon" });
        }
    }
    else if (nom_organisation) {
        const genere_code = await genererCodeInvitation();
        const slug = fabriquerSlug(nom_organisation);
        organisation = Organisation.create({nom: nom_organisation, code_invitation:genere_code, slug:slug})
        await organisation.save();
    }
    else {
        return res.status(400).json({ erreur: "Vous devez avoir soit un code d'invitation soit un nom d'organisation pour en créer une" });
    }

    const hash = await hacherMotDePasse(mot_de_passe);
    const utilisateur = Utilisateur.create({email: email, nom: nom, mot_de_passe:hash, id_organisation:organisation.id});
    await utilisateur.save();

    return res.status(201).json({id: utilisateur.id, email: utilisateur.email, nom:utilisateur.nom})
}
export async function creerToken(req: express.Request, res: express.Response){
    const {email, mot_de_passe} = req.body;

    const utilisateur = await Utilisateur.findOneBy({email: email});
    if(!utilisateur){
        return res.status(401).json({erreur:"Identifiant invalide"});
    }

    const ok = await verifierMotDePasse(utilisateur.mot_de_passe, mot_de_passe);
    if(!ok){
        return res.status(401).json({erreur:"Identifiant invalide"});
    }

    const token = genererToken(utilisateur);
    res.cookie("token",token,{httpOnly:true, secure:true, sameSite:"strict", maxAge: 15*60*1000})

    return res.status(200).json({id: utilisateur.id, email: utilisateur.email, nom:utilisateur.nom})
}
export function supprimerToken(req: express.Request, res:express.Response){
    res.clearCookie("token", {httpOnly:true, secure:true, sameSite:"strict"})
    return res.status(204).send()
}
export async function moi(baseRequest: express.Request, res:express.Response){
    const req = baseRequest as RequeteAuthentifiee;
    return res.status(200).json({id: req.utilisateur.id, email: req.utilisateur.email, nom:req.utilisateur.nom})
}

