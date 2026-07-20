// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, type Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import DefaultLayout from '~/layouts/default.vue'
import HubNav from '~/components/HubNav.vue'

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

const SESSION_CLAIMS = { sub: 'user-1', email: 'alex@battlemind.gg' }

let single: ReturnType<typeof vi.fn>
let from: ReturnType<typeof vi.fn>
let userRef: Ref<typeof SESSION_CLAIMS | null>

const makeUseState = () => {
  const store = new Map<string, Ref<unknown>>()
  return <T>(key: string, init?: () => T): Ref<T> => {
    if (!store.has(key)) store.set(key, ref(init ? init() : null) as Ref<unknown>)
    return store.get(key) as Ref<T>
  }
}

beforeEach(() => {
  single = vi.fn().mockResolvedValue({ data: { ...PROFILE }, error: null })
  from = vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) }))
  userRef = ref<typeof SESSION_CLAIMS | null>(SESSION_CLAIMS)

  vi.stubGlobal('useSupabaseClient', () => ({
    from,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }
  }))
  vi.stubGlobal('useSupabaseUser', () => userRef)
  vi.stubGlobal('useState', makeUseState())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const global = {
  // HubNav est monté pour de vrai : c'est lui qu'on veut couvrir ici.
  components: { HubNav },
  stubs: {
    AppFooter: { template: '<footer />' },
    NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }
  }
}

const mountLayout = async () => {
  const wrapper = mount(DefaultLayout, {
    global,
    slots: { default: '<main>contenu de la page</main>' }
  })
  await flushPromises()
  return wrapper
}

describe('layout par défaut', () => {
  it('alimente le chip avec le profil réel, pas des valeurs codées en dur', async () => {
    const text = (await mountLayout()).text()

    expect(text).toContain('AlexTheQuizz')
    // 6250 XP → niveau 13 via useProgression.
    expect(text).toContain('Lv.13')
    expect(text).toContain('1,250')
  })

  it('rend le contenu de la page dans le slot', async () => {
    expect((await mountLayout()).text()).toContain('contenu de la page')
  })

  it('rend un en-tête et un pied de page uniques', async () => {
    const wrapper = await mountLayout()

    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.findAll('footer')).toHaveLength(1)
  })

  it('ne déclenche qu\'une requête profil pour toute la navigation', async () => {
    await mountLayout()

    expect(from).toHaveBeenCalledTimes(1)
  })
})

describe('layout par défaut — chargement du profil', () => {
  it('affiche un squelette neutre sans valeur trompeuse', async () => {
    single.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountLayout()

    // L'en-tête reste en place (pas de saut de mise en page)...
    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.find('.chip--loading').exists()).toBe(true)
    // ...mais n'annonce ni pseudo ni niveau tant qu'ils sont inconnus.
    expect(wrapper.text()).not.toContain('Lv.')
    expect(wrapper.text()).not.toContain('AlexTheQuizz')
  })

  it('masque le squelette aux technologies d\'assistance', async () => {
    single.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountLayout()

    expect(wrapper.find('.chip--loading').attributes('aria-hidden')).toBe('true')
    // Aucune barre de progression sans valeur connue (RGAA 7.1).
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })

  it('remplace le squelette par les vraies données une fois chargées', async () => {
    const wrapper = await mountLayout()

    expect(wrapper.find('.chip--loading').exists()).toBe(false)
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')
  })
})
