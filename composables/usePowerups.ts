import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Power-up tiré dans une salle de power-up, tel que servi par `draw_powerup`.
 *
 * `kind` distingue le bonus (joué sur soi) du malus (joué sur un adversaire) et
 * `target` dit sur QUI il s'applique — les deux sont décidés en base, jamais
 * déduits côté client : c'est le serveur qui fait autorité sur l'effet réel.
 */
export interface DrawnPowerup {
  /** Identifiant de l'exemplaire tiré (ligne d'inventaire), pas du type de power-up. */
  instanceId: string
  code: string
  kind: 'bonus' | 'malus'
  target: 'self' | 'opponent'
  name: string
  description: string
  /** Cycle de vie de l'exemplaire côté base (disponible, consommé, expiré…). */
  status: string
}

/** Power-up actif sur un round, tel que servi par `get_active_powerups`. */
export interface ActivePowerup {
  instanceId: string
  code: string
  kind: 'bonus' | 'malus'
  name: string
  /** Durée de l'effet (s), ou `null` pour un effet instantané / limité au round. */
  durationS: number | null
}

// Messages utilisateur : aucun détail technique ne remonte à l'écran (fail closed).
export const DRAW_POWERUP_ERROR = "Le tirage n'a pas pu aboutir. Réessaie dans un instant."
export const APPLY_POWERUP_ERROR = "Ce power-up n'a pas pu être activé. Réessaie."
export const ACTIVE_POWERUPS_ERROR = 'Impossible de charger les power-ups actifs.'

/**
 * Accès aux power-ups : tirage en salle de power-up, activation, et lecture des
 * effets actifs d'un round.
 *
 * La base fait autorité de bout en bout. `draw_powerup` décide SEULE si le
 * joueur a droit à un tirage (série en cours, power-ups activés sur le lobby) et
 * quel power-up sort : le client ne tire rien, il affiche un résultat.
 * `apply_powerup` vérifie que l'exemplaire appartient bien à l'appelant et
 * qu'il est encore consommable — envoyer un `p_instance_id` volé ne donne rien.
 * `get_active_powerups` renvoie les effets déjà décidés côté serveur ; l'écran de
 * jeu s'en sert uniquement pour les restituer, jamais pour les appliquer.
 *
 * Ce composable ne fait qu'appeler ces fonctions Postgres `security definer` :
 * aucune logique d'effet ici, et aucun appel réseau power-up ailleurs dans l'app.
 */
export function usePowerups() {
  const supabase = useSupabaseClient()

  /** Action réseau en cours (tirage, activation). */
  const pending = ref(false)
  const errorMessage = ref('')

  const fail = (message: string): null => {
    errorMessage.value = message
    return null
  }

  /**
   * Tire un power-up pour le joueur courant dans la salle de power-up du lobby.
   *
   * `draw_powerup` est la seule autorité : elle vérifie la série (`streak`) du
   * joueur et n'accorde un tirage que si elle le justifie. Un tirage refusé n'est
   * PAS une erreur — la fonction renvoie `granted: false` (avec la série
   * courante), et l'écran affiche « pas de power-up cette fois ». `null` est
   * réservé à l'échec réel (réseau, accès refusé).
   */
  const drawPowerup = async (
    lobbyId: string
  ): Promise<{ granted: boolean, streak?: number, powerup?: DrawnPowerup } | null> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const { data, error } = await supabase.rpc('draw_powerup', { p_lobby_id: lobbyId })
      if (error || !data) return fail(DRAW_POWERUP_ERROR)

      const row = data as {
        granted?: boolean
        streak?: number
        powerup?: {
          instance_id: string
          code: string
          kind: DrawnPowerup['kind']
          target: DrawnPowerup['target']
          name: string
          description: string
          status: string
        } | null
      }

      const drawn = row.powerup
      if (!drawn) return { granted: Boolean(row.granted), streak: row.streak }

      return {
        granted: Boolean(row.granted),
        streak: row.streak,
        powerup: {
          instanceId: drawn.instance_id,
          code: drawn.code,
          kind: drawn.kind,
          target: drawn.target,
          name: drawn.name,
          description: drawn.description,
          status: drawn.status
        }
      }
    } catch {
      return fail(DRAW_POWERUP_ERROR)
    } finally {
      pending.value = false
    }
  }

  const applyPowerup = async (instanceId: string, targetId?: string): Promise<boolean> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const { error } = await supabase.rpc('apply_powerup', {
        p_instance_id: instanceId,
        p_target_id: targetId ?? null
      })

      if (error) {
        errorMessage.value = APPLY_POWERUP_ERROR
        return false
      }

      return true
    } catch {
      errorMessage.value = APPLY_POWERUP_ERROR
      return false
    } finally {
      pending.value = false
    }
  }

  /**
   * Effets actifs sur un round donné, pour le joueur courant.
   *
   * Sert à restituer visuellement ce qui est en cours (bouclier, temps réduit…) :
   * l'effet lui-même est déjà appliqué côté serveur, cette lecture n'en déclenche
   * aucun. Renvoie une liste vide en cas d'échec — un affichage secondaire ne doit
   * jamais faire échouer l'écran de jeu.
   */
  const fetchActivePowerups = async (
    lobbyId: string,
    roundNumber: number
  ): Promise<ActivePowerup[]> => {
    try {
      const { data, error } = await supabase.rpc('get_active_powerups', {
        p_lobby_id: lobbyId,
        p_round_number: roundNumber
      })

      if (error || !data) {
        errorMessage.value = ACTIVE_POWERUPS_ERROR
        return []
      }

      const rows = data as Array<{
        instance_id: string
        code: string
        kind: ActivePowerup['kind']
        name: string
        duration_s: number | null
      }>

      return rows.map(row => ({
        instanceId: row.instance_id,
        code: row.code,
        kind: row.kind,
        name: row.name,
        durationS: row.duration_s ?? null
      }))
    } catch {
      errorMessage.value = ACTIVE_POWERUPS_ERROR
      return []
    }
  }

  /**
   * Souscrit aux changements de phase d'un lobby (`lobbies`, UPDATE filtré par
   * `id`) : la partie alterne entre la phase `question` et la salle de power-up
   * (`powerup`). C'est le serveur qui bascule la colonne `phase` ; TOUS les
   * clients reçoivent le même UPDATE et changent d'écran au même moment — même
   * mécanique de synchro que `subscribeToRounds`.
   *
   * `phaseStartedAt` est le départ SERVEUR de la phase : le décompte de la salle
   * s'en dérive (voir `remainingSeconds`), jamais d'un compteur local.
   *
   * Renvoie le canal ; à fermer au démontage (`unsubscribeChannel`).
   */
  const subscribeToLobbyPhase = (
    lobbyId: string,
    onPhase: (phase: 'question' | 'powerup', phaseStartedAt: string | null) => void
  ): RealtimeChannel =>
    supabase
      .channel(`lobby-phase:${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lobbies',
          filter: `id=eq.${lobbyId}`
        },
        payload => {
          const row = payload.new as {
            phase: 'question' | 'powerup'
            phase_started_at: string | null
          }
          onPhase(row.phase, row.phase_started_at ?? null)
        }
      )
      .subscribe()

  /** Ferme un canal Realtime et libère la connexion côté Supabase. */
  const unsubscribeChannel = (channel: RealtimeChannel): void => {
    supabase.removeChannel(channel)
  }

  return {
    pending,
    errorMessage,
    drawPowerup,
    applyPowerup,
    fetchActivePowerups,
    subscribeToLobbyPhase,
    unsubscribeChannel
  }
}
