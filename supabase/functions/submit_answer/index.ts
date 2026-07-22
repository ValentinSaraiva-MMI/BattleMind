import { createClient } from 'jsr:@supabase/supabase-js@2'

// Durée d'une question, en secondes. Doit correspondre au timer côté client.
const ROUND_DURATION_S = 10

Deno.serve(async (req) => {
  // --- CORS (préflight) : le navigateur envoie un OPTIONS avant le POST ---
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- 1. Identifier le joueur À PARTIR DE SON JWT, jamais d'un id envoyé ---
    // Le client transmet son jeton de session dans l'en-tête Authorization.
    // On crée un client "utilisateur" pour lire QUI il est de façon fiable.
    const authHeader = req.headers.get('Authorization')!
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return json({ error: 'Non authentifié' }, 401, corsHeaders)
    }

    // --- 2. Lire les données envoyées par le client : SEULEMENT round_id + réponse ---
    const { round_id, selected_key } = await req.json()
    if (!round_id || !selected_key) {
      return json({ error: 'Paramètres manquants' }, 400, corsHeaders)
    }

    // --- 3. Client "admin" (service_role) : outrepasse la RLS pour la validation ---
    // Cette clé est un secret serveur, injecté par Supabase, jamais exposé au client.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('BATTLEMIND_SECRET_KEY')!,
    )

     // LOG TEMPORAIRE DE DIAGNOSTIC
    console.log('URL présente:', !!Deno.env.get('SUPABASE_URL'))
    console.log('SERVICE_ROLE présente:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    console.log('BATTLEMIND_SECRET_KEY présente:', !!Deno.env.get('BATTLEMIND_SECRET_KEY'))
    console.log('round_id reçu:', round_id)

    // --- 4. Récupérer le round (pour la question + l'heure de début) ---
    const { data: round, error: roundError } = await admin
      .from('game_rounds')
      .select('id, lobby_id, question_id, started_at, status')
      .eq('id', round_id)
      .single()

      
    // LOG DIAGNOSTIC
    console.log('round trouvé:', JSON.stringify(round))
    console.log('erreur requête:', JSON.stringify(roundError))

    
    if (roundError || !round) {
      return json({ error: 'Round introuvable' }, 404, corsHeaders)
    }

    // --- 5. ANTI-TRICHE TEMPOREL : la réponse arrive-t-elle dans les temps ? ---
    const elapsed = (Date.now() - new Date(round.started_at).getTime()) / 1000
    if (elapsed > ROUND_DURATION_S) {
      return json({ error: 'Temps écoulé' }, 403, corsHeaders)
    }

    // --- 6. Récupérer la bonne réponse (JAMAIS envoyée au client avant ce point) ---
    const { data: question, error: qError } = await admin
      .from('questions')
      .select('correct_key')
      .eq('id', round.question_id)
      .single()
    if (qError || !question) {
      return json({ error: 'Question introuvable' }, 404, corsHeaders)
    }

    const isCorrect = selected_key === question.correct_key

    // --- 7. Enregistrer la réponse. Le unique(round_id,user_id) empêche le doublon ---
    const { error: insertError } = await admin
      .from('player_answers')
      .insert({
        lobby_id: round.lobby_id,
        round_id: round.id,
        user_id: user.id,
        selected_key,
        is_correct: isCorrect,
      })
    if (insertError) {
      // Code 23505 = violation d'unicité => le joueur a déjà répondu à ce tour.
      if (insertError.code === '23505') {
        return json({ error: 'Déjà répondu' }, 409, corsHeaders)
      }
      return json({ error: 'Erreur enregistrement' }, 500, corsHeaders)
    }

    // --- 8. Mettre à jour score + streak du joueur dans lobby_players ---
    // On lit l'état courant puis on écrit le nouveau (score +1 si correct, streak géré).
    const { data: lp } = await admin
      .from('lobby_players')
      .select('score, streak')
      .eq('lobby_id', round.lobby_id)
      .eq('user_id', user.id)
      .single()

    const newScore = (lp?.score ?? 0) + (isCorrect ? 1 : 0)
    const newStreak = isCorrect ? (lp?.streak ?? 0) + 1 : 0

    await admin
      .from('lobby_players')
      .update({ score: newScore, streak: newStreak })
      .eq('lobby_id', round.lobby_id)
      .eq('user_id', user.id)

    // --- 9. Réponse au client : juste/faux + la bonne réponse (pour l'affichage vert) ---
    // correct_key ne part QU'ICI, après que le joueur a verrouillé son choix.
    return json({
      is_correct: isCorrect,
      correct_key: question.correct_key,
      score: newScore,
      streak: newStreak,
    }, 200, corsHeaders)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    return json({ error: 'Erreur serveur' }, 500, { 'Access-Control-Allow-Origin': '*' })
  }
})

// Petit utilitaire pour renvoyer du JSON avec les bons en-têtes.
function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}