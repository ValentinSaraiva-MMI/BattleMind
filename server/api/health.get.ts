/**
 * Sonde de santé applicative.
 *
 * Contrôle la chaîne complète : rendu serveur Nuxt, réseau, PostgREST, PostgreSQL,
 * évaluation des politiques de sécurité. La requête appelle la fonction health_check,
 * exécutée en security definer : elle lit une table de référence sans qu'aucun
 * privilège de lecture n'ait été accordé au rôle anonyme, et ne renvoie qu'un décompte.
 *
 * Trois états possibles :
 *   ok        la base répond sous le seuil de dégradation
 *   degraded  la base répond au-delà du seuil, sans indisponibilité
 *   down      la base ne répond pas, ou répond en erreur (HTTP 503)
 *
 * La distinction entre "degraded" et "down" sépare le critère de performance du
 * critère de disponibilité : une latence élevée n'est pas une panne.
 */

const DB_TIMEOUT_MS = 5000
const DEGRADED_THRESHOLD_MS = 400

export default defineEventHandler(async (event) => {
  // Une sonde ne doit jamais lire une réponse mise en cache.
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabase.url
  const supabaseKey = config.public.supabase.key

  const startedAt = Date.now()
  let dbLatencyMs: number
  let dbError: string | null = null

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/health_check`, {
      headers: {
        apikey: supabaseKey,
      },
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    })
    dbLatencyMs = Date.now() - startedAt

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      dbError = `HTTP ${response.status} ${body.slice(0, 200)}`.trim()
    }
  }
  catch (error) {
    dbLatencyMs = Date.now() - startedAt
    dbError = error instanceof Error ? error.message : 'erreur inconnue'
  }

  const status = dbError
    ? 'down'
    : dbLatencyMs > DEGRADED_THRESHOLD_MS
      ? 'degraded'
      : 'ok'

  if (status === 'down') {
    setResponseStatus(event, 503)
  }

  return {
    status,
    db_latency_ms: dbLatencyMs,
    db_error: dbError,
    version: config.public.commitSha,
    timestamp: new Date().toISOString(),
  }
})
