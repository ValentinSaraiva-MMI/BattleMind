import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick, type Ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ProfilPage from '~/pages/profil.vue'

// Profil de référence : 6250 XP → niveau 13, barre à 250/500 (paliers de 500).
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

// `useSupabaseUser()` expose le JWT décodé : l'identifiant est dans `sub`, pas `id`.
const SESSION_CLAIMS = { sub: 'user-1', email: 'alex@battlemind.gg' }
// `getSession()` renvoie en revanche un vrai objet `User`, dont l'id est dans `id`.
const SESSION_USER = { id: 'user-1', email: 'alex@battlemind.gg' }

// On ne stubbe que la frontière réseau (client Supabase, session) et navigateTo :
// le vrai useProgression s'exécute (test d'intégration de la page).
let single: ReturnType<typeof vi.fn>
let eq: ReturnType<typeof vi.fn>
let select: ReturnType<typeof vi.fn>
let from: ReturnType<typeof vi.fn>
let signOut: ReturnType<typeof vi.fn>
let getSession: ReturnType<typeof vi.fn>
let navigateToMock: ReturnType<typeof vi.fn>

/**
 * Référence de session pilotable par test. `useSupabaseUser()` étant hydraté de
 * façon asynchrone en production, les tests peuvent la laisser à `null` puis la
 * renseigner pour rejouer l'hydratation tardive.
 */
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
  select = vi.fn(() => ({ eq }))
  from = vi.fn(() => ({ select }))
  signOut = vi.fn().mockResolvedValue({ error: null })
  getSession = vi.fn().mockResolvedValue({ data: { session: { user: SESSION_USER } } })
  navigateToMock = vi.fn()
  userRef = ref<typeof SESSION_CLAIMS | null>(SESSION_CLAIMS)

  vi.stubGlobal('useSupabaseClient', () => ({ from, auth: { signOut, getSession } }))
  vi.stubGlobal('useSupabaseUser', () => userRef)
  vi.stubGlobal('navigateTo', navigateToMock)
  vi.stubGlobal('useHead', () => {})
  // `useProfile()` partage son état via useState : un store neuf par test.
  vi.stubGlobal('useState', makeUseState())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const global = {
  stubs: {
    HubNav: { name: 'HubNav', props: ['player'], template: '<header />' },
    AppFooter: { template: '<footer />' },
    NuxtLink: { template: '<a><slot /></a>' }
  }
}

/** Monte la page et attend la résolution du chargement du profil. */
const mountLoaded = async () => {
  const wrapper = mount(ProfilPage, { global })
  await flushPromises()
  return wrapper
}

const findLogout = (wrapper: VueWrapper) =>
  wrapper.findAll('button').find(button => button.text().includes('Déconnexion'))!

