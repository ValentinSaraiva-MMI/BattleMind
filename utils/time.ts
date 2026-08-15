/**
 * Écart d'horloge entre le client et le serveur.
 *
 * Le compte à rebours d'une manche se calcule par différence entre l'heure locale
 * et l'horodatage de démarrage fourni par la base. Toute dérive de l'horloge du
 * poste se consomme donc sur le temps de jeu : un poste en avance de trois
 * secondes ampute la manche d'autant, sans que rien ne le signale.
 */

/** Écart maximal accepté entre horloge locale et horloge serveur (ms).
 *  Au-delà, la mesure est jugée aberrante et ignorée. */
export const MAX_CLOCK_OFFSET_MS = 5 * 60 * 1000

/**
 * Écart entre l'horloge serveur et l'horloge locale, estimé par un aller-retour.
 * Latence supposée symétrique : l'instant serveur correspond au milieu de
 * l'aller-retour, ce qui évite d'attribuer le trajet entier à la dérive.
 * Entrée invalide ou écart aberrant : 0, on retombe alors sur l'horloge locale,
 * soit le comportement d'avant correctif (fail closed).
 */
export const clockOffset = (
  sentAt: number,
  receivedAt: number,
  serverTime: string | number | Date
): number => {
  const server = new Date(serverTime).getTime()
  if (!Number.isFinite(server) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt)) return 0
  if (receivedAt < sentAt) return 0
  const offset = server - (sentAt + (receivedAt - sentAt) / 2)
  return Math.abs(offset) > MAX_CLOCK_OFFSET_MS ? 0 : offset
}
