import {CODE_ACCES_MAXIMUM, CODE_ACCES_MINIMUM, TENTATIVES_CODE_ACCES} from "../../config/config";
import {Organisation} from "../../entities/Organisation";

export async function genererCodeInvitation(): Promise<number> {
    for (let essai = 0; essai < TENTATIVES_CODE_ACCES; essai++) {
        const etendue = CODE_ACCES_MAXIMUM - CODE_ACCES_MINIMUM + 1;
        const code = CODE_ACCES_MINIMUM + Math.floor(Math.random() * etendue);

        const dejaPris = await Organisation.findOneBy({
            code_invitation: code,
        });

        if (dejaPris === null) {
            return code;
        }
    }

    throw new Error("Impossible de trouver un code d'invitation");
}

export function fabriquerSlug(nom: string): string{
    return nom
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replaceAll(" ", "-")
}
