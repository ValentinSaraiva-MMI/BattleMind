// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent, type Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import {
  useLobby,
  CODE_INVALID_ERROR,
  CODE_UNKNOWN_ERROR,
  CREATE_ERROR,
  JOIN_ERROR,
  LOBBIES_ERROR,
  LOBBY_NOT_FOUND_ERROR,
  SESSION_ERROR
} from '~/composables/useLobby'

// `useSupabaseUser()` expose le JWT décodé : l'identifiant est dans `sub`.
const SESSION_CLAIMS = { sub: 'user-1' }

interface MockTable {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  result: { data: unknown, error: unknown }
}

/**
 * Reproduit le constructeur de requêtes supabase-js : chaque maillon renvoie la
 * table pour rester assertable, et l'objet est « thenable » afin qu'un `await`
 * en fin de chaîne (`.delete().eq().eq()`) résolve le résultat courant.
 */
const makeTable = (): MockTable => {
  const table = { result: { data: null as unknown, error: null as unknown } } as unknown as MockTable & {
    then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>
  }

  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order'] as const) {
    table[method] = vi.fn(() => table)
  }

  table.single = vi.fn(() => Promise.resolve(table.result))
  table.then = (onFulfilled, onRejected) =>
    Promise.resolve(table.result).then(
      onFulfilled as never,
      onRejected as never
    )

  return table
}

let lobbiesTable: MockTable
let playersTable: MockTable
let rpc: ReturnType<typeof vi.fn>
let getSession: ReturnType<typeof vi.fn>
let userRef: Ref<typeof SESSION_CLAIMS | null>

beforeEach(() => {
  lobbiesTable = makeTable()
  playersTable = makeTable()
  rpc = vi.fn().mockResolvedValue({ data: 'lobby-1', error: null })
  getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
  userRef = ref<typeof SESSION_CLAIMS | null>(SESSION_CLAIMS)

  const from = vi.fn((table: string) => (table === 'lobbies' ? lobbiesTable : playersTable))

  vi.stubGlobal('useSupabaseClient', () => ({ from, rpc, auth: { getSession } }))
  vi.stubGlobal('useSupabaseUser', () => userRef)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Monte un composant consommateur, comme le font l'accueil et la page salon. */
const setup = async () => {
  let api: ReturnType<typeof useLobby> | undefined
  const Consumer = defineComponent({
    setup() {
      api = useLobby()
      return () => null
    }
  })

  mount(Consumer)
  await flushPromises()

  return api!
}

describe('useLobby — createLobby', () => {
  it('n’envoie jamais le code de partie : la base le génère', async () => {
    lobbiesTable.result = { data: { id: 'lobby-1' }, error: null }
    const api = await setup()

    await api.createLobby({
      name: 'Neon Protocol',
      category: 'sciences',
      access: 'private',
      maxPlayers: 4,
      powerupsEnabled: false
    })

    const payload = lobbiesTable.insert.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('code')
    expect(payload).toMatchObject({
      name: 'Neon Protocol',
      category: 'sciences',
      access: 'private',
      max_players: 4,
      powerups_enabled: false,
      host_id: 'user-1'
    })
  })

  it('inscrit l’hôte dans lobby_players puis renvoie l’identifiant du salon', async () => {
    lobbiesTable.result = { data: { id: 'lobby-1' }, error: null }
    const api = await setup()

    const id = await api.createLobby({
      name: '  Neon Protocol  ',
      category: 'tech',
      access: 'public',
      maxPlayers: 6,
      powerupsEnabled: true
    })

    expect(id).toBe('lobby-1')
    // Le nom est débarrassé de ses espaces de bord avant l'insert.
    expect(lobbiesTable.insert.mock.calls[0]![0]).toMatchObject({ name: 'Neon Protocol' })
    expect(playersTable.insert).toHaveBeenCalledWith({
      lobby_id: 'lobby-1',
      user_id: 'user-1',
      is_host: true
    })
  })

  it('échoue proprement sans session', async () => {
    userRef.value = null
    getSession.mockResolvedValue({ data: { session: null } })
    const api = await setup()

    const id = await api.createLobby({
      name: 'Neon', category: 'tech', access: 'public', maxPlayers: 6, powerupsEnabled: true
    })

    expect(id).toBeNull()
    expect(api.errorMessage.value).toBe(SESSION_ERROR)
    expect(lobbiesTable.insert).not.toHaveBeenCalled()
  })

  it('reste fail closed quand l’insert échoue', async () => {
    lobbiesTable.result = { data: null, error: { code: '42501' } }
    const api = await setup()

    const id = await api.createLobby({
      name: 'Neon', category: 'tech', access: 'public', maxPlayers: 6, powerupsEnabled: true
    })

    expect(id).toBeNull()
    expect(api.errorMessage.value).toBe(CREATE_ERROR)
    expect(api.pending.value).toBe(false)
  })
})

describe('useLobby — joinByCode', () => {
  it('délègue l’admission à la fonction Postgres', async () => {
    const api = await setup()

    const id = await api.joinByCode('654321')

    expect(rpc).toHaveBeenCalledWith('join_lobby_by_code', { p_code: '654321' })
    expect(id).toBe('lobby-1')
  })

  it('normalise le code avant de l’envoyer', async () => {
    const api = await setup()

    await api.joinByCode('654 321')

    expect(rpc).toHaveBeenCalledWith('join_lobby_by_code', { p_code: '654321' })
  })

  it('refuse un code mal formé sans appeler le réseau', async () => {
    const api = await setup()

    const id = await api.joinByCode('65')

    expect(id).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(api.errorMessage.value).toBe(CODE_INVALID_ERROR)
  })

  it('signale un code sans partie correspondante', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const api = await setup()

    expect(await api.joinByCode('654321')).toBeNull()
    expect(api.errorMessage.value).toBe(CODE_UNKNOWN_ERROR)
  })

  it('traduit un refus de la fonction (partie pleine, fermée) en message sûr', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'lobby is full' } })
    const api = await setup()

    expect(await api.joinByCode('654321')).toBeNull()
    // Aucun détail technique ne remonte à l'écran.
    expect(api.errorMessage.value).toBe(CODE_UNKNOWN_ERROR)
  })

  it('reste fail closed sur exception réseau', async () => {
    rpc.mockRejectedValue(new Error('network down'))
    const api = await setup()

    expect(await api.joinByCode('654321')).toBeNull()
    expect(api.errorMessage.value).toBe(JOIN_ERROR)
  })
})

