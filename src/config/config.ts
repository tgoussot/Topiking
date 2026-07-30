import "dotenv/config";

//  ████████╗ ██████╗ ██████╗ ██╗██╗  ██╗██╗███╗   ██╗ ██████╗
//  ╚══██╔══╝██╔═══██╗██╔══██╗██║██║ ██╔╝██║████╗  ██║██╔════╝
//     ██║   ██║   ██║██████╔╝██║█████╔╝ ██║██╔██╗ ██║██║  ███╗
//     ██║   ██║   ██║██╔═══╝ ██║██╔═██╗ ██║██║╚██╗██║██║   ██║
//     ██║   ╚██████╔╝██║     ██║██║  ██╗██║██║ ╚████║╚██████╔╝
//     ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝
//
//                    .    .    .
//                   _\/__\/__\/_
//                  (             )
//                   \___________/
//
//              ~~~ Réglages du jeu ~~~


// Nombre de manches d'une partie, donc nombre de thèmes à choisir à la création.
export const NOMBRE_MANCHES = 3;

// Nombre de questions posées dans chaque manche. (min 3)
export const QUESTIONS_PAR_MANCHE = 3;

// Bornes du code d'accès à 6 chiffres. (commence jamais à 0)
export const CODE_ACCES_MINIMUM = 100000;
export const CODE_ACCES_MAXIMUM = 999999;

// Nombre de tirages avant d'abandonner la recherche d'un code libre.
export const TENTATIVES_CODE_ACCES = 100;

// Longueur autorisée pour le pseudo saisi par un joueur.
export const PSEUDO_LONGUEUR_MINIMUM = 2;
export const PSEUDO_LONGUEUR_MAXIMUM = 20;

// Au-delà de ce nombre de participants, un malus ne vise plus une personne
// mais frappe les premiers du classement
export const SEUIL_CIBLAGE_MULTIPLE = 6;

// Nombre de joueurs touchés quand le seuil ci-dessus est dépassé.
export const CIBLES_MULTIPLES = 3;

// Durée de la fenêtre pendant laquelle les joueurs peuvent jouer leurs cartes,
// entre deux manches (en secondes).
export const FENETRE_CARTES_S = 20;
