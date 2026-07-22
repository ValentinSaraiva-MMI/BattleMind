// Logique pure du domaine « partie » : classement trié, état visuel d'une
// réponse, libellé de progression. Aucun accès réseau ici — le composable
// `useGame` s'en charge. Même séparation que `utils/lobby.ts` / `useLobby`.

/** Nombre de questions d'une partie. Voir la contrainte `round_number between 1 and 10`. */
export const TOTAL_ROUNDS = 10

/** Durée d'une question (s). DOIT égaler `ROUND_DURATION_S` de l'Edge Function
 *  `submit_answer`, seule autorité sur le hors-délai ; ici, pur affichage. */
export const ROUND_DURATION_S = 10

/**
 * Secondes restantes, dérivées du départ SERVEUR (`started_at`), jamais d'un
 * compteur local : un rechargement retombe au bon temps et (3c) tous les clients
 * affichent le même décompte. Borné [0, durée], arrondi au supérieur ; entrée
 * invalide → 0 (fail closed).
 */
export const remainingSeconds = (
  startedAt: string | number | Date,
  now: number,
  duration: number = ROUND_DURATION_S
): number => {
  const start = new Date(startedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(now)) return 0
  const left = duration - (now - start) / 1000
  if (!Number.isFinite(left)) return 0
  return Math.max(0, Math.min(duration, Math.ceil(left)))
}

/**
 * Le round est-il le dernier ? Pur, pour l'affichage (« dernière question ») ;
 * la clôture réelle appartient à `next_round`. Borne haute incluse, robuste au
 * `NaN` et aux décimales.
 */
export const isLastRound = (roundNumber: number, total: number = TOTAL_ROUNDS): boolean =>
  Number.isFinite(roundNumber) && Math.trunc(roundNumber) >= total

/** Ligne brute de `lobby_players` (jointe au pseudo) servant au classement. */
export interface PlayerScore {
  userId: string
  pseudo: string
  score: number
}

/** Joueur classé, prêt pour l'affichage de la colonne « Classement de l'arène ». */
export interface RankedPlayer {
  userId: string
  pseudo: string
  /** Repli avatar : 2 premières lettres du pseudo, en majuscules. */
  initials: string
  score: number
  /** Rang 1-based par position (les ex æquo reçoivent des rangs distincts). */
  rank: number
  /** Vrai pour le joueur courant, pour surligner sa ligne. */
  isMe: boolean
}

/** Repli avatar : 2 premières lettres du pseudo, en majuscules (idem grille du salon). */
export const initialsOf = (pseudo: string): string => pseudo.trim().slice(0, 2).toUpperCase() || '?'

/**
 * Trie les joueurs par score décroissant et leur attribue un rang.
 *
 * Le classement est TOUJOURS recalculé à l'affichage depuis le score courant :
 * il n'est jamais stocké (règle « ne jamais stocker une valeur dérivée »). Le
 * tri se fait ici, en pur, pour rester testable indépendamment du réseau.
 *
 * Départage déterministe des ex æquo par pseudo (ordre alphabétique, insensible
 * à la casse) afin que l'affichage soit stable d'un rendu à l'autre.
 */
export const rankPlayers = (players: PlayerScore[], meId: string | null): RankedPlayer[] =>
  [...players]
    .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo))
    .map((player, index) => ({
      userId: player.userId,
      pseudo: player.pseudo,
      initials: initialsOf(player.pseudo),
      score: player.score,
      rank: index + 1,
      isMe: Boolean(meId) && player.userId === meId
    }))

/** État visuel d'un bouton de réponse une fois la question verrouillée. */
export type AnswerState = 'idle' | 'correct' | 'incorrect'

/** Verdict du serveur : la réponse choisie et la bonne réponse. */
export interface AnswerOutcome {
  selectedKey: string
  correctKey: string
}

/**
 * État d'un bouton de réponse donné le verdict serveur.
 *
 * Tant qu'aucune réponse n'a été validée (`outcome` nul), tous les boutons sont
 * neutres. Une fois le verdict connu : la bonne réponse passe au vert, et le
 * choix du joueur passe au rouge s'il s'est trompé — jamais les deux à la fois
 * puisque, s'il a bon, son choix EST la bonne réponse.
 */
export const answerState = (key: string, outcome: AnswerOutcome | null): AnswerState => {
  if (!outcome) return 'idle'
  if (key === outcome.correctKey) return 'correct'
  if (key === outcome.selectedKey) return 'incorrect'
  return 'idle'
}

/**
 * Progression de la partie, façon maquette : « 08/10 ». Le numéro courant est
 * complété à la largeur du total (2 chiffres pour 10 questions), et borné dans
 * [1, total] pour ne jamais afficher « 00/10 » ni « 11/10 » sur une donnée
 * incohérente (fail closed).
 */
export const formatRoundProgress = (roundNumber: number, total: number = TOTAL_ROUNDS): string => {
  const width = String(total).length
  const safe = Number.isFinite(roundNumber) ? Math.min(total, Math.max(1, Math.trunc(roundNumber))) : 1
  return `${String(safe).padStart(width, '0')}/${total}`
}
