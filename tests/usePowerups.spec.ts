// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import {
  usePowerups,
  DRAW_POWERUP_ERROR,
  APPLY_POWERUP_ERROR,
  ACTIVE_POWERUPS_ERROR
} from '~/composables/usePowerups'

let drawResult: { data: unknown, error: unknown }
let applyResult: { data: unknown, error: unknown }
let activeResult: { data: unknown, error: unknown }
let rpc: ReturnType<typeof vi.fn>

// Mock du canal Realtime : capture le nom, la config du filtre et le handler.
let channelObj: Record<string, ReturnType<typeof vi.fn>>
let channelSpy: ReturnType<typeof vi.fn>
let removeChannel: ReturnType<typeof vi.fn>
let realtimeConfig: unknown
let realtimeHandler: ((payload: unknown) => void) | null

beforeEach(() => {
  drawResult = { data: null, error: null }
  applyResult = { data: null, error: null }
  activeResult = { data: [], error: null }

  rpc = vi.fn((name: string) => {
    if (name === 'draw_powerup') return Promise.resolve(drawResult)
    if (name === 'apply_powerup') return Promise.resolve(applyResult)
    return Promise.resolve(activeResult)
  })

  realtimeConfig = null
  realtimeHandler = null
  channelObj = {} as Record<string, ReturnType<typeof vi.fn>>
  channelObj.on = vi.fn((_type: string, config: unknown, handler: (payload: unknown) => void) => {
    realtimeConfig = config
    realtimeHandler = handler
    return channelObj
  })
  channelObj.subscribe = vi.fn(() => channelObj)
  channelSpy = vi.fn(() => channelObj)
  removeChannel = vi.fn()

  vi.stubGlobal('useSupabaseClient', () => ({
    rpc,
    channel: channelSpy,
    removeChannel
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const setup = async () => {
  let api: ReturnType<typeof usePowerups> | undefined
  const Consumer = defineComponent({
    setup() {
      api = usePowerups()
      return () => null
    }
  })

  mount(Consumer)
  await flushPromises()

  return api!
}

describe('usePowerups — drawPowerup', () => {
  const DRAWN = {
    instance_id: 'inst-1',
    code: 'fifty_fifty',
    kind: 'bonus',
    target: 'self',
    name: '50/50',
    description: 'Retire deux mauvaises réponses.',
    status: 'available'
  }

  it('délègue le tirage au serveur et projette le power-up accordé en camelCase', async () => {
    drawResult = { data: { granted: true, streak: 3, powerup: DRAWN }, error: null }
    const api = await setup()

    const result = await api.drawPowerup('lobby-1')

    expect(rpc).toHaveBeenCalledWith('draw_powerup', { p_lobby_id: 'lobby-1' })
    expect(result).toEqual({
      granted: true,
      streak: 3,
      powerup: {
        instanceId: 'inst-1',
        code: 'fifty_fifty',
        // C'est la base qui décide du type et de la cible, jamais le client.
        kind: 'bonus',
        target: 'self',
        name: '50/50',
        description: 'Retire deux mauvaises réponses.',
        status: 'available'
      }
    })
  })

  it('distingue le tirage refusé pour série insuffisante d’une erreur', async () => {
    drawResult = { data: { granted: false, streak: 1 }, error: null }
    const api = await setup()

    const result = await api.drawPowerup('lobby-1')

    // Refus légitime : la série courante remonte pour l'affichage…
    expect(result).toEqual({ granted: false, streak: 1 })
    // …et rien ne s'affiche comme une panne.
    expect(api.errorMessage.value).toBe('')
  })

  it('reste fail closed sur exception réseau', async () => {
    rpc.mockRejectedValueOnce(new Error('network down'))
    const api = await setup()

    expect(await api.drawPowerup('lobby-1')).toBeNull()
    // Aucun détail technique ne remonte à l'écran.
    expect(api.errorMessage.value).toBe(DRAW_POWERUP_ERROR)
  })
})

describe('usePowerups — applyPowerup', () => {
  it('active un bonus sans cible : p_target_id explicitement à null', async () => {
    const api = await setup()

    expect(await api.applyPowerup('inst-1')).toBe(true)
    // Le serveur applique le bonus à l'appelant : on ne lui souffle jamais son identité.
    expect(rpc).toHaveBeenCalledWith('apply_powerup', {
      p_instance_id: 'inst-1',
      p_target_id: null
    })
  })

  it('active un malus sur la cible choisie', async () => {
    const api = await setup()

    expect(await api.applyPowerup('inst-2', 'user-2')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('apply_powerup', {
      p_instance_id: 'inst-2',
      p_target_id: 'user-2'
    })
  })

  it('reste fail closed si le serveur refuse (exemplaire déjà consommé, non possédé)', async () => {
    applyResult = { data: null, error: { message: 'Power-up indisponible' } }
    const api = await setup()

    expect(await api.applyPowerup('inst-1')).toBe(false)
    expect(api.errorMessage.value).toBe(APPLY_POWERUP_ERROR)
  })
})

describe('usePowerups — fetchActivePowerups', () => {
  it('projette les effets actifs du round en camelCase', async () => {
    activeResult = {
      data: [
        { instance_id: 'inst-1', code: 'shield', kind: 'bonus', name: 'Bouclier', duration_s: 20 },
        { instance_id: 'inst-2', code: 'blackout', kind: 'malus', name: 'Blackout', duration_s: null }
      ],
      error: null
    }
    const api = await setup()

    const active = await api.fetchActivePowerups('lobby-1', 4)

    expect(rpc).toHaveBeenCalledWith('get_active_powerups', {
      p_lobby_id: 'lobby-1',
      p_round_number: 4
    })
    expect(active).toEqual([
      { instanceId: 'inst-1', code: 'shield', kind: 'bonus', name: 'Bouclier', durationS: 20 },
      // Effet instantané : pas de durée, et surtout pas de 0 inventé côté client.
      { instanceId: 'inst-2', code: 'blackout', kind: 'malus', name: 'Blackout', durationS: null }
    ])
  })

  it('renvoie une liste vide sur erreur de lecture — jamais d’échec bloquant', async () => {
    activeResult = { data: null, error: { code: '42501' } }
    const api = await setup()

    expect(await api.fetchActivePowerups('lobby-1', 4)).toEqual([])
    expect(api.errorMessage.value).toBe(ACTIVE_POWERUPS_ERROR)
  })

  it('renvoie une liste vide sur exception réseau', async () => {
    rpc.mockRejectedValueOnce(new Error('network down'))
    const api = await setup()

    expect(await api.fetchActivePowerups('lobby-1', 4)).toEqual([])
  })
})

describe('usePowerups — souscriptions Realtime', () => {
  it('subscribeToLobbyPhase : UPDATE lobbies filtré sur l’id, passe phase et départ serveur', async () => {
    const api = await setup()
    const onPhase = vi.fn()

    const channel = api.subscribeToLobbyPhase('lobby-1', onPhase)

    expect(channelSpy).toHaveBeenCalledWith('lobby-phase:lobby-1')
    expect(realtimeConfig).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'lobbies',
      filter: 'id=eq.lobby-1'
    })
    // Le départ SERVEUR de la phase pilote le décompte de la salle.
    realtimeHandler!({ new: { phase: 'powerup', phase_started_at: '2026-07-21T10:00:00Z' } })
    expect(onPhase).toHaveBeenCalledWith('powerup', '2026-07-21T10:00:00Z')
    expect(channel).toBe(channelObj)
  })

  it('subscribeToLobbyPhase : tolère un départ de phase absent', async () => {
    const api = await setup()
    const onPhase = vi.fn()

    api.subscribeToLobbyPhase('lobby-1', onPhase)
    realtimeHandler!({ new: { phase: 'question', phase_started_at: null } })

    expect(onPhase).toHaveBeenCalledWith('question', null)
  })

  it('unsubscribeChannel ferme le canal pour libérer la connexion', async () => {
    const api = await setup()
    const channel = api.subscribeToLobbyPhase('lobby-1', () => {})

    api.unsubscribeChannel(channel)

    expect(removeChannel).toHaveBeenCalledWith(channelObj)
  })
})
