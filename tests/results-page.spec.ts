// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ResultsPage from '~/pages/game/[id]/results.vue'

// Classement final (score décroissant). user-1 = moi (rang 4).
const PLAYERS = [
  { user_id: 'user-2', score: 10, profile: { pseudo: 'NeonDrifter' } },
  { user_id: 'user-3', score: 9, profile: { pseudo: 'CipherX' } },
  { user_id: 'user-4', score: 7, profile: { pseudo: 'NullPtr' } },
  { user_id: 'user-1', score: 6, profile: { pseudo: 'AlexTheQuizz' } },
  { user_id: 'user-5', score: 4, profile: { pseudo: 'ShadowNinja' } }
]

interface MockTable {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  result: { data: unknown, error: unknown }
}

const makeTable = (): MockTable => {
  const table = { result: { data: null as unknown, error: null as unknown } } as unknown as MockTable & {
    then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>
  }
  for (const method of ['select', 'eq', 'delete'] as const) {
    table[method] = vi.fn(() => table)
  }
  table.maybeSingle = vi.fn(() => Promise.resolve(table.result))
  table.then = (onFulfilled, onRejected) =>
    Promise.resolve(table.result).then(onFulfilled as never, onRejected as never)
  return table
}

let lobbiesTable: MockTable
let playersTable: MockTable
let rpc: ReturnType<typeof vi.fn>
let navigateToMock: ReturnType<typeof vi.fn>
let currentUser: string

// Canal Realtime (statut du lobby) : on capture config + handler.
let channelObj: Record<string, ReturnType<typeof vi.fn>>
let channelSpy: ReturnType<typeof vi.fn>
let removeChannel: ReturnType<typeof vi.fn>
let realtimeHandler: ((payload: unknown) => void) | null

const mountPage = () =>
  mount(ResultsPage, {
    global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
  })

beforeEach(() => {
  lobbiesTable = makeTable()
  playersTable = makeTable()
  // Partie terminée ; je (user-1) suis l'hôte par défaut.
  lobbiesTable.result = {
    data: { host_id: 'user-1', status: 'finished', name: 'Neon Protocol', category: 'tech' },
    error: null
  }
  playersTable.result = { data: PLAYERS, error: null }
  currentUser = 'user-1'

  rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  navigateToMock = vi.fn()

  realtimeHandler = null
  channelObj = {} as Record<string, ReturnType<typeof vi.fn>>
  channelObj.on = vi.fn((_type: string, _config: unknown, handler: (payload: unknown) => void) => {
    realtimeHandler = handler
    return channelObj
  })
  channelObj.subscribe = vi.fn(() => channelObj)
  channelSpy = vi.fn(() => channelObj)
  removeChannel = vi.fn()

  const from = vi.fn((table: string) => (table === 'lobbies' ? lobbiesTable : playersTable))

  vi.stubGlobal('useSupabaseClient', () => ({
    from,
    rpc,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    channel: channelSpy,
    removeChannel
  }))
  vi.stubGlobal('useSupabaseUser', () => ref({ sub: currentUser }))
  vi.stubGlobal('useRoute', () => ({ params: { id: 'lobby-1' } }))
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('navigateTo', navigateToMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Page résultats — contenu', () => {
  it('titre unique de niveau 1 et sous-titre thème - nom', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toBe('Résultats de l’arène')
    expect(wrapper.find('.head__subtitle').text()).toBe('Tech - Neon Protocol')
  })

  it('range le podium 2e — 1er — 3e, le vainqueur mis en avant', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const cards = wrapper.findAll('.podium__card')
    expect(cards).toHaveLength(3)
    // Ordre d'affichage : 2e à gauche, 1er au centre, 3e à droite.
    expect(cards[0]!.text()).toContain('CipherX')
    expect(cards[1]!.text()).toContain('NeonDrifter')
    expect(cards[2]!.text()).toContain('NullPtr')
    // Le vainqueur porte la classe dédiée ET son rang « 1er » (jamais que la position).
    expect(cards[1]!.classes()).toContain('podium__card--winner')
    expect(cards[0]!.find('.podium__place').text()).toBe('2e')
    expect(cards[1]!.find('.podium__place').text()).toBe('1er')
    expect(cards[2]!.find('.podium__place').text()).toBe('3e')
  })

  it('liste les joueurs hors podium et marque ma ligne d’un libellé « Vous »', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const rows = wrapper.findAll('.row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('AlexTheQuizz')
    expect(rows[0]!.text()).toContain('6 pts')
    // Repère du joueur courant : classe + libellé texte, pas seulement la couleur.
    expect(rows[0]!.classes()).toContain('row--me')
    expect(rows[0]!.text()).toContain('Vous')
    expect(rows[1]!.text()).toContain('ShadowNinja')
  })

  it('affiche l’XP gagnée par le joueur courant (score × 10)', async () => {
    const wrapper = mountPage()
    await flushPromises()

    // Mon score = 6 → +60 XP.
    expect(wrapper.find('.xp__value').text()).toBe('+60')
  })
})

describe('Page résultats — crédit d’XP', () => {
  it('l’hôte crédite l’XP au montage (finish_game)', async () => {
    mountPage()
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith('finish_game', { p_lobby_id: 'lobby-1' })
  })

  it('un non-hôte ne crédite jamais l’XP', async () => {
    currentUser = 'user-2' // je ne suis pas l'hôte (user-1)
    mountPage()
    await flushPromises()

    expect(rpc).not.toHaveBeenCalledWith('finish_game', { p_lobby_id: 'lobby-1' })
  })
})

describe('Page résultats — actions', () => {
  it('« Rejouer » (hôte) réinitialise le lobby via reset_lobby', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.button--primary').trigger('click')
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith('reset_lobby', { p_lobby_id: 'lobby-1' })
  })

  it('masque « Rejouer » pour un non-hôte', async () => {
    currentUser = 'user-2'
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.button--primary').exists()).toBe(false)
    // Le retour à l'accueil reste possible.
    expect(wrapper.text()).toContain('Retour à l’accueil')
  })

  it('« Retour à l’accueil » quitte le salon puis revient à l’accueil', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.button--ghost').trigger('click')
    await flushPromises()

    expect(playersTable.delete).toHaveBeenCalled()
    expect(navigateToMock).toHaveBeenCalledWith('/')
  })
})

describe('Page résultats — synchro rejeu', () => {
  it('renvoie tous les joueurs au salon quand le lobby repasse en attente', async () => {
    mountPage()
    await flushPromises()

    // L'hôte a cliqué « Rejouer » → reset_lobby → status devient 'waiting'.
    realtimeHandler!({ new: { status: 'waiting' } })

    expect(navigateToMock).toHaveBeenCalledWith('/lobby/lobby-1')
  })

  it('redirige directement vers le salon si la partie a déjà été relancée', async () => {
    lobbiesTable.result = {
      data: { host_id: 'user-1', status: 'waiting', name: 'Neon Protocol', category: 'tech' },
      error: null
    }
    mountPage()
    await flushPromises()

    expect(navigateToMock).toHaveBeenCalledWith('/lobby/lobby-1')
  })

  it('ferme le canal Realtime au démontage', async () => {
    const wrapper = mountPage()
    await flushPromises()

    wrapper.unmount()

    expect(removeChannel).toHaveBeenCalledWith(channelObj)
  })
})
