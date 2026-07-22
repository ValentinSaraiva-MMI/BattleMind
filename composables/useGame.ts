import { categoryLabel } from '~/utils/lobby'
import { rankPlayers, type PlayerScore, type RankedPlayer } from '~/utils/game'

/** Une réponse proposée, telle que servie par `get_round_question` (jamais la bonne). */
export interface Answer {
  key: string
  text: string
}

/** Question expurgée d'un round : l'énoncé et ses réponses, sans `correct_key`. */
export interface RoundQuestion {
  roundId: string
  roundNumber: number
  startedAt: string
  category: string
  categoryLabel: string
  questionText: string
  answers: Answer[]
}

/** État de la partie côté serveur, pour situer le joueur (hôte ? déjà terminée ?). */
export interface GameMeta {
  /** Hôte du lobby : seul lui fait avancer la partie (métronome). */
  hostId: string | null
  status: 'waiting' | 'in_progress' | 'finished'
}

/** Résultat de `next_round` : soit la partie continue (round suivant), soit elle se termine. */
export interface NextRoundResult {
  finished: boolean
  roundId: string | null
  roundNumber: number | null
}

/** Verdict renvoyé par l'Edge Function `submit_answer` après validation serveur. */
export interface AnswerResult {
  isCorrect: boolean
  correctKey: string
  score: number
  streak: number
}

// Messages utilisateur : aucun détail technique ne remonte à l'écran (fail closed).
export const START_GAME_ERROR = "Impossible de lancer l'arène. Réessaie dans un instant."
export const ROUND_NOT_FOUND_ERROR = "Cette partie n'a pas encore de question active."
export const QUESTION_ERROR = 'Impossible de charger la question. Réessaie dans un instant.'
export const ANSWER_ERROR = 'Ta réponse n’a pas pu être enregistrée. Réessaie.'
export const NEXT_ROUND_ERROR = "La partie n'a pas pu passer à la question suivante."

/**
 * Accès à la boucle de jeu : lancement de la partie, chargement de la question
 * active, classement, et soumission d'une réponse.
 *
 * La base fait autorité de bout en bout : `start_game` et `get_round_question`
 * sont des fonctions Postgres `security definer` (l'une réservée à l'hôte,
 * l'autre aux membres du lobby), et la validation d'une réponse appartient
 * EXCLUSIVEMENT à l'Edge Function `submit_answer` — `correct_key` ne quitte
 * jamais la base avant que le joueur ait verrouillé son choix. Ce composable ne
 * fait qu'appeler ces éléments ; le tri du classement (`rankPlayers`) est la
 * seule logique locale, et elle est pure.
 */
