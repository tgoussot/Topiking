const POINTS_BONNE_REPONSE = 100;
const BONUS_RAPIDITE_MAX = 50;
const BONUS_CARTE_ELAN = 25;

export type ParametresScore = {
    estCorrect: boolean;
    tempsReponseMs: number;
    dureeTimerMs: number;
    bonusElan: boolean;
};


export function calculerBonusRapidite(tempsReponseMs: number, dureeTimerMs: number): number {
    if (dureeTimerMs <= 0) {
        return 0;
    }

    let temps = tempsReponseMs;

    // Un temps en-dessous
    if (temps < 0) {
        temps = 0;
    }

    // Un temps supérieur
    if (temps > dureeTimerMs) {
        temps = dureeTimerMs;
    }

    // Réponse immédiate = 1, réponse à mi-parcours = 0.5, réponse à la fin = 0.
    const partDeTempsRestante = 1 - temps / dureeTimerMs;
    const bonus = BONUS_RAPIDITE_MAX * partDeTempsRestante;
    return Math.round(bonus);
}

export function calculerPoints(parametres: ParametresScore): number {
    if (parametres.estCorrect === false) {
        return 0;
    }

    let points = POINTS_BONNE_REPONSE;

    points = points + calculerBonusRapidite(parametres.tempsReponseMs, parametres.dureeTimerMs);

    if (parametres.bonusElan === true) {
        points = points + BONUS_CARTE_ELAN;
    }

    return points;
}

export function totaliserPoints(listePoints: number[]): number {
    let total = 0;

    for (let i = 0; i < listePoints.length; i++) {
        const points = listePoints[i];

        if (points === undefined) {
            continue;
        }

        total = total + points;
    }

    return total;
}
