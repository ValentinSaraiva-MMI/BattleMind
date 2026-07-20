// Logique pure du domaine « lobby » : validation du code, bornes du stepper,
// libellés des catégories. Aucun accès réseau ici — le composable `useLobby`
// s'en charge. Séparation identique à `utils/authErrors.ts` / `useAuth`.

/** Les 5 valeurs de l'enum Postgres `public.question_category`. */
export type LobbyCategory = 'culture_generale' | 'sciences' | 'histoire' | 'musique' | 'tech'

/** Les 2 valeurs de l'enum Postgres `public.lobby_access`. */
export type LobbyAccess = 'public' | 'private'

export interface LobbyCategoryOption {
  value: LobbyCategory
  /** Libellé complet, affiché sur les cartes et le panneau paramètres. */
  label: string
  /** Libellé court des boutons de la modale (maquette : « CULTURE »). */
  short: string
  icon: string
}

/** Ordre de la maquette. Source unique des catégories pour toute l'application. */
export const LOBBY_CATEGORIES: readonly LobbyCategoryOption[] = [
  { value: 'culture_generale', label: 'Culture générale', short: 'Culture', icon: '/icons/category-culture.svg' },
  { value: 'sciences', label: 'Sciences', short: 'Sciences', icon: '/icons/category-sciences.svg' },
  { value: 'histoire', label: 'Histoire', short: 'Histoire', icon: '/icons/category-histoire.svg' },
  { value: 'musique', label: 'Musique', short: 'Musique', icon: '/icons/category-musique.svg' },
  { value: 'tech', label: 'Tech', short: 'Tech', icon: '/icons/category-tech.svg' }
] as const

/**
 * Libellé lisible d'une catégorie. Repli sur la valeur brute plutôt que sur une
 * chaîne vide : mieux vaut afficher `sciences` qu'un blanc si l'enum évolue en
 * base avant le déploiement du front.
 */
export const categoryLabel = (value: string): string =>
  LOBBY_CATEGORIES.find(category => category.value === value)?.label ?? value

/** Bornes de la maquette : le stepper ne descend pas sous 2 ni ne dépasse 6. */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

/**
 * Ramène un nombre de joueurs dans les bornes autorisées. Toute valeur non
 * finie (NaN, Infinity) retombe sur `MAX_PLAYERS`, la valeur par défaut de la
 * maquette — fail closed plutôt que de propager un NaN jusqu'à l'insert.
 */
export const clampMaxPlayers = (value: number): number => {
  if (!Number.isFinite(value)) return MAX_PLAYERS
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.trunc(value)))
}

export const canDecrementPlayers = (value: number): boolean => value > MIN_PLAYERS
export const canIncrementPlayers = (value: number): boolean => value < MAX_PLAYERS

/** Longueur du code de partie généré par la base (ex. « 654321 »). */
export const LOBBY_CODE_LENGTH = 6

/**
 * Nettoie une saisie utilisateur : ne garde que les chiffres et tronque à 6.
 * Absorbe les copier-coller mis en forme (« 654 321 », « 654-321 »).
 */
export const normalizeLobbyCode = (raw: string): string =>
  (raw ?? '').replace(/\D/g, '').slice(0, LOBBY_CODE_LENGTH)

/** Un code valide fait exactement 6 chiffres. Contrôle de confort côté client. */
export const isValidLobbyCode = (raw: string): boolean =>
  normalizeLobbyCode(raw).length === LOBBY_CODE_LENGTH

/** Mise en forme d'affichage de la maquette : « 654321 » → « 654 321 ». */
export const formatLobbyCode = (code: string): string => {
  const normalized = normalizeLobbyCode(code)
  if (normalized.length !== LOBBY_CODE_LENGTH) return code ?? ''
  return `${normalized.slice(0, 3)} ${normalized.slice(3)}`
}

/**
 * Statut d'affichage d'une carte de partie. La capacité réelle est garantie
 * côté serveur par `join_lobby_by_code` : ce calcul n'est là que pour le confort
 * visuel (griser la carte), jamais comme contrôle de sécurité.
 */
export const lobbyDisplayStatus = (players: number, maxPlayers: number): 'waiting' | 'full' =>
  players >= maxPlayers ? 'full' : 'waiting'