describe('page profil — chargement des données', () => {
  it('interroge le profil du joueur connecté', async () => {
    await mountLoaded()

    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('*')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(single).toHaveBeenCalled()
  })

  it('annonce le chargement avant la réponse', async () => {
    single.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(ProfilPage, { global })
    await nextTick()

    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('Chargement')
    // Un h1 doit exister dans tous les états.
    expect(wrapper.findAll('h1')).toHaveLength(1)
  })

  it('affiche une alerte quand le profil est introuvable', async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    const wrapper = await mountLoaded()

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Profil introuvable')
    expect(wrapper.find('.hero').exists()).toBe(false)
  })

  it('reste fail closed si la requête lève une exception réseau', async () => {
    single.mockRejectedValue(new Error('network down'))
    const wrapper = await mountLoaded()

    expect(wrapper.find('[role="alert"]').text()).toContain('Profil introuvable')
  })

  it('reste en attente tant que la session n\'est pas résolue, sans alerter', async () => {
    // Session non hydratée au montage : `user` est null mais rien n'est encore confirmé.
    userRef.value = null
    getSession.mockReturnValue(new Promise(() => {}))

    const wrapper = mount(ProfilPage, { global })
    await nextTick()

    expect(wrapper.find('[role="status"]').exists(), 'état pending').toBe(true)
    expect(wrapper.find('[role="alert"]').exists(), 'aucune alerte pendant le pending').toBe(false)
    expect(wrapper.text()).not.toContain('Session expirée')
    expect(from).not.toHaveBeenCalled()
  })

  it('alerte seulement une fois l\'absence de session confirmée', async () => {
    userRef.value = null
    let resolveSession: (value: unknown) => void = () => {}
    getSession.mockReturnValue(new Promise(resolve => {
      resolveSession = resolve
    }))

    const wrapper = mount(ProfilPage, { global })
    await nextTick()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    resolveSession({ data: { session: null } })
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Session expirée')
    expect(from).not.toHaveBeenCalled()
  })

  it('charge le profil depuis la session quand le ref user reste nul', async () => {
    // Régression : `useSupabaseUser()` peut ne jamais se renseigner (hydratation
    // déjà settled côté module). Attendre le ref bloquait la page sur « Chargement ».
    userRef.value = null

    const wrapper = await mountLoaded()

    expect(getSession).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(wrapper.find('[role="status"]').exists(), 'ne reste pas bloqué en pending').toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('h1').text()).toContain('AlexTheQuizz')
  })

  it('ne consulte pas getSession quand la session est déjà hydratée', async () => {
    await mountLoaded()

    expect(getSession).not.toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('recharge le profil si la session change en cours de route', async () => {
    await mountLoaded()
    expect(eq).toHaveBeenCalledTimes(1)

    userRef.value = { sub: 'user-2', email: 'autre@battlemind.gg' }
    await flushPromises()

    expect(eq).toHaveBeenCalledTimes(2)
    expect(eq).toHaveBeenLastCalledWith('id', 'user-2')
  })
})

describe('page profil — restitution des données réelles', () => {
  it('affiche le pseudo dans un h1 unique', async () => {
    const h1s = (await mountLoaded()).findAll('h1')

    expect(h1s).toHaveLength(1)
    expect(h1s[0]!.text()).toContain('AlexTheQuizz')
  })

  it("affiche l'email de la session, jamais issu de la table profiles", async () => {
    expect((await mountLoaded()).text()).toContain('alex@battlemind.gg')
  })

  it('déduit le niveau et la barre XP depuis useProgression', async () => {
    const wrapper = await mountLoaded()

    expect(wrapper.text()).toContain('Niveau 13')

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('250')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('500')
    expect(bar.attributes('aria-label')).toBeTruthy()
    expect(wrapper.text()).toContain('250 / 500 XP')
  })

  // Boutique hors périmètre : le solde n'a aucun usage, il passe sous voile.
  it('voile le solde battlecoin et le masque aux technologies d’assistance', async () => {
    const wrapper = await mountLoaded()
    const tiles = wrapper.findAll('.stub--tile')

    expect(tiles).toHaveLength(2)

    const balance = tiles[0]!
    expect(balance.text()).toContain('Solde battlecoin')
    // L'aperçu reste alimenté par le vrai profil, jamais par une valeur en dur.
    expect(balance.text()).toContain('1,250')
    expect(balance.get('.tile').attributes('aria-hidden')).toBe('true')
    expect(balance.get('.stub__veil').text()).toBe('Bientôt disponible')
  })

  it('affiche les 4 statistiques de carrière', async () => {
    const stats = (await mountLoaded()).findAll('.stat')

    expect(stats).toHaveLength(4)
    expect(stats.map(s => s.text())).toEqual([
      expect.stringContaining('142'),
      expect.stringContaining('89'),
      expect.stringContaining('62,7%'),
      expect.stringContaining('57')
    ])
  })

  // L'en-tête est rendu par le layout, plus par la page : sa couverture vit
  // dans tests/default-layout.spec.ts.
})

