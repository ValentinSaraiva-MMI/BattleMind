import { clockOffset } from '~/utils/time'

/**
 * Horloge serveur estimée, partagée par toute l'application via `useState`.
 *
 * Le décompte d'une manche se dérive de `started_at`, un horodatage PostgreSQL,
 * comparé à l'heure du poste : une horloge locale en avance ampute la manche
 * (ANO-028). On mesure donc une fois l'écart client/serveur et on l'applique à
 * chaque top, plutôt que de faire confiance à `Date.now()` seul.
 *
 * `/api/health` sert de référence de temps : c'est déjà l'endpoint de supervision
 * du projet, il expose un horodatage serveur et les sondes externes le maintiennent
 * chaud — aucune route n'est ajoutée pour ce seul besoin.
 */
export function useServerTime() {
  const offset = useState<number>('server-clock-offset', () => 0)
  const synced = useState<boolean>('server-clock-synced', () => false)
  // Garde d'idempotence : évite deux mesures concurrentes (même motif que useProfile).
  const inFlight = useState<boolean>('server-clock-in-flight', () => false)

  /**
   * Mesure l'écart par un aller-retour sur `/api/health`, une seule fois par session.
   *
   * Toute erreur est silencieuse : l'offset reste à 0, on retombe sur l'horloge
   * locale — soit le comportement d'avant correctif. Un incident de supervision
   * ne doit jamais empêcher une partie de se jouer.
   */
  const sync = async () => {
    if (synced.value || inFlight.value) return

    inFlight.value = true

    try {
      const sentAt = Date.now()
      const health = await $fetch<{ db_checked_at?: string | null, timestamp: string }>('/api/health')
      const receivedAt = Date.now()

      // L'horodatage PostgreSQL fait autorité : c'est cette horloge-là qui écrit
      // `started_at`, donc celle sur laquelle le décompte doit s'aligner. Celui du
      // serveur Nuxt n'est qu'un pis-aller, quand la base n'a rien renvoyé de lisible.
      const reference = health?.db_checked_at || health?.timestamp
      if (!reference) return

      offset.value = clockOffset(sentAt, receivedAt, reference)
      synced.value = true
    }
    catch {
      // Fail closed : sans mesure fiable, on ne corrige rien.
    }
    finally {
      inFlight.value = false
    }
  }

  /** Instant courant corrigé de la dérive locale. Vaut `Date.now()` tant que non synchronisé. */
  const serverNow = () => Date.now() + offset.value

  return { offset, synced, sync, serverNow }
}
