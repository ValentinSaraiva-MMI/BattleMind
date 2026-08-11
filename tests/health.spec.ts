import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * La sonde /api/health s'appuie sur des auto-imports serveur (Nitro/H3) que le
 * runtime Nuxt injecte en production : defineEventHandler, useRuntimeConfig,
 * setResponseHeader, setResponseStatus. On les expose en globals AVANT d'importer
 * le module, defineEventHandler renvoyant simplement le handler pour l'appeler
 * directement. La base est simulée en stubbant `fetch`, et l'horloge via Date.now.
 */

const setResponseHeader = vi.fn()
const setResponseStatus = vi.fn()

let runtimeConfig: {
  public: { supabase: { url: string, key: string }, commitSha: string }
}

// Fonction simple (pas un vi.fn) : elle lit `runtimeConfig` à chaque appel et
// survit ainsi à vi.restoreAllMocks() entre les tests.
Object.assign(globalThis, {
  defineEventHandler: <T>(handler: T): T => handler,
  setResponseHeader,
  setResponseStatus,
  useRuntimeConfig: () => runtimeConfig,
})

// Import après avoir posé les globals, sinon defineEventHandler est indéfini.
const { default: handler } = await import('~/server/api/health.get')

const event = {} as never

/** Fixe deux valeurs successives pour Date.now : le handler l'appelle une fois
 *  avant la requête, une fois après. La différence est la latence mesurée. */
const withLatency = (ms: number) => {
  vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_000 + ms)
}

beforeEach(() => {
  vi.clearAllMocks()
  runtimeConfig = {
    public: {
      supabase: { url: 'https://db.example.co', key: 'anon-key' },
      commitSha: 'abc1234',
    },
  }
})

afterEach(() => {
  // Retire le spy sur Date.now et rend le fetch d'origine.
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('GET /api/health', () => {
  it('désactive le cache et renvoie la version du build', async () => {
    withLatency(50)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await handler(event)

    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store')
    expect(result.version).toBe('abc1234')
    expect(typeof result.timestamp).toBe('string')
  })

  it('interroge la fonction de santé avec la clé anon', async () => {
    withLatency(50)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await handler(event)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://db.example.co/rest/v1/rpc/health_check')
    expect(init.headers.apikey).toBe('anon-key')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('répond "ok" quand la base répond sous le seuil de dégradation', async () => {
    withLatency(120)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await handler(event)

    expect(result.status).toBe('ok')
    expect(result.db_latency_ms).toBe(120)
    expect(result.db_error).toBeNull()
    expect(setResponseStatus).not.toHaveBeenCalled()
  })

  it('répond "degraded" au-delà du seuil, sans passer en 503', async () => {
    withLatency(450)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await handler(event)

    expect(result.status).toBe('degraded')
    expect(result.db_latency_ms).toBe(450)
    expect(result.db_error).toBeNull()
    expect(setResponseStatus).not.toHaveBeenCalled()
  })

  it('répond "down" en 503 quand PostgREST renvoie une erreur HTTP', async () => {
    withLatency(50)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('internal error'),
    }))

    const result = await handler(event)

    expect(result.status).toBe('down')
    expect(result.db_error).toContain('HTTP 500')
    expect(setResponseStatus).toHaveBeenCalledWith(event, 503)
  })

  it('répond "down" en 503 quand la requête échoue (réseau ou timeout)', async () => {
    withLatency(50)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    const result = await handler(event)

    expect(result.status).toBe('down')
    expect(result.db_error).toBe('timeout')
    expect(setResponseStatus).toHaveBeenCalledWith(event, 503)
  })
})
