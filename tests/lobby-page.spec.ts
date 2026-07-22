// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import LobbyPage from '~/pages/lobby/[id].vue'

const LOBBY = {
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
    { id: 'lp-1', user_id: 'user-1', is_host: true, is_ready: true, profile: { pseudo: 'AlexTheQuizz', xp: 6250 } },
    { id: 'lp-2', user_id: 'user-2', is_host: false, is_ready: false, profile: { pseudo: 'CipherX', xp: 3500 } }
  ]
}

let table: Record<string, ReturnType<typeof vi.fn>> & { result: unknown }
let from: ReturnType<typeof vi.fn>
let rpc: ReturnType<typeof vi.fn>
let navigateToMock: ReturnType<typeof vi.fn>
let writeText: ReturnType<typeof vi.fn>
let currentUser: string | null

// Mock des canaux Realtime : un objet par canal (le salon en ouvre deux —
// lobby_players et lobbies), capturant nom, config du filtre et handler, pour
// simuler des événements table par table.
let createdChannels: Array<Record<string, unknown>>
let channelSpy: ReturnType<typeof vi.fn>
let removeChannel: ReturnType<typeof vi.fn>

const makeChannel = (name: string) => {
  const ch: Record<string, unknown> = { name, config: null, handler: null }
  ch.on = vi.fn((_type: string, config: unknown, handler: (payload: unknown) => void) => {
    ch.config = config
    ch.handler = handler
    return ch
  })
  ch.subscribe = vi.fn(() => ch)
  return ch
}

const channelFor = (table: string) =>
  createdChannels.find(ch => (ch.config as { table?: string } | null)?.table === table)

const fireChannel = (table: string, payload: unknown) =>
  (channelFor(table)!.handler as (payload: unknown) => void)(payload)

const makeTable = () => {
  const built = { result: { data: LOBBY, error: null } } as never as Record<string, ReturnType<typeof vi.fn>> & {
    result: unknown
    then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>
  }

  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order'] as const) {
    built[method] = vi.fn(() => built)
  }
  built.single = vi.fn(() => Promise.resolve(built.result))
  built.then = (onFulfilled, onRejected) =>
    Promise.resolve(built.result).then(onFulfilled as never, onRejected as never)

  return built
}

const mountPage = () =>
  mount(LobbyPage, {
    global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
  })

beforeEach(() => {
  table = makeTable()
  from = vi.fn(() => table)
  // `start_game` renvoie l'id du round 1 ; le lancement redirige vers la partie.
  rpc = vi.fn().mockResolvedValue({ data: 'round-1', error: null })
  navigateToMock = vi.fn()
  writeText = vi.fn().mockResolvedValue(undefined)
  currentUser = 'user-1'

  createdChannels = []
  channelSpy = vi.fn((name: string) => {
    const ch = makeChannel(name)
    createdChannels.push(ch)
    return ch
  })
  removeChannel = vi.fn()

  vi.stubGlobal('useSupabaseClient', () => ({
    from,
    rpc,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    channel: channelSpy,
    removeChannel
  }))
  vi.stubGlobal('useSupabaseUser', () => ref(currentUser ? { sub: currentUser } : null))
  vi.stubGlobal('useRoute', () => ({ params: { id: 'lobby-1' } }))
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('navigateTo', navigateToMock)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Page salon — contenu', () => {
  it('affiche le nom du salon en titre de niveau 1 unique', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toBe('Neon Protocol')
  })

  it('met le code d’accès en forme lisible', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.code__value').text()).toBe('654 321')
  })

  it('affiche les joueurs connectés et complète la grille de places libres', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('AlexTheQuizz')
    expect(wrapper.text()).toContain('CipherX')
    expect(wrapper.text()).toContain('2 / 6 connectés')
    // 6 places, 2 occupées → 4 cases « en attente de connexion ».
    expect(wrapper.findAll('.slot')).toHaveLength(4)
  })


  it('identifie l’hôte par un badge texte, pas seulement par la bordure', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const host = wrapper.find('.player--host')
    expect(host.find('.player__badge').text()).toBe('Hôte')
    expect(host.text()).toContain('AlexTheQuizz')
  })

  it('restitue les paramètres en lecture seule', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const settings = wrapper.find('.settings').text()
    expect(settings).toContain('Culture générale')
    expect(settings).toContain('Privé')
    expect(settings).toContain('6 max')
    expect(settings).toContain('Activé')
    // Lecture seule : aucun contrôle de saisie dans le panneau.
    expect(wrapper.find('.settings input').exists()).toBe(false)
  })

  it('signale un salon introuvable sans laisser la page vide', async () => {
    table.result = { data: null, error: { code: 'PGRST116' } }
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Retour à l’accueil')
  })
})

describe('Page salon — copie du code', () => {
  it('copie le code brut et le confirme dans une zone de statut', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.code__copy').trigger('click')
    await flushPromises()

    // C'est le code sans espace qui se colle dans le champ « Rejoindre ».
    expect(writeText).toHaveBeenCalledWith('654321')
    expect(wrapper.find('[role="status"]').text()).toContain('Code copié')
  })

  it('donne au bouton copier un nom accessible', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.code__copy').text()).toContain('Copier le code')
  })

  it('avoue l’échec plutôt que de laisser croire à une copie réussie', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.code__copy').trigger('click')
    await flushPromises()

    const feedback = wrapper.find('[role="status"]').text()
    expect(feedback).toContain('Copie impossible')
    // Le code reste lisible pour être recopié à la main.
    expect(feedback).toContain('654 321')
  })
})

