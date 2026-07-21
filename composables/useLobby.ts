import type { RealtimeChannel } from '@supabase/supabase-js'
import { levelFromXp } from '~/composables/useProgression'
import {
  categoryLabel,
  isValidLobbyCode,
  lobbyDisplayStatus,
  normalizeLobbyCode,
  type LobbyAccess,
  type LobbyCategory
} from '~/utils/lobby'

/** Paramètres saisis dans la modale de création. */
export interface CreateLobbyInput {
  name: string
  category: LobbyCategory
  access: LobbyAccess
  maxPlayers: number
  powerupsEnabled: boolean
}

/** Ligne `lobby_players` enrichie du profil, telle qu'affichée dans le salon. */
export interface LobbyPlayer {
  id: string
  userId: string
  pseudo: string
  initials: string
  level: number
  isHost: boolean
  isReady: boolean
}

/** Vue complète d'un salon, pour la page `/lobby/[id]`. */
export interface LobbyDetail {
  id: string
  code: string
  name: string
  category: LobbyCategory
  categoryLabel: string
  access: LobbyAccess
  maxPlayers: number
  powerupsEnabled: boolean
  status: 'waiting' | 'in_progress' | 'finished'
  hostId: string | null
  players: LobbyPlayer[]
}

/** Carte de la liste des parties publiques, sur l'accueil. */
export interface PublicLobby {
  id: string
  name: string
  category: string
  status: 'waiting' | 'full'
  players: number
  maxPlayers: number
  host: string
}

export type LobbiesStatus = 'pending' | 'loaded' | 'error'

// Messages utilisateur : aucun détail technique ne remonte à l'écran.
export const SESSION_ERROR = 'Session expirée. Reconnecte-toi pour jouer.'
export const CREATE_ERROR = "Impossible de créer l'arène. Réessaie dans un instant."
export const JOIN_ERROR = 'Impossible de rejoindre cette partie. Réessaie dans un instant.'
export const CODE_INVALID_ERROR = 'Le code doit contenir 6 chiffres.'
export const CODE_UNKNOWN_ERROR = 'Aucune partie ouverte ne correspond à ce code.'
export const LOBBIES_ERROR = 'Impossible de charger les parties publiques.'
export const LOBBY_NOT_FOUND_ERROR = "Cette partie n'existe plus."
export const LEAVE_ERROR = 'Impossible de quitter le salon. Réessaie dans un instant.'
export const START_ERROR = "Impossible de lancer l'arène. Réessaie dans un instant."

// Colonnes lues pour la liste publique. `lobby_players(count)` est une agrégation
// PostgREST : le décompte est calculé par la base, jamais dérivé ni stocké.
const PUBLIC_LOBBY_COLUMNS =
  'id, name, category, max_players, host:profiles(pseudo), lobby_players(count)'

const LOBBY_DETAIL_COLUMNS =
  'id, code, name, category, access, max_players, powerups_enabled, status, host_id, ' +
  'lobby_players(id, user_id, is_host, is_ready, profile:profiles(pseudo, xp))'

/** Repli avatar : 2 premières lettres du pseudo, en majuscules (idem chip d'en-tête). */
const initialsOf = (pseudo: string): string => pseudo.trim().slice(0, 2).toUpperCase() || '?'

/**
 * Accès aux salons : création, jonction, sortie, et lecture des parties publiques.
 *
 * Les lobbies vivent en Postgres et la base fait autorité : le code de partie est
 * généré côté serveur, et le contrôle de capacité appartient à la fonction
 * `join_lobby_by_code`. Ce composable ne fait qu'appeler ces éléments — les
 * calculs locaux (statut « Full », bornes du stepper) sont du confort d'affichage.
 *
 * État local et non partagé, contrairement à `useProfile` : l'accueil et la page
 * salon regardent des données différentes et ne doivent pas se marcher dessus.
 */
