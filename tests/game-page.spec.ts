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
let lobbiesTable: MockTable
let questionResult: { data: unknown, error: unknown }
// Réponses de get_round_question par round demandé (pour l'enchaînement).
let questionByRound: Record<string, unknown>
let nextRoundResult: { data: unknown, error: unknown }
let rpc: ReturnType<typeof vi.fn>
let invoke: ReturnType<typeof vi.fn>
let routeQuery: Record<string, string>

const mountPage = () =>
  mount(GamePage, {
    global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
  })

beforeEach(() => {
  // Timer figé sur l'instant de départ du round : le décompte part à 10 s et ne
  // bouge QUE si le test avance explicitement l'horloge. `setImmediate` (que
  // flushPromises utilise) reste réel, capturé à l'import — non affecté.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date(QUESTION.started_at))

  roundsTable = makeTable()
  playersTable = makeTable()
  lobbiesTable = makeTable()
  playersTable.result = { data: LEADERBOARD, error: null }
  // Par défaut : je suis l'hôte (métronome), partie en cours.
  lobbiesTable.result = { data: { host_id: 'user-1', status: 'in_progress' }, error: null }
  questionResult = { data: QUESTION, error: null }
  questionByRound = {}
  nextRoundResult = { data: { finished: false, round_id: 'round-2', round_number: 4 }, error: null }
  routeQuery = { round: 'round-1' }

  invoke = vi.fn().mockResolvedValue({ data: null, error: null })

  rpc = vi.fn((name: string, args?: { p_round_id?: string }) => {
    if (name === 'get_round_question') {
      const row = questionByRound[args?.p_round_id ?? '']
      return Promise.resolve(row ? { data: row, error: null } : questionResult)
    }
    if (name === 'next_round') return Promise.resolve(nextRoundResult)
    return Promise.resolve({ data: null, error: null })
  })
  const from = vi.fn((table: string) => {
    if (table === 'game_rounds') return roundsTable
    if (table === 'lobbies') return lobbiesTable
    return playersTable
  })

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
  vi.useRealTimers()
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

describe('Page de jeu — compte à rebours (temps serveur)', () => {
  it('part de la durée pleine, dérivée de started_at', async () => {
    const wrapper = mountPage()
    await flushPromises()

    // started_at = « maintenant » (horloge figée) → 10 s au départ.
    expect(wrapper.find('.timer__value').text()).toBe('10')
    expect(wrapper.find('[role="timer"]').exists()).toBe(true)
  })

  it('décompte au fil du temps sans repartir d’un compteur local', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(wrapper.find('.timer__value').text()).toBe('7')
  })
})

describe('Page de jeu — métronome (hôte)', () => {
  it('enchaîne automatiquement la question suivante à l’expiration du temps', async () => {
    questionByRound['round-2'] = {
      round_id: 'round-2',
      round_number: 4,
      started_at: '2026-07-21T10:00:11Z', // nouveau round → décompte plein
      status: 'active',
      category: 'tech',
      question_text: 'Question suivante ?',
      answers: QUESTION.answers
    }

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('.board__progress').text()).toBe('Question 03/10')

    // Les 10 s s'écoulent : l'hôte déclenche next_round, sans action humaine.
    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith('next_round', { p_lobby_id: 'lobby-1' })
    expect(wrapper.find('.board__progress').text()).toBe('Question 04/10')
    expect(wrapper.find('h1').text()).toBe('Question suivante ?')
    // Nouvelle question → réponses de nouveau actionnables.
    expect(wrapper.findAll('.answer').every(a => a.attributes('disabled') === undefined)).toBe(true)
  })

  it('affiche l’écran de fin quand le serveur clôt la partie après le dernier round', async () => {
    nextRoundResult = { data: { finished: true }, error: null }

    const wrapper = mountPage()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe('Partie terminée')
  })

  it('montre directement l’écran de fin si la partie est déjà terminée (rechargement)', async () => {
    lobbiesTable.result = { data: { host_id: 'user-1', status: 'finished' }, error: null }

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Partie terminée')
    // Aucune question chargée : on court-circuite sur le statut du lobby.
    expect(rpc).not.toHaveBeenCalledWith('get_round_question', expect.anything())
  })
})

describe('Page de jeu — non-hôte & temps écoulé', () => {
  it('ne fait pas avancer la partie et verrouille les réponses à l’expiration', async () => {
    // Je ne suis pas l'hôte : je ne suis pas le métronome.
    lobbiesTable.result = { data: { host_id: 'user-2', status: 'in_progress' }, error: null }

    const wrapper = mountPage()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()

    // Un non-hôte ne déclenche jamais next_round.
    expect(rpc).not.toHaveBeenCalledWith('next_round', { p_lobby_id: 'lobby-1' })
    // La question ne change pas (la bascule synchronisée arrive en 3c).
    expect(wrapper.find('.board__progress').text()).toBe('Question 03/10')
    // Temps écoulé : réponses désactivées, et l'expiration est annoncée (pas que visuelle).
    expect(wrapper.findAll('.answer').every(a => a.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('[role="status"]').text()).toContain('Temps écoulé')
  })
})