export function useGame() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  /** Action réseau en cours (lancement, soumission). */
  const pending = ref(false)
  const errorMessage = ref('')

  /** Identifiant du joueur courant (voir `useLobby.resolveUserId`). */
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
   * Lance la partie (hôte uniquement). `start_game` passe le lobby en
   * `in_progress`, crée le round 1 et renvoie son identifiant. Le contrôle
   * « seul l'hôte » est fait côté serveur ; le masquage du bouton n'est qu'un
   * confort d'interface. Renvoie l'id du round, ou `null` en cas d'échec.
   */
  const startGame = async (lobbyId: string): Promise<string | null> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const { data, error } = await supabase.rpc('start_game', { p_lobby_id: lobbyId })
      if (error || !data) return fail(START_GAME_ERROR)

      return data as string
    } catch {
      return fail(START_GAME_ERROR)
    } finally {
      pending.value = false
    }
  }

  /**
   * Identifiant du round le plus récent d'une partie — le round en cours.
   *
   * Sert de repli quand la page de jeu est ouverte sans `?round=` (navigation
   * directe, rechargement) : on relit l'état autoritatif en base plutôt que de
   * dépendre de l'URL. Renvoie `null` si la partie n'a pas encore de round.
   */
  const fetchActiveRound = async (lobbyId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('game_rounds')
        .select('id')
        .eq('lobby_id', lobbyId)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const round = data as { id: string } | null
      if (error || !round) return null

      return round.id
    } catch {
      return null
    }
  }

  /**
   * Lit l'état de la partie : qui est l'hôte, et où en est le lobby.
   *
   * `host_id` sert à désigner le métronome — seul l'hôte fait défiler les
   * questions (voir `next_round`). `status` permet à la page de jeu de montrer
   * directement l'écran de fin si la partie est déjà terminée (rechargement après
   * le dernier round). La RLS autorise déjà un membre à lire son lobby. Renvoie
   * `null` en cas d'échec — l'appelant reste fail closed (personne n'est hôte).
   */
  const fetchGameMeta = async (lobbyId: string): Promise<GameMeta | null> => {
    try {
      const { data, error } = await supabase
        .from('lobbies')
        .select('host_id, status')
        .eq('id', lobbyId)
        .maybeSingle()

      const row = data as { host_id: string | null, status: GameMeta['status'] } | null
      if (error || !row) return null

      return { hostId: row.host_id, status: row.status }
    } catch {
      return null
    }
  }

  /**
   * Fait avancer la partie d'un round (HÔTE uniquement — contrôlé côté serveur).
   *
   * `next_round` clôt le round courant et, soit crée le suivant, soit termine la
   * partie au 10ᵉ. C'est le métronome : la page l'appelle automatiquement à
   * l'expiration du timer, jamais sur une action humaine. On ne remonte pas de
   * message ici (l'appel est automatique) ; la page décide quoi afficher à partir
   * du résultat. Renvoie `null` en cas d'échec (réseau, ou appelant non-hôte).
   */
  const nextRound = async (lobbyId: string): Promise<NextRoundResult | null> => {
    try {
      const { data, error } = await supabase.rpc('next_round', { p_lobby_id: lobbyId })

      const row = data as { finished?: boolean, round_id?: string, round_number?: number } | null
      if (error || !row) return null

      return {
        finished: Boolean(row.finished),
        roundId: row.round_id ?? null,
        roundNumber: row.round_number ?? null
      }
    } catch {
      return null
    }
  }

  /**
   * Charge l'énoncé et les réponses d'un round via `get_round_question`.
   *
   * La fonction Postgres renvoie la question EXPURGÉE (jamais `correct_key`) et
   * vérifie côté serveur que l'appelant est bien membre du lobby. Renvoie `null`
   * en cas d'échec ou d'accès refusé.
   */
  const fetchQuestion = async (roundId: string): Promise<RoundQuestion | null> => {
    try {
      const { data, error } = await supabase.rpc('get_round_question', { p_round_id: roundId })
      if (error || !data) return fail(QUESTION_ERROR)

      const row = data as {
        round_id: string
        round_number: number
        started_at: string
        category: string
        question_text: string
        answers: Answer[] | null
      }

      return {
        roundId: row.round_id,
        roundNumber: row.round_number,
        startedAt: row.started_at,
        category: row.category,
        categoryLabel: categoryLabel(row.category),
        questionText: row.question_text,
        answers: row.answers ?? []
      }
    } catch {
      return fail(QUESTION_ERROR)
    }
  }

  /**
   * Classement courant de l'arène : les joueurs du lobby triés par score.
   *
   * Le score vit dans `lobby_players` (écrit uniquement côté serveur par
   * `submit_answer`) ; le tri et le rang sont recalculés à l'affichage par
   * `rankPlayers`, jamais stockés. Renvoie une liste vide en cas d'erreur de
   * lecture — le classement est de l'information secondaire, il ne doit pas
   * faire échouer l'affichage de la question.
   */
  const fetchLeaderboard = async (lobbyId: string): Promise<RankedPlayer[]> => {
    try {
      const { data, error } = await supabase
        .from('lobby_players')
        .select('user_id, score, profile:profiles(pseudo)')
        .eq('lobby_id', lobbyId)

      if (error || !data) return []

      const rows = data as unknown as Array<{
        user_id: string
        score: number
        profile: { pseudo: string } | null
      }>

      const scores: PlayerScore[] = rows.map(row => ({
        userId: row.user_id,
        pseudo: row.profile?.pseudo ?? 'Joueur',
        score: row.score
      }))

      const meId = await resolveUserId()
      return rankPlayers(scores, meId)
    } catch {
      return []
    }
  }

  /**
   * Soumet la réponse du joueur à l'Edge Function `submit_answer`, qui fait
   * autorité : elle seule connaît `correct_key`, valide juste/faux, met à jour
   * le score, et empêche la double réponse (`unique (round_id, user_id)`).
   *
   * On n'envoie QUE `round_id` + `selected_key` : jamais l'identité du joueur
   * (déduite du JWT côté serveur) ni un score. Renvoie le verdict, ou `null`
   * en cas d'échec.
   */
  const submitAnswer = async (
    roundId: string,
    selectedKey: string
  ): Promise<AnswerResult | null> => {
    pending.value = true
    errorMessage.value = ''

    try {
      const { data, error } = await supabase.functions.invoke('submit_answer', {
        body: { round_id: roundId, selected_key: selectedKey }
      })

      const result = data as {
        is_correct: boolean
        correct_key: string
        score: number
        streak: number
      } | null

      if (error || !result) return fail(ANSWER_ERROR)

      return {
        isCorrect: result.is_correct,
        correctKey: result.correct_key,
        score: result.score,
        streak: result.streak
      }
    } catch {
      return fail(ANSWER_ERROR)
    } finally {
      pending.value = false
    }
  }

  return {
    pending,
    errorMessage,
    resolveUserId,
    startGame,
    fetchGameMeta,
    fetchActiveRound,
    nextRound,
    fetchQuestion,
    fetchLeaderboard,
    submitAnswer
  }
}
