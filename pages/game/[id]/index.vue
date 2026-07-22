<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useGame, type RoundQuestion, type AnswerResult, NEXT_ROUND_ERROR } from '~/composables/useGame'
import { useLobby } from '~/composables/useLobby'
import {
  answerState,
  formatRoundProgress,
  isLastRound,
  remainingSeconds,
  ROUND_DURATION_S,
  type AnswerOutcome,
  type RankedPlayer
} from '~/utils/game'

const route = useRoute()
const lobbyId = computed(() => String(route.params.id ?? ''))

// Le round peut être transmis dans l'URL (?round=…) au lancement, pour l'afficher
// sans aller-retour. Sinon on interroge la base pour le round en cours.
const queryRound = computed(() => {
  const raw = route.query.round
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] ?? '') : ''
})

const {
  pending,
  errorMessage,
  resolveUserId,
  fetchGameMeta,
  fetchActiveRound,
  nextRound,
  fetchQuestion,
  fetchLeaderboard,
  submitAnswer,
  subscribeToRounds,
  subscribeToScores,
  unsubscribeChannel
} = useGame()

// Le suivi du statut du lobby (fin de partie) vit dans useLobby, réutilisé ici.
const { subscribeToLobbyStatus } = useLobby()

type PageStatus = 'pending' | 'loaded' | 'error'
const status = ref<PageStatus>('pending')

// Fin de partie : tous les clients basculent sur l'écran de résultats (3d).
const goToResults = () => navigateTo(`/game/${lobbyId.value}/results`)

const question = ref<RoundQuestion | null>(null)
const leaderboard = ref<RankedPlayer[]>([])

// Verrouillage de la réponse : une seule réponse par question (côté serveur
// aussi, via `unique (round_id, user_id)`). `outcome` porte le verdict serveur.
const outcome = ref<AnswerOutcome | null>(null)
const lastResult = ref<AnswerResult | null>(null)
const answered = computed(() => outcome.value !== null)
const answerError = ref('')

// Métronome : seul l'hôte fait défiler les questions. En solo (3b), le joueur EST l'hôte.
const meId = ref<string | null>(null)
const hostId = ref<string | null>(null)
const isHost = computed(() => Boolean(meId.value) && meId.value === hostId.value)

// Décompte dérivé du temps SERVEUR (started_at), pas d'un compteur local. `timeUp` verrouille la réponse.
const remaining = ref(ROUND_DURATION_S)
const timeUp = computed(() => remaining.value === 0)

// Garde-fou : le métronome ne se déclenche qu'une fois par round.
const advancing = ref(false)

const progressLabel = computed(() =>
  question.value ? formatRoundProgress(question.value.roundNumber) : ''
)
const isFinalQuestion = computed(() =>
  question.value ? isLastRound(question.value.roundNumber) : false
)

const RING_CIRCUMFERENCE = 2 * Math.PI * 20
const ringOffset = computed(() =>
  RING_CIRCUMFERENCE * (1 - remaining.value / ROUND_DURATION_S)
)

useHead({
  title: computed(() =>
    question.value ? `Question ${progressLabel.value} — Battlemind` : 'Partie — Battlemind'
  )
})

/** État visuel d'un bouton une fois la question verrouillée (pur, testé). */
const stateOf = (key: string) => answerState(key, outcome.value)

/** Restitution accessible (RGAA 7.4) : verdict et expiration annoncés en zone `status`, pas seulement par la couleur. */
const resultAnnouncement = computed(() => {
  if (timeUp.value && !answered.value) return 'Temps écoulé. Tu n’as pas répondu à temps.'
  if (!outcome.value) return ''
  if (lastResult.value?.isCorrect) return 'Bonne réponse !'
  const good = question.value?.answers.find(answer => answer.key === outcome.value!.correctKey)
  return `Mauvaise réponse. La bonne réponse était : ${good?.text ?? outcome.value!.correctKey}.`
})

// --- Boucle de jeu : timer + enchaînement --------------------------------
// On relit `remainingSeconds` à chaque top ; la vérité reste `started_at`.
let ticker: ReturnType<typeof setInterval> | null = null

