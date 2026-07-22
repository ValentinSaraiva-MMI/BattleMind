// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent, type Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import {
  useGame,
  START_GAME_ERROR,
  QUESTION_ERROR,
  ANSWER_ERROR
} from '~/composables/useGame'

const SESSION_CLAIMS = { sub: 'user-1' }

interface MockTable {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  result: { data: unknown, error: unknown }
}

/** Constructeur de requêtes supabase-js : chaque maillon renvoie la table, et
 *  l'objet est « thenable » pour qu'un `await` en fin de chaîne résolve `result`. */
const makeTable = (): MockTable => {
  const table = { result: { data: null as unknown, error: null as unknown } } as unknown as MockTable & {
    then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>
  }

  for (const method of ['select', 'eq', 'order', 'limit'] as const) {
    table[method] = vi.fn(() => table)
  }
  table.single = vi.fn(() => Promise.resolve(table.result))
  table.maybeSingle = vi.fn(() => Promise.resolve(table.result))
  table.then = (onFulfilled, onRejected) =>
    Promise.resolve(table.result).then(onFulfilled as never, onRejected as never)

  return table
}

let roundsTable: MockTable
let playersTable: MockTable
let startGameResult: { data: unknown, error: unknown }
let questionResult: { data: unknown, error: unknown }
let rpc: ReturnType<typeof vi.fn>
let invoke: ReturnType<typeof vi.fn>
let getSession: ReturnType<typeof vi.fn>
let userRef: Ref<typeof SESSION_CLAIMS | null>