describe('page profil — profil neuf (REC-012)', () => {
  const newProfile = { ...PROFILE, xp: 0, battlecoin_balance: 0, games_played: 0, games_won: 0, powerups_used: 0 }

  it('affiche « — » comme taux de réussite, sans division par zéro', async () => {
    single.mockResolvedValue({ data: newProfile, error: null })
    const wrapper = await mountLoaded()

    const winrate = wrapper.findAll('.stat')[2]!
    expect(winrate.text()).toContain('Taux de réussite')
    expect(winrate.text()).toContain('—')
    expect(winrate.text()).not.toContain('0%')
    expect(winrate.text()).not.toContain('NaN')
  })

  it('double le « — » d\'un texte pour lecteur d\'écran (RGAA 3.1)', async () => {
    single.mockResolvedValue({ data: newProfile, error: null })
    const wrapper = await mountLoaded()

    expect(wrapper.findAll('.stat')[2]!.find('.sr-only').text()).toContain('aucune partie jouée')
  })

  it('démarre au niveau 1 avec une barre vide à 0 XP', async () => {
    single.mockResolvedValue({ data: newProfile, error: null })
    const wrapper = await mountLoaded()

    expect(wrapper.text()).toContain('Niveau 1')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
  })
})

describe('page profil — avatar', () => {
  it('replie sur les 2 premières lettres du pseudo quand avatar_url est NULL', async () => {
    const wrapper = await mountLoaded()
    const fallback = wrapper.get('.hero__avatar')

    expect(fallback.element.tagName).toBe('P')
    expect(fallback.text()).toBe('AL')
    // Décoratif : le pseudo est déjà porté par le h1 voisin.
    expect(fallback.attributes('aria-hidden')).toBe('true')
  })

  it('affiche l\'image quand avatar_url est renseignée', async () => {
    single.mockResolvedValue({
      data: { ...PROFILE, avatar_url: 'https://cdn.example/avatar.png' },
      error: null
    })
    const wrapper = await mountLoaded()
    const avatar = wrapper.get('.hero__avatar')

    expect(avatar.element.tagName).toBe('IMG')
    expect(avatar.attributes('src')).toBe('https://cdn.example/avatar.png')
    expect(avatar.attributes('alt')).toBe('')
  })
})

describe('page profil — déconnexion', () => {
  it('appelle signOut puis redirige vers /login', async () => {
    const wrapper = await mountLoaded()

    await findLogout(wrapper).trigger('click')
    await flushPromises()

    expect(signOut).toHaveBeenCalled()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('désactive le bouton et annonce aria-busy pendant la déconnexion', async () => {
    let resolvePending: (value: unknown) => void = () => {}
    signOut.mockReturnValue(new Promise(resolve => {
      resolvePending = resolve
    }))
    const wrapper = await mountLoaded()

    await findLogout(wrapper).trigger('click')
    await nextTick()

    const button = findLogout(wrapper)
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(navigateToMock).not.toHaveBeenCalled()

    resolvePending({ error: null })
    await flushPromises()
  })

  it('alerte sans rediriger si la déconnexion échoue', async () => {
    signOut.mockResolvedValue({ error: { message: 'boom' } })
    const wrapper = await mountLoaded()

    await findLogout(wrapper).trigger('click')
    await flushPromises()

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain('La déconnexion a échoué')
  })

  it('reste accessible quand le profil est introuvable', async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    const wrapper = await mountLoaded()

    await findLogout(wrapper).trigger('click')
    await flushPromises()

    expect(signOut).toHaveBeenCalled()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})

describe('page profil — accessibilité (RGAA 4.1.2)', () => {
  it('rend la déconnexion comme un vrai bouton', async () => {
    const button = findLogout(await mountLoaded())

    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
  })

  it('ne saute aucun niveau de titre', async () => {
    const levels = (await mountLoaded())
      .findAll('h1, h2, h3, h4')
      .map(h => Number(h.element.tagName[1]))

    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1)
    }
  })

  it('donne une alternative vide à toutes les icônes décoratives', async () => {
    for (const img of (await mountLoaded()).findAll('img')) {
      expect(img.attributes('alt')).toBe('')
      expect(img.attributes('title')).toBeUndefined()
      expect(img.attributes('aria-label')).toBeUndefined()
    }
  })

  it('conserve les blocs hors périmètre inertes', async () => {
    const wrapper = await mountLoaded()

    expect(wrapper.findAll('.stub__veil').length).toBeGreaterThan(0)
    expect(wrapper.get('.badges__all').attributes('disabled')).toBeDefined()
  })
})