const stopTicker = () => {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

const tick = () => {
  if (!question.value) return
  remaining.value = remainingSeconds(question.value.startedAt, Date.now())
  if (remaining.value === 0) void onTimeUp()
}

const startTicker = () => {
  stopTicker()
  tick() // affichage immédiat
  ticker = setInterval(tick, 250)
}

/** Remet à zéro l'état de réponse et relance le décompte pour une nouvelle question. */
const applyQuestion = (loaded: RoundQuestion) => {
  question.value = loaded
  outcome.value = null
  lastResult.value = null
  answerError.value = ''
  remaining.value = remainingSeconds(loaded.startedAt, Date.now())
}

/** Rafraîchit le classement (score écrit côté serveur, jamais dérivé localement). */
const refreshLeaderboard = async () => {
  leaderboard.value = await fetchLeaderboard(lobbyId.value)
}

/**
 * Charge un round et relance le décompte. Appelé par la souscription `game_rounds`
 * (INSERT) : quand l'hôte crée le round suivant, TOUS les clients passent à la
 * même question au même instant. Une erreur transitoire de chargement laisse la
 * question courante en place (le prochain round rattrapera), plutôt que de casser
 * la partie.
 */
const loadRound = async (roundId: string) => {
  if (status.value === 'finished') return
  const loaded = await fetchQuestion(roundId)
  if (!loaded) return
  applyQuestion(loaded)
  await refreshLeaderboard()
  startTicker()
}

/**
 * À l'expiration : réponses verrouillées (`timeUp`). Seul l'HÔTE déclenche
 * `next_round` (métronome) ; un non-hôte ne le fait JAMAIS, il attend passivement
 * le nouveau round via Realtime. La question suivante n'est pas chargée ici :
 * l'INSERT sur `game_rounds` s'en charge pour tous les clients à l'identique
 * (`loadRound`). Fin de partie (après le round 10) → écran final.
 */
const onTimeUp = async () => {
  if (!isHost.value || advancing.value || status.value !== 'loaded') return
  advancing.value = true
  stopTicker() // le décompte reste figé jusqu'à l'arrivée du prochain round

  const result = await nextRound(lobbyId.value)
  advancing.value = false

  if (!result) {
    // Fail closed : on n'enchaîne pas et on ne martèle pas. Issue = nav globale du layout.
    answerError.value = NEXT_ROUND_ERROR
    return
  }
  // Après le round 10 : la partie est close, direction l'écran de résultats.
  if (result.finished) await goToResults()
}

// Canaux Realtime de la partie (synchro 3c), fermés au démontage.
let roundsChannel: RealtimeChannel | null = null
let scoresChannel: RealtimeChannel | null = null
let statusChannel: RealtimeChannel | null = null

onMounted(async () => {
  meId.value = await resolveUserId()

  const meta = await fetchGameMeta(lobbyId.value)
  hostId.value = meta?.hostId ?? null

  // Partie déjà finie (rechargement après le dernier round) : direction les résultats.
  if (meta?.status === 'finished') {
    await goToResults()
    return
  }

  const roundId = queryRound.value || (await fetchActiveRound(lobbyId.value))
  if (!roundId) {
    status.value = 'error'
    return
  }

  const loaded = await fetchQuestion(roundId)
  if (!loaded) {
    status.value = 'error'
    return
  }

  question.value = loaded
  remaining.value = remainingSeconds(loaded.startedAt, Date.now())
  await refreshLeaderboard()
  status.value = 'loaded'
  startTicker()

  // --- Synchro multi-client (3c) ---------------------------------------
  // Nouveau round créé par l'hôte → tous les clients chargent la même question.
  roundsChannel = subscribeToRounds(lobbyId.value, round => void loadRound(round.id))
  // Un score change → le classement live se rafraîchit chez tout le monde.
  scoresChannel = subscribeToScores(lobbyId.value, () => void refreshLeaderboard())
  // L'hôte a terminé la partie (status → finished) → écran de résultats pour tous.
  statusChannel = subscribeToLobbyStatus(lobbyId.value, s => {
    if (s === 'finished') {
      stopTicker()
      goToResults()
    }
  })
})

// Ne laisser ni intervalle ni canal Realtime ouverts après la sortie de la page.
onUnmounted(() => {
  stopTicker()
  for (const channel of [roundsChannel, scoresChannel, statusChannel]) {
    if (channel) unsubscribeChannel(channel)
  }
})

const onAnswer = async (key: string) => {
  // On ne répond qu'une fois, jamais pendant une soumission, jamais hors délai.
  if (answered.value || pending.value || timeUp.value || !question.value) return
  answerError.value = ''

  const result = await submitAnswer(question.value.roundId, key)
  if (!result) {
    answerError.value = errorMessage.value || 'Ta réponse n’a pas pu être enregistrée.'
    return
  }

  // Le verdict fige l'affichage (vert/rouge) ; mon score se reflète tout de suite
  // (les autres clients le verront via la souscription `subscribeToScores`).
  lastResult.value = result
  outcome.value = { selectedKey: key, correctKey: result.correctKey }
  await refreshLeaderboard()
}
</script>

<template>
  <main class="game">
    <template v-if="status === 'pending'">
      <h1 class="sr-only">Partie</h1>
      <p class="state" role="status">Chargement de la question…</p>
    </template>

    <template v-else-if="status === 'error' || !question">
      <h1 class="sr-only">Partie indisponible</h1>
      <p class="state state--error" role="alert">
        <img src="/icons/close.svg" alt="" width="12" height="12">
        {{ errorMessage || 'Cette partie n’a pas encore de question active.' }}
      </p>
      <NuxtLink class="button button--ghost" :to="`/lobby/${lobbyId}`">Retour au salon</NuxtLink>
    </template>

    <div v-else class="layout">
      <section class="board">
        <div class="board__header">
          <div class="board__meta">
            <!-- Numéro annoncé au changement (RGAA 7.4) ; le timer n'est pas verbalisé chaque seconde. -->
            <p class="board__progress" aria-live="polite">Question {{ progressLabel }}</p>
            <p v-if="isFinalQuestion" class="board__final">
              <img src="/icons/rank.svg" alt="" width="14" height="14">
              Dernière question
            </p>
          </div>

          <div class="timer" role="timer" aria-label="Temps restant pour répondre à la question">
            <svg class="timer__ring" viewBox="0 0 44 44" aria-hidden="true">
              <circle class="timer__track" cx="22" cy="22" r="20" fill="none" />
              <circle
                class="timer__progress"
                cx="22"
                cy="22"
                r="20"
                fill="none"
                :stroke-dasharray="RING_CIRCUMFERENCE"
                :stroke-dashoffset="ringOffset"
              />
            </svg>
            <span class="timer__value" aria-hidden="true">{{ remaining }}</span>
          </div>
        </div>

        <div class="board__question">
          <h1 class="question">{{ question.questionText }}</h1>
        </div>

        <div class="answers" role="group" aria-label="Réponses proposées">
          <button
            v-for="answer in question.answers"
            :key="answer.key"
            class="answer"
            :class="{
              'answer--correct': stateOf(answer.key) === 'correct',
              'answer--incorrect': stateOf(answer.key) === 'incorrect'
            }"
            type="button"
            :disabled="answered || pending || timeUp"
            @click="onAnswer(answer.key)"
          >
            <span class="answer__key" aria-hidden="true">{{ answer.key }}</span>
            <span class="answer__text">{{ answer.text }}</span>
            <!-- État doublé d'un libellé texte : jamais porté par la seule couleur (RGAA 3.1). -->
            <span
              v-if="stateOf(answer.key) === 'correct'"
              class="answer__flag answer__flag--correct"
            >Bonne réponse</span>
            <span
              v-else-if="stateOf(answer.key) === 'incorrect'"
              class="answer__flag answer__flag--incorrect"
            >Ta réponse</span>
          </button>
        </div>

        <!-- Le verdict est annoncé aux lecteurs d'écran dès qu'il est connu. -->
        <p class="sr-only" role="status">{{ resultAnnouncement }}</p>

        <p v-if="answerError" class="state state--error" role="alert">
          <img src="/icons/close.svg" alt="" width="12" height="12">
          {{ answerError }}
        </p>
      </section>

      <aside class="hud">
        <section class="leaderboard" aria-labelledby="leaderboard-title">
          <h2 id="leaderboard-title" class="leaderboard__title">
            <img src="/icons/rank.svg" alt="" width="16" height="16">
            Classement de l’arène
          </h2>

          <ol class="leaderboard__list">
            <li
              v-for="player in leaderboard"
              :key="player.userId"
              class="rank"
              :class="{ 'rank--me': player.isMe }"
            >
              <span class="rank__position">{{ player.rank }}</span>
              <span class="rank__avatar" aria-hidden="true">{{ player.initials }}</span>
              <span class="rank__pseudo">
                {{ player.pseudo }}
                <span v-if="player.isMe" class="sr-only">(toi)</span>
              </span>
              <span class="rank__score">{{ player.score }} pts</span>
            </li>
          </ol>
        </section>

        <img class="hud__logo" src="/icons/logo-symbole-footer.svg" alt="" width="46" height="35">
      </aside>
    </div>
  </main>