beforeEach(() => {
  roundsTable = makeTable()
  playersTable = makeTable()
  startGameResult = { data: 'round-1', error: null }
  questionResult = { data: null, error: null }

  rpc = vi.fn((name: string) =>
    Promise.resolve(name === 'start_game' ? startGameResult : questionResult)
  )
  invoke = vi.fn().mockResolvedValue({ data: null, error: null })
  getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
  userRef = ref<typeof SESSION_CLAIMS | null>(SESSION_CLAIMS)

  const from = vi.fn((table: string) => (table === 'game_rounds' ? roundsTable : playersTable))

  vi.stubGlobal('useSupabaseClient', () => ({
    from,
    rpc,
    functions: { invoke },
    auth: { getSession }
  }))
  vi.stubGlobal('useSupabaseUser', () => userRef)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const setup = async () => {
  let api: ReturnType<typeof useGame> | undefined
  const Consumer = defineComponent({
    setup() {
      api = useGame()
      return () => null
    }
  })

  mount(Consumer)
  await flushPromises()

  return api!
}

describe('useGame — startGame', () => {
  it('délègue le lancement à la fonction Postgres et renvoie l’id du round', async () => {
    const api = await setup()

    const roundId = await api.startGame('lobby-1')

    expect(rpc).toHaveBeenCalledWith('start_game', { p_lobby_id: 'lobby-1' })
    expect(roundId).toBe('round-1')
  })

  it('reste fail closed si la fonction refuse (non-hôte, partie déjà lancée)', async () => {
    startGameResult = { data: null, error: { message: 'Seul l’hôte peut lancer la partie' } }
    const api = await setup()

    expect(await api.startGame('lobby-1')).toBeNull()
    // Aucun détail technique ne remonte à l'écran.
    expect(api.errorMessage.value).toBe(START_GAME_ERROR)
  })

  it('reste fail closed sur exception réseau', async () => {
    rpc.mockRejectedValueOnce(new Error('network down'))
    const api = await setup()

    expect(await api.startGame('lobby-1')).toBeNull()
    expect(api.errorMessage.value).toBe(START_GAME_ERROR)
  })
})

describe('useGame — fetchActiveRound', () => {
  it('renvoie le round le plus récent du lobby', async () => {
    roundsTable.result = { data: { id: 'round-9' }, error: null }
    const api = await setup()

    const roundId = await api.fetchActiveRound('lobby-1')

    expect(roundsTable.eq).toHaveBeenCalledWith('lobby_id', 'lobby-1')
    // Le plus récent = round_number le plus élevé.
    expect(roundsTable.order).toHaveBeenCalledWith('round_number', { ascending: false })
    expect(roundsTable.limit).toHaveBeenCalledWith(1)
    expect(roundId).toBe('round-9')
  })

  it('renvoie null si la partie n’a pas encore de round', async () => {
    roundsTable.result = { data: null, error: null }
    const api = await setup()

    expect(await api.fetchActiveRound('lobby-1')).toBeNull()
  })
})

describe('useGame — fetchQuestion', () => {
  const QUESTION = {
    round_id: 'round-1',
    round_number: 3,
    started_at: '2026-07-21T10:00:00Z',
    status: 'active',
    category: 'tech',
    question_text: 'Que signifie le sigle "CPU" ?',
    answers: [
      { key: 'A', text: 'Central Processing Unit' },
      { key: 'B', text: 'Computer Personal Unit' }
    ]
  }

  it('projette l’énoncé et les réponses en camelCase avec le libellé de catégorie', async () => {
    questionResult = { data: QUESTION, error: null }
    const api = await setup()

    const question = await api.fetchQuestion('round-1')

    expect(rpc).toHaveBeenCalledWith('get_round_question', { p_round_id: 'round-1' })
    expect(question).toEqual({
      roundId: 'round-1',
      roundNumber: 3,
      category: 'tech',
      categoryLabel: 'Tech',
      questionText: 'Que signifie le sigle "CPU" ?',
      answers: QUESTION.answers
    })
  })

  it('ne divulgue jamais la bonne réponse au client', async () => {
    questionResult = { data: QUESTION, error: null }
    const api = await setup()

    const question = await api.fetchQuestion('round-1')

    // La sécurité repose sur l'Edge Function : la question servie est expurgée.
    expect(question).not.toHaveProperty('correctKey')
    expect(question).not.toHaveProperty('correct_key')
    expect(JSON.stringify(question)).not.toContain('correct')
  })

  it('reste fail closed sur accès refusé ou round introuvable', async () => {
    questionResult = { data: null, error: { message: 'Accès refusé' } }
    const api = await setup()

    expect(await api.fetchQuestion('round-1')).toBeNull()
    expect(api.errorMessage.value).toBe(QUESTION_ERROR)
  })
})

describe('useGame — fetchLeaderboard', () => {
  const ROWS = [
    { user_id: 'user-2', score: 3, profile: { pseudo: 'CipherX' } },
    { user_id: 'user-1', score: 7, profile: { pseudo: 'NeonDrifter' } },
    { user_id: 'user-3', score: 7, profile: { pseudo: 'AlexTheQuizz' } }
  ]

  it('lit les scores du lobby, les classe et marque ma ligne', async () => {
    playersTable.result = { data: ROWS, error: null }
    const api = await setup()

    const ranked = await api.fetchLeaderboard('lobby-1')

    expect(playersTable.eq).toHaveBeenCalledWith('lobby_id', 'lobby-1')
    // Tri par score décroissant, départage alphabétique sur l'ex æquo à 7.
    expect(ranked.map(player => player.pseudo)).toEqual(['AlexTheQuizz', 'NeonDrifter', 'CipherX'])
    expect(ranked.map(player => player.rank)).toEqual([1, 2, 3])
    expect(ranked.find(player => player.isMe)?.userId).toBe('user-1')
  })

  it('tolère un profil manquant sans casser le classement', async () => {
    playersTable.result = {
      data: [{ user_id: 'user-9', score: 1, profile: null }],
      error: null
    }
    const api = await setup()

    const ranked = await api.fetchLeaderboard('lobby-1')

    expect(ranked[0]).toMatchObject({ pseudo: 'Joueur', score: 1, rank: 1 })
  })

  it('renvoie une liste vide sur erreur de lecture — jamais d’échec bloquant', async () => {
    playersTable.result = { data: null, error: { code: '42501' } }
    const api = await setup()

    expect(await api.fetchLeaderboard('lobby-1')).toEqual([])
  })
})

describe('useGame — submitAnswer', () => {
  it('n’envoie que round_id + selected_key à l’Edge Function et projette le verdict', async () => {
    invoke.mockResolvedValue({
      data: { is_correct: true, correct_key: 'C', score: 4, streak: 2 },
      error: null
    })
    const api = await setup()

    const result = await api.submitAnswer('round-1', 'C')

    expect(invoke).toHaveBeenCalledWith('submit_answer', {
      body: { round_id: 'round-1', selected_key: 'C' }
    })
    // Jamais d'identité ni de score envoyés par le client : le serveur fait autorité.
    const body = invoke.mock.calls[0]![1].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['round_id', 'selected_key'])

    expect(result).toEqual({ isCorrect: true, correctKey: 'C', score: 4, streak: 2 })
  })

  it('reste fail closed quand l’Edge Function renvoie une erreur (déjà répondu, temps écoulé)', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Déjà répondu' } })
    const api = await setup()

    expect(await api.submitAnswer('round-1', 'A')).toBeNull()
    expect(api.errorMessage.value).toBe(ANSWER_ERROR)
  })

  it('reste fail closed sur exception réseau', async () => {
    invoke.mockRejectedValue(new Error('network down'))
    const api = await setup()

    expect(await api.submitAnswer('round-1', 'A')).toBeNull()
    expect(api.errorMessage.value).toBe(ANSWER_ERROR)
  })
})
