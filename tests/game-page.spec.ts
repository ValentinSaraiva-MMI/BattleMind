// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import GamePage from '~/pages/game/[id].vue'

const QUESTION = {
  round_id: 'round-1',
  round_number: 3,
  started_at: '2026-07-21T10:00:00Z',
  status: 'active',
  category: 'tech',
  question_text: 'Que signifie le sigle "CPU" ?',
  answers: [
    { key: 'A', text: 'Central Processing Unit' },
    { key: 'B', text: 'Computer Personal Unit' },
    { key: 'C', text: 'Central Program Utility' },
    { key: 'D', text: 'Core Processing Utility' }
  ]
}

// user-1 (moi) est en tête avec 7 points ; CipherX suit à 5.
const LEADERBOARD = [
  { user_id: 'user-2', score: 5, profile: { pseudo: 'CipherX' } },
  { user_id: 'user-1', score: 7, profile: { pseudo: 'NeonDrifter' } }
]

interface MockTable {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  result: { data: unknown, error: unknown }
}

const makeTable = (): MockTable => {
  const table = { result: { data: null as unknown, error: null as unknown } } as unknown as MockTable & {
    then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>
  }
  for (const method of ['select', 'eq', 'order', 'limit'] as const) {
    table[method] = vi.fn(() => table)
  }
  table.maybeSingle = vi.fn(() => Promise.resolve(table.result))
  table.then = (onFulfilled, onRejected) =>
    Promise.resolve(table.result).then(onFulfilled as never, onRejected as never)
  return table
}

let roundsTable: MockTable
let playersTable: MockTable
let questionResult: { data: unknown, error: unknown }
let invoke: ReturnType<typeof vi.fn>
let routeQuery: Record<string, string>

const mountPage = () =>
  mount(GamePage, {
    global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
  })

beforeEach(() => {
  roundsTable = makeTable()
  playersTable = makeTable()
  playersTable.result = { data: LEADERBOARD, error: null }
  questionResult = { data: QUESTION, error: null }
  routeQuery = { round: 'round-1' }

  invoke = vi.fn().mockResolvedValue({ data: null, error: null })

  const rpc = vi.fn((name: string) =>
    Promise.resolve(name === 'get_round_question' ? questionResult : { data: null, error: null })
  )
  const from = vi.fn((table: string) => (table === 'game_rounds' ? roundsTable : playersTable))

  vi.stubGlobal('useSupabaseClient', () => ({
    from,
    rpc,
    functions: { invoke },
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }
  }))
  vi.stubGlobal('useSupabaseUser', () => ref({ sub: 'user-1' }))
  vi.stubGlobal('useRoute', () => ({ params: { id: 'lobby-1' }, query: routeQuery }))
  vi.stubGlobal('useHead', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Page de jeu — contenu de la question', () => {
  it('affiche l’énoncé en unique titre de niveau 1', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toBe('Que signifie le sigle "CPU" ?')
  })

  it('numérote la question X/10 façon maquette', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.board__progress').text()).toBe('Question 03/10')
  })

  it('présente les quatre réponses comme des boutons cliquables au clavier', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const answers = wrapper.findAll('.answer')
    expect(answers).toHaveLength(4)
    // Chaque bouton porte sa lettre et son intitulé.
    expect(answers[0]!.text()).toContain('A')
    expect(answers[0]!.text()).toContain('Central Processing Unit')
    // Ce sont de vrais <button> (focusables, actionnables au clavier).
    expect(answers.every(answer => answer.element.tagName === 'BUTTON')).toBe(true)
  })

  it('demande le round transmis dans l’URL sans repasser par la base', async () => {
    const wrapper = mountPage()
    await flushPromises()

    // Le round venant de l'URL évite la lecture du round actif.
    expect(roundsTable.select).not.toHaveBeenCalled()
    expect(wrapper.find('.question').exists()).toBe(true)
  })
})

