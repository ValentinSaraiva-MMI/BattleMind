// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent, type Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useProfile } from '~/composables/useProfile'

const PROFILE = {
  id: 'user-1',
  pseudo: 'AlexTheQuizz',
  avatar_url: null as string | null,
  xp: 6250,
  battlecoin_balance: 1250,
  games_played: 142,
  games_won: 89,
  powerups_used: 57
}

// `useSupabaseUser()` expose le JWT décodé : l'identifiant est dans `sub`.
const SESSION_CLAIMS = { sub: 'user-1', email: 'alex@battlemind.gg' }
// `getSession()` renvoie un vrai objet `User`, dont l'id est dans `id`.
const SESSION_USER = { id: 'user-1', email: 'alex@battlemind.gg' }

let single: ReturnType<typeof vi.fn>
let eq: ReturnType<typeof vi.fn>
let from: ReturnType<typeof vi.fn>
let getSession: ReturnType<typeof vi.fn>
let userRef: Ref<typeof SESSION_CLAIMS | null>

/** Équivalent minimal de `useState` de Nuxt : un store clé → ref, isolé par test. */
const makeUseState = () => {
  const store = new Map<string, Ref<unknown>>()
  return <T>(key: string, init?: () => T): Ref<T> => {
    if (!store.has(key)) store.set(key, ref(init ? init() : null) as Ref<unknown>)
    return store.get(key) as Ref<T>
  }
}

beforeEach(() => {
  single = vi.fn().mockResolvedValue({ data: { ...PROFILE }, error: null })
  eq = vi.fn(() => ({ single }))
  from = vi.fn(() => ({ select: () => ({ eq }) }))
  getSession = vi.fn().mockResolvedValue({ data: { session: { user: SESSION_USER } } })
  userRef = ref<typeof SESSION_CLAIMS | null>(SESSION_CLAIMS)

  vi.stubGlobal('useSupabaseClient', () => ({ from, auth: { getSession } }))
  vi.stubGlobal('useSupabaseUser', () => userRef)
  vi.stubGlobal('useState', makeUseState())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Monte `n` composants consommant le composable, comme le font en production le
 * layout et la page profil. Renvoie le résultat du premier.
 */
const mountConsumers = async (n = 1) => {
  let first: ReturnType<typeof useProfile> | undefined
  const Consumer = defineComponent({
    setup() {
      const api = useProfile()
      first ??= api
      return () => null
    }
  })

  const wrappers = Array.from({ length: n }, () => mount(Consumer))
  await flushPromises()

  return { api: first!, wrappers }
}

describe('useProfile — résolution de session', () => {
  it('charge le profil depuis `sub` sans consulter getSession', async () => {
    const { api } = await mountConsumers()

    expect(getSession).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(api.status.value).toBe('loaded')
    expect(api.profile.value).toMatchObject({ pseudo: 'AlexTheQuizz' })
  })

  it('bascule sur getSession quand le ref user reste nul', async () => {
    userRef.value = null
    const { api } = await mountConsumers()

    expect(getSession).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(api.status.value).toBe('loaded')
  })

  it('reste en pending tant que la session n\'est pas résolue', async () => {
    userRef.value = null
    getSession.mockReturnValue(new Promise(() => {}))

    const { api } = await mountConsumers()

    expect(api.status.value).toBe('pending')
    expect(api.errorMessage.value).toBe('')
    expect(from).not.toHaveBeenCalled()
  })

  it('passe en erreur une fois l\'absence de session confirmée', async () => {
    userRef.value = null
    getSession.mockResolvedValue({ data: { session: null } })

    const { api } = await mountConsumers()

    expect(api.status.value).toBe('error')
    expect(api.errorMessage.value).toContain('Session expirée')
    expect(from).not.toHaveBeenCalled()
  })
})

describe('useProfile — état partagé', () => {
  it('n\'émet qu\'une seule requête pour plusieurs consommateurs', async () => {
    // Reproduit le cas réel : le layout et la page profil montent ensemble.
    const { api } = await mountConsumers(3)

    expect(from).toHaveBeenCalledTimes(1)
    expect(api.status.value).toBe('loaded')
  })

  it('ne recharge pas un profil déjà en mémoire', async () => {
    const { api } = await mountConsumers()
    expect(from).toHaveBeenCalledTimes(1)

    await api.ensureLoaded()

    expect(from).toHaveBeenCalledTimes(1)
  })

  it('recharge quand la session change de compte', async () => {
    const { api } = await mountConsumers()
    expect(eq).toHaveBeenCalledTimes(1)

    userRef.value = { sub: 'user-2', email: 'autre@battlemind.gg' }
    await flushPromises()

    expect(eq).toHaveBeenCalledTimes(2)
    expect(eq).toHaveBeenLastCalledWith('id', 'user-2')
    expect(api.status.value).toBe('loaded')
  })

  it('vide l\'état à la déconnexion', async () => {
    const { api } = await mountConsumers()
    expect(api.profile.value).not.toBeNull()

    api.reset()

    expect(api.profile.value).toBeNull()
    expect(api.status.value).toBe('pending')
    expect(api.player.value).toBeNull()
  })
})

describe('useProfile — erreurs de chargement', () => {
  it('signale un profil introuvable', async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    const { api } = await mountConsumers()

    expect(api.status.value).toBe('error')
    expect(api.errorMessage.value).toContain('Profil introuvable')
    expect(api.profile.value).toBeNull()
  })

  it('reste fail closed sur exception réseau', async () => {
    single.mockRejectedValue(new Error('network down'))
    const { api } = await mountConsumers()

    expect(api.status.value).toBe('error')
    expect(api.errorMessage.value).toContain('Profil introuvable')
  })
})

describe('useProfile — dérivations pour le chip', () => {
  it('compose le résumé joueur depuis useProgression', async () => {
    const { api } = await mountConsumers()

    // 6250 XP → niveau 13, barre à 250/500 soit 50 %.
    expect(api.player.value).toEqual({
      pseudo: 'AlexTheQuizz',
      initials: 'AL',
      level: 13,
      xpPercent: 50,
      battlecoins: 1250
    })
  })

  it('laisse le résumé à null tant que le profil n\'est pas chargé', async () => {
    userRef.value = null
    getSession.mockReturnValue(new Promise(() => {}))

    const { api } = await mountConsumers()

    expect(api.player.value).toBeNull()
    expect(api.initials.value).toBe('?')
  })

  it('dérive les initiales sur 2 lettres majuscules', async () => {
    single.mockResolvedValue({ data: { ...PROFILE, pseudo: 'zed' }, error: null })
    const { api } = await mountConsumers()

    expect(api.initials.value).toBe('ZE')
  })
})
