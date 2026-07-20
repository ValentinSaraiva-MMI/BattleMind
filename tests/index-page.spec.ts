// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import IndexPage from '~/pages/index.vue'
import CreateOrJoinPanel from '~/components/CreateOrJoinPanel.vue'
import CreateLobbyModal from '~/components/CreateLobbyModal.vue'
import LobbyCard from '~/components/LobbyCard.vue'

const ROWS = [
  {
    id: 'lobby-1',
    name: 'Neon Protocol',
    category: 'culture_generale',
    max_players: 6,
    host: { pseudo: 'CipherX' },
    lobby_players: [{ count: 2 }]
  }
]

let lobbiesTable: Record<string, ReturnType<typeof vi.fn>> & { result: unknown }
let from: ReturnType<typeof vi.fn>
let rpc: ReturnType<typeof vi.fn>
let navigateToMock: ReturnType<typeof vi.fn>

const makeTable = () => {
  const table = { result: { data: ROWS, error: null } } as never as Record<string, ReturnType<typeof vi.fn>> & {
    result: unknown
    then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>
  }

  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order'] as const) {
    table[method] = vi.fn(() => table)
  }
  table.single = vi.fn(() => Promise.resolve(table.result))
  table.then = (onFulfilled, onRejected) =>
    Promise.resolve(table.result).then(onFulfilled as never, onRejected as never)

  return table
}

/** Nuxt auto-importe les composants ; en isolation on les fournit explicitement. */
const mountPage = () =>
  mount(IndexPage, {
    global: {
      components: { CreateOrJoinPanel, CreateLobbyModal, LobbyCard },
      stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
    }
  })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })

  lobbiesTable = makeTable()
  from = vi.fn(() => lobbiesTable)
  rpc = vi.fn().mockResolvedValue({ data: 'lobby-7', error: null })
  navigateToMock = vi.fn()

  vi.stubGlobal('useSupabaseClient', () => ({
    from,
    rpc,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }) }
  }))
  vi.stubGlobal('useSupabaseUser', () => ref({ sub: 'user-1' }))
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('navigateTo', navigateToMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Accueil — liste des parties publiques', () => {
  it('charge la liste au montage', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(from).toHaveBeenCalledWith('lobbies')
    expect(wrapper.text()).toContain('Neon Protocol')
    wrapper.unmount()
  })

  it('place la zone de liste en région vivante polie', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const live = wrapper.find('[aria-live="polite"]')
    expect(live.exists()).toBe(true)
    expect(live.text()).toContain('Neon Protocol')
    wrapper.unmount()
  })

  it('recharge au clic sur Rafraîchir', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const initial = from.mock.calls.length

    await wrapper.find('.refresh').trigger('click')
    await flushPromises()

    expect(from.mock.calls.length).toBeGreaterThan(initial)
    wrapper.unmount()
  })

  it('donne au bouton Rafraîchir un nom accessible explicite', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.refresh').text()).toContain('liste des parties publiques')
    wrapper.unmount()
  })

  it('affiche un état vide plutôt qu’une grille muette', async () => {
    lobbiesTable.result = { data: [], error: null }
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Aucune partie publique ouverte')
    expect(wrapper.find('ul').exists()).toBe(false)
    wrapper.unmount()
  })

  it('annonce l’échec de chargement dans une alerte', async () => {
    lobbiesTable.result = { data: null, error: { code: '42501' } }
    const wrapper = mountPage()
    await flushPromises()

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    // Erreur doublée d'une icône : jamais portée par la seule couleur (RGAA 3.1).
    expect(alert.find('img').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('Accueil — rafraîchissement automatique', () => {
  let wrapper: VueWrapper

  const callsAfterMount = async () => {
    wrapper = mountPage()
    await flushPromises()
    return from.mock.calls.length
  }

  afterEach(() => {
    wrapper?.unmount()
  })

  it('recharge toutes les 10 secondes', async () => {
    const initial = await callsAfterMount()

    vi.advanceTimersByTime(10_000)
    await flushPromises()

    expect(from.mock.calls.length).toBeGreaterThan(initial)
  })

  it('nettoie l’intervalle au démontage', async () => {
    await callsAfterMount()
    wrapper.unmount()

    const afterUnmount = from.mock.calls.length
    vi.advanceTimersByTime(30_000)
    await flushPromises()

    expect(from.mock.calls.length).toBe(afterUnmount)
  })

  it('suspend le sondage quand l’onglet est caché', async () => {
    const initial = await callsAfterMount()

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    vi.advanceTimersByTime(30_000)
    await flushPromises()

    expect(from.mock.calls.length).toBe(initial)
  })

  it('recharge immédiatement au retour sur l’onglet', async () => {
    const initial = await callsAfterMount()

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(from.mock.calls.length).toBeGreaterThan(initial)
  })
})

describe('Accueil — création et jonction', () => {
  it('ouvre la modale de création au clic sur « Créer une partie »', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await wrapper.find('.panel button[type="button"]').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('rejoint par code puis redirige vers le salon', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('#join-code').setValue('654321')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith('join_lobby_by_code', { p_code: '654321' })
    expect(navigateToMock).toHaveBeenCalledWith('/lobby/lobby-7')
    wrapper.unmount()
  })

  it('rejoint une partie publique depuis sa carte', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.card__join').trigger('click')
    await flushPromises()

    expect(navigateToMock).toHaveBeenCalledWith('/lobby/lobby-1')
    wrapper.unmount()
  })
})