describe('Page salon — actions', () => {
  it('réserve « Lancer l’arène » à l’hôte', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Lancer l’arène')
  })

  it('masque « Lancer l’arène » pour un joueur non hôte', async () => {
    currentUser = 'user-2'
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Lancer l’arène')
    // Quitter reste évidemment possible.
    expect(wrapper.text()).toContain('Quitter le salon')
  })

  it('lance la partie via start_game puis ouvre la page de jeu avec le round', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.button--primary').trigger('click')
    await flushPromises()

    // Le lancement délègue à la fonction Postgres (création du round incluse)…
    expect(rpc).toHaveBeenCalledWith('start_game', { p_lobby_id: 'lobby-1' })
    // … puis emporte l'id du round dans l'URL de la page de jeu.
    expect(navigateToMock).toHaveBeenCalledWith('/game/lobby-1?round=round-1')
  })

  it('quitte le salon puis revient à l’accueil', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.button--danger').trigger('click')
    await flushPromises()

    expect(table.delete).toHaveBeenCalled()
    expect(table.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(navigateToMock).toHaveBeenCalledWith('/')
  })

  it('présente le lien d’invitation comme désactivé et à venir', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const soon = wrapper.find('.soon')
    expect(soon.find('button').attributes('disabled')).toBeDefined()
    expect(soon.text()).toContain('Bientôt disponible')
  })
})

describe('Page salon — synchro temps réel', () => {
  it('souscrit aux changements de lobby_players filtrés sur le salon courant', async () => {
    mountPage()
    await flushPromises()

    expect(channelSpy).toHaveBeenCalled()
    expect(channelFor('lobby_players')?.config).toMatchObject({
      event: '*',
      schema: 'public',
      table: 'lobby_players',
      filter: 'lobby_id=eq.lobby-1'
    })
  })

  it('met à jour la grille et le compteur quand un joueur rejoint, sans rechargement', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('.player')).toHaveLength(2)
    expect(wrapper.text()).toContain('2 / 6 connectés')

    // Un troisième joueur arrive : la base renverra désormais trois lignes.
    table.result = {
      data: {
        ...LOBBY,
        lobby_players: [
          ...LOBBY.lobby_players,
          { id: 'lp-3', user_id: 'user-3', is_host: false, is_ready: false, profile: { pseudo: 'NovaByte', xp: 1200 } }
        ]
      },
      error: null
    }

    // L'événement Realtime déclenche le refetch silencieux.
    fireChannel('lobby_players', { eventType: 'INSERT' })
    await flushPromises()

    expect(wrapper.findAll('.player')).toHaveLength(3)
    expect(wrapper.text()).toContain('NovaByte')
    expect(wrapper.text()).toContain('3 / 6 connectés')
    // La vue n'est jamais repassée par l'état « Chargement… ».
    expect(wrapper.text()).not.toContain('Chargement du salon')
  })

  it('reflète un départ en libérant une place dans la grille', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('.slot')).toHaveLength(4)

    // Il ne reste que l'hôte : cinq places redeviennent libres.
    table.result = {
      data: { ...LOBBY, lobby_players: [LOBBY.lobby_players[0]] },
      error: null
    }

    fireChannel('lobby_players', { eventType: 'DELETE' })
    await flushPromises()

    expect(wrapper.findAll('.player')).toHaveLength(1)
    expect(wrapper.text()).toContain('1 / 6 connectés')
    expect(wrapper.findAll('.slot')).toHaveLength(5)
  })

  it('ferme les canaux Realtime au démontage pour ne pas fuiter de connexion', async () => {
    const wrapper = mountPage()
    await flushPromises()

    wrapper.unmount()

    // Deux canaux ouverts (joueurs + statut) → deux fermetures.
    expect(removeChannel).toHaveBeenCalledTimes(2)
  })
})

describe('Page salon — bascule en partie', () => {
  it('souscrit au statut du salon, filtré sur sa ligne', async () => {
    mountPage()
    await flushPromises()

    expect(channelFor('lobbies')?.config).toMatchObject({
      event: 'UPDATE',
      schema: 'public',
      table: 'lobbies',
      filter: 'id=eq.lobby-1'
    })
  })

  it('redirige un joueur non hôte vers la partie quand l’hôte lance', async () => {
    currentUser = 'user-2' // je ne suis pas l'hôte (user-1)
    mountPage()
    await flushPromises()

    fireChannel('lobbies', { new: { status: 'in_progress' } })

    expect(navigateToMock).toHaveBeenCalledWith('/game/lobby-1')
  })

  it('ne redirige pas l’hôte via Realtime (il navigue déjà via « Lancer l’arène »)', async () => {
    currentUser = 'user-1' // hôte
    mountPage()
    await flushPromises()

    fireChannel('lobbies', { new: { status: 'in_progress' } })

    expect(navigateToMock).not.toHaveBeenCalledWith('/game/lobby-1')
  })

  it('file directement en partie si le salon a déjà démarré (rechargement)', async () => {
    table.result = { data: { ...LOBBY, status: 'in_progress' }, error: null }
    mountPage()
    await flushPromises()

    expect(navigateToMock).toHaveBeenCalledWith('/game/lobby-1')
  })
})
