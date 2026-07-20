import type { PlayerSummary } from '~/components/HubNav.vue'
import { levelFromXp, xpProgress } from '~/composables/useProgression'

/** Colonnes lues dans `public.profiles`. L'email n'y est pas : il vient de la session. */
export interface Profile {
  id: string
  pseudo: string
  avatar_url: string | null
  xp: number
  battlecoin_balance: number
  games_played: number
  games_won: number
  powerups_used: number
}

/**
 * Trois états explicites :
 * - `pending` : session ou profil en cours de résolution — on n'affirme rien.
 * - `loaded`  : `profile` est renseigné.
 * - `error`   : absence de session confirmée, ou profil introuvable.
 */
export type ProfileStatus = 'pending' | 'loaded' | 'error'

export const SESSION_ERROR = 'Session expirée. Reconnecte-toi pour accéder à ton profil.'
export const PROFILE_ERROR = 'Profil introuvable. Réessaie dans un instant.'

/**
 * Profil du joueur connecté, partagé par toute l'application via `useState` :
 * l'en-tête (layout) et la page profil lisent le même état, et la requête n'est
 * émise qu'une fois pour toute la navigation.
 *
 * Le chargement est déclenché au montage du premier consommateur et reste
 * idempotent — appeler `useProfile()` depuis plusieurs composants ne provoque
 * pas de requête supplémentaire.
 */
export function useProfile() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const profile = useState<Profile | null>('profile', () => null)
  const status = useState<ProfileStatus>('profile-status', () => 'pending')
  const errorMessage = useState<string>('profile-error', () => '')
  // Garde d'idempotence : évite deux requêtes concurrentes (layout + page).
  const inFlight = useState<boolean>('profile-in-flight', () => false)

  /**
   * `useSupabaseUser()` expose le JWT décodé (`JwtPayload`), pas un objet `User` :
   * l'identifiant du joueur est dans `sub`, jamais dans `id`.
   */
  const userId = computed(() => user.value?.sub ?? null)

  const fail = (message: string) => {
    profile.value = null
    errorMessage.value = message
    status.value = 'error'
  }

  /**
   * Lit la ligne `profiles`. RLS filtre déjà côté serveur ; le `.eq('id', ...)`
   * rend l'intention explicite. Fail closed : toute erreur ou absence de ligne
   * bascule sur « profil introuvable », jamais sur des valeurs par défaut.
   */
  const fetchProfile = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        fail(PROFILE_ERROR)
        return
      }

      profile.value = data as unknown as Profile
      errorMessage.value = ''
      status.value = 'loaded'
    } catch {
      // Fail closed : une exception réseau devient un message utilisateur sûr.
      fail(PROFILE_ERROR)
    }
  }

  /**
   * Résout l'identifiant du joueur, puis charge son profil.
   *
   * `getSession()` sert de source de vérité quand le ref `useSupabaseUser()`
   * n'est pas (encore) renseigné : l'attendre laissait la page bloquée en
   * `pending` indéfiniment.
   */
  const load = async () => {
    if (inFlight.value) return

    inFlight.value = true
    status.value = 'pending'
    errorMessage.value = ''

    try {
      let id = userId.value

      if (!id) {
        const { data } = await supabase.auth.getSession()
        id = data?.session?.user?.id ?? userId.value ?? null
      }

      if (!id) {
        fail(SESSION_ERROR)
        return
      }

      await fetchProfile(id)
    } catch {
      fail(SESSION_ERROR)
    } finally {
      inFlight.value = false
    }
  }

  /** Charge le profil s'il ne l'est pas déjà. Sans effet si une requête est en vol. */
  const ensureLoaded = () => (profile.value ? Promise.resolve() : load())

  /** Vide l'état partagé — à appeler à la déconnexion pour ne rien laisser traîner. */
  const reset = () => {
    profile.value = null
    errorMessage.value = ''
    status.value = 'pending'
  }

  /** Repli avatar : 2 premières lettres du pseudo, en majuscules. */
  const initials = computed(() => profile.value?.pseudo.trim().slice(0, 2).toUpperCase() || '?')

  const level = computed(() => levelFromXp(profile.value?.xp ?? 0))
  const xp = computed(() => xpProgress(profile.value?.xp ?? 0))

  /** Résumé destiné au chip d'en-tête. `null` tant que le profil n'est pas chargé. */
  const player = computed<PlayerSummary | null>(() =>
    profile.value
      ? {
          pseudo: profile.value.pseudo,
          initials: initials.value,
          level: level.value,
          xpPercent: xp.value.percent,
          battlecoins: profile.value.battlecoin_balance
        }
      : null
  )

  // Déclenché par le premier consommateur monté (layout ou page), puis inerte.
  onMounted(ensureLoaded)

  // Recharge si la session change en cours de route (déconnexion dans un autre
  // onglet, changement de compte). Pas d'`immediate` : le montage est couvert.
  watch(userId, (current, previous) => {
    if (current && current !== previous) load()
  })

  return {
    profile,
    status,
    errorMessage,
    userId,
    player,
    initials,
    level,
    xp,
    load,
    ensureLoaded,
    reset
  }
}
