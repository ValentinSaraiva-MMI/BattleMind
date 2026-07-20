/**
 * Progression du joueur — calculs dérivés de l'XP et des compteurs de parties.
 *
 * Fonctions pures : aucun import Nuxt ni Supabase, aucun état. Elles sont la
 * contrepartie de la règle « ne jamais stocker une valeur dérivée » (le niveau
 * et le taux de réussite se recalculent à l'affichage depuis `profiles.xp`,
 * `games_won` et `games_played`).
 */

/**
 * Courbe de niveau : paliers linéaires de 500 XP.
 *
 *   niveau 1 →      0 à   499 XP
 *   niveau 2 →    500 à   999 XP
 *   niveau n → (n-1) × 500 XP
 *
 * Choix volontairement simple : lisible par le joueur (« il me manque N XP »),
 * trivial à vérifier en test, et suffisant pour le périmètre BC02. Une courbe
 * progressive (paliers croissants) pourra la remplacer sans toucher aux appelants
 * — seules ces trois fonctions connaissent la formule.
 */
export const XP_PER_LEVEL = 500

/**
 * Normalise un compteur venant de la base : on ne fait jamais confiance à une
 * valeur négative, non entière ou non finie (fail closed → 0).
 */
function toSafeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Taux de réussite en pourcentage (0-100).
 *
 * @returns `null` si aucune partie jouée — l'appelant doit alors afficher « — »
 *          plutôt que « 0% », qui laisserait croire à un échec. Jamais de
 *          division par zéro.
 */
export function winRate(gamesWon: number, gamesPlayed: number): number | null {
  const played = toSafeCount(gamesPlayed)
  if (played <= 0) return null

  // Garde-fou sur données incohérentes : le taux ne peut pas dépasser 100 %.
  const won = Math.min(toSafeCount(gamesWon), played)

  return (won / played) * 100
}

/** Niveau atteint pour un total d'XP. Le premier niveau est 1, pas 0. */
export function levelFromXp(xp: number): number {
  return Math.floor(toSafeCount(xp) / XP_PER_LEVEL) + 1
}

/**
 * Progression à l'intérieur du niveau courant, pour la barre d'XP.
 *
 * `current` est l'XP acquise depuis le début du palier (et non l'XP totale),
 * `target` la taille du palier, `percent` le remplissage de la barre (0-100).
 * Un palier tout juste franchi repart donc à 0.
 */
export function xpProgress(xp: number): { current: number; target: number; percent: number } {
  const current = toSafeCount(xp) % XP_PER_LEVEL

  return {
    current,
    target: XP_PER_LEVEL,
    percent: (current / XP_PER_LEVEL) * 100
  }
}