</template>

<style scoped>
.game {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.layout {
  display: flex;
  flex: 1;
  align-items: stretch;
  min-height: 0;
}

/* --- Colonne question -------------------------------------------------- */

.board {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  padding: 42px;
  border-right: 1px solid var(--color-border-subtle);
}

.board__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.board__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.board__progress {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

/* « Dernière question » : info doublée d'une icône, pas la seule couleur (RGAA 3.1). */
.board__final {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.9px;
  line-height: 1;
  text-transform: uppercase;
}

/* --- Compte à rebours (dérivé de started_at côté serveur) -------------- */

.timer {
  position: relative;
  display: flex;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.timer__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Départ à 12 h, vidage horaire. */
  transform: rotate(-90deg);
}

.timer__track {
  stroke: var(--color-border-subtle);
  stroke-width: 4;
}

/* Objet graphique porteur d'info → contraste ≥ 3:1 (accent). */
.timer__progress {
  stroke: var(--color-accent);
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear;
}

.timer__value {
  position: relative;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: 1;
}

.board__question {
  display: flex;
  flex: 1;
  align-items: center;
  min-height: 0;
}

.question {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-question);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: normal;
}

.answers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.answer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 17px 25px;
  /* Bordure interactive (≥ 3:1) : le bouton reste perceptible, RGAA 3.3. */
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition: filter 0.15s ease, border-color 0.15s ease;
}