export function useLobby() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  /** Liste des parties publiques (accueil). */
  const lobbies = ref<PublicLobby[]>([])
  const lobbiesStatus = ref<LobbiesStatus>('pending')
  const lobbiesError = ref('')

  /** Salon courant (page `/lobby/[id]`). */
  const lobby = ref<LobbyDetail | null>(null)
  const lobbyStatus = ref<LobbiesStatus>('pending')

  /** Action en cours (création, jonction, sortie, lancement). */
  const pending = ref(false)
  const errorMessage = ref('')

  /**
   * `useSupabaseUser()` expose le JWT décodé (`JwtPayload`) : l'identifiant est
   * dans `sub`. `getSession()` sert de repli quand le ref n'est pas encore
   * renseigné (premier rendu après une navigation directe).
   */
  const resolveUserId = async (): Promise<string | null> => {
    const claimed = (user.value as { sub?: string } | null)?.sub
    if (claimed) return claimed

    try {
      const { data } = await supabase.auth.getSession()
      return data?.session?.user?.id ?? null
    } catch {
      return null
    }
  }

  const fail = (message: string): null => {
    errorMessage.value = message
    return null
  }

  /**
   * Crée un salon puis y inscrit l'hôte.
   *
   * Le `code` n'est jamais envoyé : la base le génère. `host_id` est posé
   * explicitement pour que la policy RLS d'insertion puisse le vérifier.
   * Renvoie l'identifiant du salon créé, ou `null` en cas d'échec.
   */
  const createLobby = async (input: CreateLobbyInput): Promise<string | null> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const userId = await resolveUserId()
      if (!userId) return fail(SESSION_ERROR)

      const { data, error } = await supabase
        .from('lobbies')
        .insert({
          name: input.name.trim(),
          category: input.category,
          access: input.access,
          max_players: input.maxPlayers,
          powerups_enabled: input.powerupsEnabled,
          host_id: userId
        })
        .select('id')
        .single()

      const created = data as { id: string } | null
      if (error || !created) return fail(CREATE_ERROR)

      // L'hôte occupe la première place du salon.
      const { error: joinError } = await supabase
        .from('lobby_players')
        .insert({ lobby_id: created.id, user_id: userId, is_host: true })

      if (joinError) return fail(CREATE_ERROR)

      return created.id
    } catch {
      // Fail closed : toute exception réseau devient un message utilisateur sûr.
      return fail(CREATE_ERROR)
    } finally {
      pending.value = false
    }
  }

  /**
   * Rejoint une partie privée par son code.
   *
   * Toute la logique d'admission (partie existante, encore ouverte, non pleine,
   * joueur pas déjà inscrit) appartient à la fonction Postgres : c'est elle qui
   * fait autorité. La vérification des 6 chiffres faite ici évite seulement un
   * aller-retour réseau inutile, elle ne protège rien.
   */
  const joinByCode = async (code: string): Promise<string | null> => {
    const normalized = normalizeLobbyCode(code)

    if (!isValidLobbyCode(normalized)) {
      errorMessage.value = CODE_INVALID_ERROR
      return null
    }

    pending.value = true
    errorMessage.value = ''

    try {
      const { data, error } = await supabase.rpc('join_lobby_by_code', { p_code: normalized })

      if (error) return fail(CODE_UNKNOWN_ERROR)

      const lobbyId = data as string | null
      if (!lobbyId) return fail(CODE_UNKNOWN_ERROR)

      return lobbyId
    } catch {
      return fail(JOIN_ERROR)
    } finally {
      pending.value = false
    }
  }

  /**
   * Rejoint une partie publique depuis la liste de l'accueil.
   *
   * L'insert est soumis aux policies RLS et à la contrainte `unique (lobby_id,
   * user_id)` : un salon plein ou fermé est refusé par la base, pas par le client.
   */
  const joinPublic = async (lobbyId: string): Promise<string | null> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const userId = await resolveUserId()
      if (!userId) return fail(SESSION_ERROR)

      const { error } = await supabase
        .from('lobby_players')
        .insert({ lobby_id: lobbyId, user_id: userId })

      if (error) return fail(JOIN_ERROR)

      return lobbyId
    } catch {
      return fail(JOIN_ERROR)
    } finally {
      pending.value = false
    }
  }

  /** Retire le joueur courant du salon. */
  const leaveLobby = async (lobbyId: string): Promise<boolean> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const userId = await resolveUserId()
      if (!userId) {
        errorMessage.value = SESSION_ERROR
        return false
      }

      const { error } = await supabase
        .from('lobby_players')
        .delete()
        .eq('lobby_id', lobbyId)
        .eq('user_id', userId)

      if (error) {
        errorMessage.value = LEAVE_ERROR
        return false
      }

      return true
    } catch {
      errorMessage.value = LEAVE_ERROR
      return false
    } finally {
      pending.value = false
    }
  }

  /**
   * Passe le salon en partie lancée. Réservé à l'hôte : la policy RLS de mise à
   * jour de `lobbies` le vérifie côté serveur, le masquage du bouton n'est
   * qu'un confort d'interface.
   */
  const startLobby = async (lobbyId: string): Promise<boolean> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const { error } = await supabase
        .from('lobbies')
        .update({ status: 'in_progress' })
        .eq('id', lobbyId)

      if (error) {
        errorMessage.value = START_ERROR
        return false
      }

      return true
    } catch {
      errorMessage.value = START_ERROR
      return false
    } finally {
      pending.value = false
    }
  }

  /**
   * Recharge la liste des parties publiques en attente.
   *
   * `silent` sert au rafraîchissement automatique : il évite de repasser en
   * `pending`, ce qui viderait la liste sous les yeux du joueur toutes les 10 s.
   */
  const fetchPublicLobbies = async (options: { silent?: boolean } = {}): Promise<void> => {
    if (!options.silent) lobbiesStatus.value = 'pending'
    lobbiesError.value = ''

    try {
      const { data, error } = await supabase
        .from('lobbies')
        .select(PUBLIC_LOBBY_COLUMNS)
        .eq('access', 'public')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })

      if (error || !data) {
        lobbiesError.value = LOBBIES_ERROR
        lobbiesStatus.value = 'error'
        return
      }

      const rows = data as unknown as Array<{
        id: string
        name: string
        category: string
        max_players: number
        host: { pseudo: string } | null
        lobby_players: Array<{ count: number }> | null
      }>

      lobbies.value = rows.map(row => {
        const players = row.lobby_players?.[0]?.count ?? 0
        return {
          id: row.id,
          name: row.name,
          category: categoryLabel(row.category),
          status: lobbyDisplayStatus(players, row.max_players),
          players,
          maxPlayers: row.max_players,
          host: row.host?.pseudo ?? 'Inconnu'
        }
      })
      lobbiesStatus.value = 'loaded'
    } catch {
      lobbiesError.value = LOBBIES_ERROR
      lobbiesStatus.value = 'error'
    }
  }

  /**
   * Charge un salon et sa table de joueurs (page salon d'attente).
   *
   * `silent` sert au rafraîchissement Realtime : il n'affiche pas « Chargement… »
   * (ce qui démonterait le salon à chaque arrivée ou départ) et, sur une erreur
   * transitoire, conserve le dernier état connu plutôt que de vider la vue.
   */
  const fetchLobby = async (
    lobbyId: string,
    options: { silent?: boolean } = {}
  ): Promise<void> => {
    if (!options.silent) {
      lobbyStatus.value = 'pending'
      errorMessage.value = ''
    }

    try {
      const { data, error } = await supabase
        .from('lobbies')
        .select(LOBBY_DETAIL_COLUMNS)
        .eq('id', lobbyId)
        .single()

      if (error || !data) {
        if (options.silent) return
        lobby.value = null
        errorMessage.value = LOBBY_NOT_FOUND_ERROR
        lobbyStatus.value = 'error'
        return
      }

      const row = data as unknown as {
        id: string
        code: string
        name: string
        category: LobbyCategory
        access: LobbyAccess
        max_players: number
        powerups_enabled: boolean
        status: LobbyDetail['status']
        host_id: string | null
        lobby_players: Array<{
          id: string
          user_id: string
          is_host: boolean
          is_ready: boolean
          profile: { pseudo: string, xp: number } | null
        }> | null
      }

      const players: LobbyPlayer[] = (row.lobby_players ?? []).map(entry => {
        const pseudo = entry.profile?.pseudo ?? 'Joueur'
        return {
          id: entry.id,
          userId: entry.user_id,
          pseudo,
          initials: initialsOf(pseudo),
          // Le niveau se dérive de l'XP, il n'est jamais stocké.
          level: levelFromXp(entry.profile?.xp ?? 0),
          isHost: entry.is_host,
          isReady: entry.is_ready
        }
      })

      // L'hôte en tête, puis l'ordre d'arrivée renvoyé par la base.
      players.sort((a, b) => Number(b.isHost) - Number(a.isHost))

      lobby.value = {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        categoryLabel: categoryLabel(row.category),
        access: row.access,
        maxPlayers: row.max_players,
        powerupsEnabled: row.powerups_enabled,
        status: row.status,
        hostId: row.host_id,
        players
      }
      lobbyStatus.value = 'loaded'
    } catch {
      if (options.silent) return
      lobby.value = null
      errorMessage.value = LOBBY_NOT_FOUND_ERROR
      lobbyStatus.value = 'error'
    }
  }

  /**
   * Souscrit aux arrivées et départs de joueurs d'un salon (Supabase Realtime).
   *
   * Le filtre `lobby_id=eq.<id>` restreint le flux au salon courant. À chaque
   * changement sur `lobby_players`, `onChange` est appelé : la page relit alors
   * la liste (refetch silencieux) plutôt que d'appliquer le delta, car le payload
   * Realtime ne porte ni le pseudo ni l'XP du profil joint — qu'il faut de toute
   * façon relire pour afficher un joueur.
   *
   * Renvoie le canal ; l'appelant DOIT le passer à `unsubscribeLobbyPlayers` au
   * démontage, sinon la connexion Realtime reste ouverte (fuite de canaux).
   */
  const subscribeToLobbyPlayers = (
    lobbyId: string,
    onChange: () => void
  ): RealtimeChannel =>
    supabase
      .channel(`lobby-players:${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobby_players',
          filter: `lobby_id=eq.${lobbyId}`
        },
        () => onChange()
      )
      .subscribe()

  /** Ferme le canal Realtime et libère la connexion côté Supabase. */
  const unsubscribeLobbyPlayers = (channel: RealtimeChannel): void => {
    supabase.removeChannel(channel)
  }

  return {
    lobbies,
    lobbiesStatus,
    lobbiesError,
    lobby,
    lobbyStatus,
    pending,
    errorMessage,
    resolveUserId,
    createLobby,
    joinByCode,
    joinPublic,
    leaveLobby,
    startLobby,
    fetchPublicLobbies,
    fetchLobby,
    subscribeToLobbyPlayers,
    unsubscribeLobbyPlayers
  }
}
