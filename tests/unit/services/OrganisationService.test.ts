import { describe, it, expect } from "@jest/globals";
import { fabriquerSlug } from "../../../src/services/Jeux/OrganisationService";

// fabriquerSlug est une fonction pure : aucune base n'est nécessaire.
// genererCodeInvitation, elle, interroge la table Organisation et est donc
// testée du côté intégration.

describe("fabriquerSlug", () => {
    it("retire les accents et remplace les espaces par des tirets", () => {
        expect(fabriquerSlug("Lycée Victor Hugo")).toBe("lycee-victor-hugo");
    });

    it("ignore les espaces en début et en fin", () => {
        expect(fabriquerSlug("  Acme Formation  ")).toBe("acme-formation");
    });

    it("laisse inchangée une chaîne déjà sans accent ni espace", () => {
        expect(fabriquerSlug("acme")).toBe("acme");
    });

    it("met en minuscules", () => {
        expect(fabriquerSlug("ACME")).toBe("acme");
    });

    it("traite les accents composés comme les caractères précomposés", () => {
        // La normalisation NFD décompose "é" en "e" + accent combinant, que la
        // fonction supprime ensuite. Une chaîne déjà décomposée doit donc donner
        // le même résultat qu'une chaîne précomposée : c'est ce que garantit le
        // normalize("NFD") avant le retrait.
        // Les deux formes sont écrites en échappements explicites : à l'écran
        // elles seraient identiques, et le test ne prouverait plus rien.
        const precompose = "Cr\u00e8che";     // "è" en un seul point de code
        const decompose = "Cre\u0300che";     // "e" + accent grave combinant

        expect(precompose).not.toBe(decompose);
        expect(fabriquerSlug(precompose)).toBe("creche");
        expect(fabriquerSlug(decompose)).toBe("creche");
    });

    it("conserve un tiret déjà présent", () => {
        expect(fabriquerSlug("Val-de-Marne")).toBe("val-de-marne");
    });

    // ------------------------------------------------------------------
    // Cas limites : ces tests décrivent le comportement ACTUEL, qui n'est pas
    // le comportement souhaitable. Ils sont écrits pour rendre le problème
    // visible et faire échouer la suite le jour où la fonction sera corrigée
    // — ce qui sera alors le signal d'ajuster ces attentes, pas un régression.
    //
    // Le vrai correctif n'appartient pas aux tests : voir la remarque en fin
    // de fichier.
    // ------------------------------------------------------------------
    it("renvoie une chaîne vide pour une entrée vide (comportement actuel)", () => {
        expect(fabriquerSlug("")).toBe("");
        expect(fabriquerSlug("   ")).toBe("");
    });

    it("laisse passer la ponctuation (comportement actuel)", () => {
        // La fonction ne retire que les accents et les espaces : tout autre
        // caractère traverse tel quel.
        expect(fabriquerSlug("!!!")).toBe("!!!");
        expect(fabriquerSlug("Acme & Co")).toBe("acme-&-co");
    });
});

// Deux limites connues de fabriquerSlug, à traiter dans le service :
//
//  1. Une entrée vide ou composée d'espaces donne "". Le slug étant UNIQUE en
//     base, la première organisation ainsi nommée passerait, la seconde
//     échouerait sur une violation de contrainte — soit une erreur 500 pour un
//     cas d'entrée parfaitement prévisible. À noter : @Length(2,120) sur
//     nom_organisation dans RegisterDto écarte aujourd'hui ce cas par l'API,
//     mais rien ne protège un appel direct au service (seed, script, import).
//
//  2. La ponctuation n'est pas filtrée : « Acme & Co » devient « acme-&-co »,
//     qui donnera une URL malformée une fois le slug utilisé dans un chemin.
//
// Un remplacement de tout caractère non alphanumérique par un tiret, suivi
// d'une réduction des tirets consécutifs et d'un repli explicite quand le
// résultat est vide, traiterait les deux d'un coup.
