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
  category: string
  categoryLabel: string
  questionText: string
  answers: Answer[]
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
        category: string
        question_text: string
        answers: Answer[] | null
      }

      return {
        roundId: row.round_id,
        roundNumber: row.round_number,
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
    fetchActiveRound,
    fetchQuestion,
    fetchLeaderboard,
    submitAnswer
  }
}