.answer:hover:not(:disabled) {
  filter: brightness(1.15);
  border-color: var(--color-accent);
}

.answer:disabled {
  cursor: default;
}

.answer__key {
  display: flex;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-interactive);
  border-radius: 4px;
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
}

.answer__text {
  min-width: 0;
}

/* Réponse juste et réponse choisie : couleur ET libellé texte (RGAA 3.1). */
.answer--correct {
  border-color: var(--color-success);
}

.answer--correct .answer__key {
  border-color: var(--color-success);
  color: var(--color-success);
}

.answer--incorrect {
  border-color: var(--color-danger);
}

.answer--incorrect .answer__key {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

/* Les réponses non retenues s'effacent pour laisser lire le verdict. */
.answer:disabled:not(.answer--correct):not(.answer--incorrect) {
  opacity: 0.55;
}

.answer__flag {
  margin-left: auto;
  flex-shrink: 0;
  padding: 3px 9px;
  border: 1px solid currentcolor;
  border-radius: 4px;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  letter-spacing: 0.9px;
  line-height: 15px;
  text-transform: uppercase;
}

.answer__flag--correct {
  color: var(--color-success);
}

.answer__flag--incorrect {
  color: var(--color-danger);
}

/* --- Colonne classement ------------------------------------------------ */

.hud {
  display: flex;
  width: 320px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 24px;
  padding: 42px 24px;
  background-color: var(--color-surface-overlay);
}

.leaderboard {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.leaderboard__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-transform: uppercase;
}

.leaderboard__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  background-color: var(--color-surface-overlay);
}

/* Ma ligne se distingue par la bordure ET le libellé « (toi) » (SR). */
.rank--me {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
}

.rank__position {
  width: 16px;
  flex-shrink: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
  text-align: center;
}

.rank--me .rank__position {
  color: var(--color-accent);
}

.rank__avatar {
  display: flex;
  width: 25px;
  height: 25px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-interactive);
  border-radius: 9999px;
  background-color: var(--color-background);
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}

.rank__pseudo {
  overflow: hidden;
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank__score {
  flex-shrink: 0;
  color: var(--color-success);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.hud__logo {
  align-self: center;
  margin-top: auto;
  opacity: 0.85;
}

/* --- États & bouton retour --------------------------------------------- */

.state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 42px;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.state--error {
  color: var(--color-danger);
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 42px;
  padding: 10px 24px;
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-decoration: none;
}

.button--ghost:hover {
  filter: brightness(1.12);
}

@media (max-width: 900px) {
  .layout {
    flex-direction: column;
  }

  .board {
    border-right: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .answers {
    grid-template-columns: 1fr;
  }

  .hud {
    width: 100%;
  }
}
</style>