describe('useLobby — joinPublic et leaveLobby', () => {
  it('insère le joueur sans lui attribuer le rôle d’hôte', async () => {
    const api = await setup()

    const id = await api.joinPublic('lobby-9')

    expect(playersTable.insert).toHaveBeenCalledWith({ lobby_id: 'lobby-9', user_id: 'user-1' })
    expect(id).toBe('lobby-9')
  })

  it('signale un refus de la base (salon plein ou fermé)', async () => {
    playersTable.result = { data: null, error: { code: '23505' } }
    const api = await setup()

    expect(await api.joinPublic('lobby-9')).toBeNull()
    expect(api.errorMessage.value).toBe(JOIN_ERROR)
  })

  it('retire uniquement le joueur courant du salon', async () => {
    const api = await setup()

    const left = await api.leaveLobby('lobby-1')

    expect(left).toBe(true)
    expect(playersTable.delete).toHaveBeenCalled()
    expect(playersTable.eq).toHaveBeenCalledWith('lobby_id', 'lobby-1')
    expect(playersTable.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})

describe('useLobby — startLobby', () => {
  it('passe le salon en partie lancée', async () => {
    const api = await setup()

    const started = await api.startLobby('lobby-1')

    expect(started).toBe(true)
    expect(lobbiesTable.update).toHaveBeenCalledWith({ status: 'in_progress' })
    expect(lobbiesTable.eq).toHaveBeenCalledWith('id', 'lobby-1')
  })
})

describe('useLobby — fetchPublicLobbies', () => {
  const ROWS = [
    {
      id: 'lobby-1',
      name: 'Neon Protocol',
      category: 'culture_generale',
      max_players: 6,
      host: { pseudo: 'CipherX' },
      lobby_players: [{ count: 2 }]
    },
    {
      id: 'lobby-2',
      name: 'Void Sector',
      category: 'histoire',
      max_players: 4,
      host: { pseudo: 'AdminBot' },
      lobby_players: [{ count: 4 }]
    }
  ]

  it('ne liste que les parties publiques encore en attente', async () => {
    lobbiesTable.result = { data: ROWS, error: null }
    const api = await setup()

    await api.fetchPublicLobbies()

    expect(lobbiesTable.eq).toHaveBeenCalledWith('access', 'public')
    expect(lobbiesTable.eq).toHaveBeenCalledWith('status', 'waiting')
    expect(api.lobbiesStatus.value).toBe('loaded')
  })

  it('projette le décompte agrégé et le libellé de catégorie', async () => {
    lobbiesTable.result = { data: ROWS, error: null }
    const api = await setup()

    await api.fetchPublicLobbies()

    expect(api.lobbies.value[0]).toEqual({
      id: 'lobby-1',
      name: 'Neon Protocol',
      category: 'Culture générale',
      status: 'waiting',
      players: 2,
      maxPlayers: 6,
      host: 'CipherX'
    })
  })

  it('marque « full » une partie à capacité — confort d’affichage, pas sécurité', async () => {
    lobbiesTable.result = { data: ROWS, error: null }
    const api = await setup()

    await api.fetchPublicLobbies()

    expect(api.lobbies.value[1]).toMatchObject({ status: 'full', players: 4, maxPlayers: 4 })
  })

  it('tolère un décompte absent et un hôte supprimé', async () => {
    lobbiesTable.result = {
      data: [{ ...ROWS[0], host: null, lobby_players: null }],
      error: null
    }
    const api = await setup()

    await api.fetchPublicLobbies()

    expect(api.lobbies.value[0]).toMatchObject({ players: 0, host: 'Inconnu' })
  })

  it('ne repasse pas en pending lors d’un rafraîchissement silencieux', async () => {
    lobbiesTable.result = { data: ROWS, error: null }
    const api = await setup()
    await api.fetchPublicLobbies()

    const refresh = api.fetchPublicLobbies({ silent: true })
    // Le sondage automatique ne doit pas vider la liste sous les yeux du joueur.
    expect(api.lobbiesStatus.value).toBe('loaded')
    await refresh

    expect(api.lobbies.value).toHaveLength(2)
  })

  it('reste fail closed sur erreur de lecture', async () => {
    lobbiesTable.result = { data: null, error: { code: '42501' } }
    const api = await setup()

    await api.fetchPublicLobbies()

    expect(api.lobbiesStatus.value).toBe('error')
    expect(api.lobbiesError.value).toBe(LOBBIES_ERROR)
  })
})

describe('useLobby — fetchLobby', () => {
  const ROW = {
    id: 'lobby-1',
    code: '654321',
    name: 'Neon Protocol',
    category: 'culture_generale',
    access: 'private',
    max_players: 6,
    powerups_enabled: true,
    status: 'waiting',
    host_id: 'user-1',
    lobby_players: [
      { id: 'lp-2', user_id: 'user-2', is_host: false, is_ready: false, profile: { pseudo: 'CipherX', xp: 3500 } },
      { id: 'lp-1', user_id: 'user-1', is_host: true, is_ready: true, profile: { pseudo: 'AlexTheQuizz', xp: 6250 } }
    ]
  }

  it('compose le salon et dérive le niveau depuis l’XP', async () => {
    lobbiesTable.result = { data: ROW, error: null }
    const api = await setup()

    await api.fetchLobby('lobby-1')

    expect(api.lobbyStatus.value).toBe('loaded')
    expect(api.lobby.value).toMatchObject({
      code: '654321',
      categoryLabel: 'Culture générale',
      access: 'private',
      maxPlayers: 6,
      powerupsEnabled: true,
      hostId: 'user-1'
    })
    // 6250 XP → niveau 13, jamais stocké en base.
    expect(api.lobby.value!.players[0]).toMatchObject({
      pseudo: 'AlexTheQuizz',
      initials: 'AL',
      level: 13,
      isHost: true,
      isReady: true
    })
  })

  it('place l’hôte en tête de la grille', async () => {
    lobbiesTable.result = { data: ROW, error: null }
    const api = await setup()

    await api.fetchLobby('lobby-1')

    expect(api.lobby.value!.players.map(player => player.pseudo)).toEqual([
      'AlexTheQuizz',
      'CipherX'
    ])
  })

  it('signale un salon introuvable', async () => {
    lobbiesTable.result = { data: null, error: { code: 'PGRST116' } }
    const api = await setup()

    await api.fetchLobby('lobby-404')

    expect(api.lobby.value).toBeNull()
    expect(api.lobbyStatus.value).toBe('error')
    expect(api.errorMessage.value).toBe(LOBBY_NOT_FOUND_ERROR)
  })
})