describe('Page de jeu — round actif de repli', () => {
  it('lit le round le plus récent quand l’URL n’en fournit pas', async () => {
    routeQuery = {}
    roundsTable.result = { data: { id: 'round-1' }, error: null }
    const wrapper = mountPage()
    await flushPromises()

    expect(roundsTable.order).toHaveBeenCalledWith('round_number', { ascending: false })
    expect(wrapper.find('h1').text()).toBe('Que signifie le sigle "CPU" ?')
  })

  it('signale une partie sans question active sans laisser la page vide', async () => {
    routeQuery = {}
    roundsTable.result = { data: null, error: null }
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    // Un retour vers le salon, jamais un cul-de-sac.
    expect(wrapper.find('a').attributes('href')).toBe('/lobby/lobby-1')
  })
})

describe('Page de jeu — classement', () => {
  it('affiche le classement trié par score dans une liste ordonnée', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('ol.leaderboard__list').exists()).toBe(true)
    const rows = wrapper.findAll('.rank')
    expect(rows[0]!.text()).toContain('NeonDrifter')
    expect(rows[0]!.text()).toContain('7 pts')
    expect(rows[1]!.text()).toContain('CipherX')
  })

  it('surligne ma ligne et l’annonce aux lecteurs d’écran, pas seulement par la couleur', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const me = wrapper.find('.rank--me')
    expect(me.exists()).toBe(true)
    expect(me.text()).toContain('NeonDrifter')
    // Le repère n'est pas que visuel : un libellé « (toi) » lecteur d'écran double la couleur.
    expect(me.text()).toContain('(toi)')
  })

  it('titre le classement par un niveau 2', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('h2').text()).toContain('Classement de l’arène')
  })
})

describe('Page de jeu — répondre', () => {
  it('n’envoie que round_id + réponse à l’Edge Function au clic', async () => {
    invoke.mockResolvedValue({
      data: { is_correct: true, correct_key: 'A', score: 8, streak: 1 },
      error: null
    })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.findAll('.answer')[0]!.trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('submit_answer', {
      body: { round_id: 'round-1', selected_key: 'A' }
    })
  })

  it('passe la réponse juste au vert et verrouille tous les boutons', async () => {
    invoke.mockResolvedValue({
      data: { is_correct: true, correct_key: 'A', score: 8, streak: 1 },
      error: null
    })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.findAll('.answer')[0]!.trigger('click')
    await flushPromises()

    const answers = wrapper.findAll('.answer')
    expect(answers[0]!.classes()).toContain('answer--correct')
    expect(answers[0]!.text()).toContain('Bonne réponse')
    // On ne répond qu'une fois : tous les boutons sont désactivés après coup.
    expect(answers.every(answer => answer.attributes('disabled') !== undefined)).toBe(true)
  })

  it('passe le mauvais choix au rouge ET révèle la bonne réponse en vert', async () => {
    invoke.mockResolvedValue({
      data: { is_correct: false, correct_key: 'A', score: 7, streak: 0 },
      error: null
    })
    const wrapper = mountPage()
    await flushPromises()

    // On clique B (faux) ; la bonne réponse est A.
    await wrapper.findAll('.answer')[1]!.trigger('click')
    await flushPromises()

    const answers = wrapper.findAll('.answer')
    expect(answers[1]!.classes()).toContain('answer--incorrect')
    expect(answers[1]!.text()).toContain('Ta réponse')
    expect(answers[0]!.classes()).toContain('answer--correct')
    expect(answers[0]!.text()).toContain('Bonne réponse')
  })

  it('annonce le verdict dans une zone de statut (RGAA 7.4)', async () => {
    invoke.mockResolvedValue({
      data: { is_correct: false, correct_key: 'A', score: 7, streak: 0 },
      error: null
    })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.findAll('.answer')[1]!.trigger('click')
    await flushPromises()

    const status = wrapper.find('[role="status"]')
    expect(status.text()).toContain('Mauvaise réponse')
    expect(status.text()).toContain('Central Processing Unit')
  })

  it('ignore les clics suivants : une seule réponse par question', async () => {
    invoke.mockResolvedValue({
      data: { is_correct: true, correct_key: 'A', score: 8, streak: 1 },
      error: null
    })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.findAll('.answer')[0]!.trigger('click')
    await flushPromises()
    await wrapper.findAll('.answer')[1]!.trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('signale un échec d’enregistrement sans verrouiller la question', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Erreur serveur' } })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.findAll('.answer')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    // La réponse n'a pas abouti : les boutons restent actionnables pour réessayer.
    expect(wrapper.findAll('.answer')[0]!.attributes('disabled')).toBeUndefined()
  })
})
