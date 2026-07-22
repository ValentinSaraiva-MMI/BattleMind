<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useGame } from '~/composables/useGame'
import { useLobby } from '~/composables/useLobby'
import { splitStandings, xpForScore, ordinalFr, type RankedPlayer } from '~/utils/game'

const REPLAY_ERROR = 'Impossible de relancer la partie. Réessaie dans un instant.'

const route = useRoute()
const lobbyId = computed(() => String(route.params.id ?? ''))

const { resolveUserId, fetchGameMeta, fetchLeaderboard, finishGame, resetLobby } = useGame()
const { leaveLobby, subscribeToLobbyStatus, unsubscribeLobbyPlayers } = useLobby()

type PageStatus = 'pending' | 'ready' | 'error'
const status = ref<PageStatus>('pending')

const meId = ref<string | null>(null)
const hostId = ref<string | null>(null)
const isHost = computed(() => Boolean(meId.value) && meId.value === hostId.value)

const lobbyName = ref('')
const themeLabel = ref('')
const subtitle = computed(() =>
  lobbyName.value ? `${themeLabel.value} - ${lobbyName.value}` : ''
)

const standings = ref<RankedPlayer[]>([])
// Podium dans l'ordre d'affichage (2e, 1er, 3e) ; reste au-delà. Logique pure, testée.
const podium = computed(() => splitStandings(standings.value).podium)
const rest = computed(() => splitStandings(standings.value).rest)
const me = computed(() => standings.value.find(player => player.isMe) ?? null)
const xpGained = computed(() => xpForScore(me.value?.score ?? 0))

const pending = ref(false)
const actionError = ref('')

useHead({ title: 'Résultats de l’arène — Battlemind' })

let statusChannel: RealtimeChannel | null = null

const goToLobby = () => navigateTo(`/lobby/${lobbyId.value}`)

onMounted(async () => {
  meId.value = await resolveUserId()

  const meta = await fetchGameMeta(lobbyId.value)
  if (!meta) {
    status.value = 'error'
    return
  }

  hostId.value = meta.hostId
  lobbyName.value = meta.name
  themeLabel.value = meta.categoryLabel

  // Le lobby a déjà été réinitialisé (rejeu lancé) → retour au salon d'attente.
  if (meta.status === 'waiting') {
    await goToLobby()
    return
  }
  // Partie encore en cours (accès direct anticipé) → retour à la partie.
  if (meta.status === 'in_progress') {
    await navigateTo(`/game/${lobbyId.value}`)
    return
  }

  standings.value = await fetchLeaderboard(lobbyId.value)

  // Seul l'HÔTE crédite l'XP, une seule fois pour tous (finish_game est idempotent).
  if (isHost.value) await finishGame(lobbyId.value)

  status.value = 'ready'

  // Rejeu : quand l'hôte réinitialise (status → waiting), tous basculent au salon.
  statusChannel = subscribeToLobbyStatus(lobbyId.value, next => {
    if (next === 'waiting') goToLobby()
  })
})

onUnmounted(() => {
  if (statusChannel) {
    unsubscribeLobbyPlayers(statusChannel)
    statusChannel = null
  }
})

/** Rejouer (hôte) : réinitialise le lobby. La bascule au salon se fait via Realtime. */
const onReplay = async () => {
  if (pending.value || !isHost.value) return
  pending.value = true
  actionError.value = ''

  const ok = await resetLobby(lobbyId.value)
  pending.value = false
  if (!ok) actionError.value = REPLAY_ERROR
}

/** Retour à l'accueil : quitte le salon puis revient à la page d'accueil. */
const onHome = async () => {
  if (pending.value) return
  pending.value = true
  actionError.value = ''

  await leaveLobby(lobbyId.value)
  await navigateTo('/')
}
</script>

<template>
  <main class="results">
    <template v-if="status === 'pending'">
      <h1 class="sr-only">Résultats de l’arène</h1>
      <p class="state" role="status">Chargement des résultats…</p>
    </template>

    <template v-else-if="status === 'error'">
      <h1 class="sr-only">Résultats indisponibles</h1>
      <p class="state state--error" role="alert">
        <img src="/icons/close.svg" alt="" width="12" height="12">
        Ces résultats ne sont plus disponibles.
      </p>
      <NuxtLink class="button button--ghost" to="/">Retour à l’accueil</NuxtLink>
    </template>

    <div v-else class="board">
      <header class="head">
        <h1 class="head__title">Résultats de l’arène</h1>
        <p class="head__subtitle">{{ subtitle }}</p>
      </header>

      <section class="actions" aria-label="Actions de fin de partie">
        <button
          v-if="isHost"
          class="button button--primary"
          type="button"
          :disabled="pending"
          @click="onReplay"
        >
          <img src="/icons/sync.svg" alt="" width="14" height="14">
          Rejouer
        </button>

        <button class="button button--ghost" type="button" :disabled="pending" @click="onHome">
          <img src="/icons/door-open.svg" alt="" width="16" height="16">
          Retour à l’accueil
        </button>

        <p class="xp" aria-label="Expérience gagnée">
          <img src="/icons/bolt.svg" alt="" width="10" height="13">
          <span class="xp__value">+{{ xpGained }}</span> XP
        </p>
      </section>

      <p v-if="actionError" class="state state--error" role="alert">
        <img src="/icons/close.svg" alt="" width="12" height="12">
        {{ actionError }}
      </p>

      <!-- Podium : les rangs sont explicites en toutes lettres (1er/2e/3e),
           jamais portés par la seule position (RGAA). -->
      <section class="podium" aria-label="Podium">
        <article
          v-for="player in podium"
          :key="player.userId"
          class="podium__card"
          :class="{
            'podium__card--winner': player.rank === 1,
            'podium__card--me': player.isMe
          }"
        >
          <div class="podium__avatar-wrap">
            <span class="podium__avatar" aria-hidden="true">{{ player.initials }}</span>
            <span class="podium__place">{{ ordinalFr(player.rank) }}</span>
          </div>
          <p class="podium__pseudo">
            {{ player.pseudo }}
            <span v-if="player.isMe" class="tag tag--me">Vous</span>
          </p>
          <p class="podium__score">{{ player.score }} pts</p>
        </article>
      </section>

      <!-- Classement au-delà du podium -->
      <section
        v-if="rest.length"
        class="ranking"
        aria-label="Suite du classement"
      >
        <ol class="ranking__list">
          <li
            v-for="player in rest"
            :key="player.userId"
            class="row"
            :class="{ 'row--me': player.isMe }"
          >
            <span class="row__rank">{{ player.rank }}</span>
            <span class="row__avatar" aria-hidden="true">{{ player.initials }}</span>
            <span class="row__pseudo">
              {{ player.pseudo }}
              <span v-if="player.isMe" class="tag tag--me">Vous</span>
            </span>
            <span class="row__score">{{ player.score }} pts</span>
          </li>
        </ol>
      </section>
    </div>
  </main>
</template>

<style scoped>
.results {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 42px 24px;
}

.board {
  display: flex;
  flex-direction: column;
  gap: 32px;
  align-items: center;
}

/* --- En-tête ------------------------------------------------------------ */

.head {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  text-align: center;
}

.head__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: 38px;
}

.head__subtitle {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
  text-transform: uppercase;
}

/* --- Actions + badge XP ------------------------------------------------- */

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
  justify-content: center;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 24px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-decoration: none;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.button--primary {
  background-color: var(--color-accent);
  color: var(--color-accent-contrast);
  text-transform: uppercase;
}

.button--ghost {
  border-color: var(--color-border-interactive);
  background-color: transparent;
  color: var(--color-text);
}

.button:hover:not(:disabled) {
  filter: brightness(1.12);
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.xp {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  margin: 0;
  padding: 11px 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
}

.xp__value {
  color: var(--color-text);
}

/* --- Podium ------------------------------------------------------------- */

.podium {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.podium__card {
  display: flex;
  width: 240px;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  justify-content: center;
  padding: 42px 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

/* Le vainqueur : plus grand, bordure accent et halo. Le rang « 1er » double le repère. */
.podium__card--winner {
  width: 280px;
  padding: 50px 33px;
  border-color: var(--color-accent);
  box-shadow: 0 0 15px 0 var(--color-accent-subtle);
}

/* Ma carte quand je ne suis pas le vainqueur : bordure accent + libellé « Vous ». */
.podium__card--me:not(.podium__card--winner) {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
}

.podium__avatar-wrap {
  position: relative;
}

.podium__avatar {
  display: flex;
  width: 80px;
  height: 80px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border-interactive);
  border-radius: 9999px;
  background-color: var(--color-background);
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
}

.podium__card--winner .podium__avatar {
  width: 112px;
  height: 112px;
  border-width: 4px;
  border-color: var(--color-accent);
  color: var(--color-accent);
  font-size: var(--text-3xl);
}

/* Pastille de rang, doublée du texte « 1er / 2e / 3e ». */
.podium__place {
  position: absolute;
  right: -8px;
  bottom: -8px;
  padding: 5px 9px;
  border: 1px solid var(--color-background);
  border-radius: 9999px;
  background-color: var(--color-border-interactive);
  color: var(--color-background);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
}

.podium__card--winner .podium__place {
  background-color: var(--color-accent);
  color: var(--color-accent-contrast);
}

.podium__pseudo {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

.podium__score {
  margin: 0;
  color: var(--color-success);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
}

/* --- Classement étendu -------------------------------------------------- */

.ranking {
  width: 100%;
  max-width: 844px;
}

.ranking__list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  position: relative;
  display: flex;
  gap: 16px;
  align-items: center;
  overflow: hidden;
  padding: 17px 17px 17px 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

/* Ma ligne : bordure accent, liseré latéral ET libellé « Vous » (jamais la seule couleur). */
.row--me {
  border-color: var(--color-accent);
}

.row--me::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  background-color: var(--color-accent);
  content: '';
}

.row__rank {
  width: 24px;
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-align: center;
}

.row__avatar {
  display: flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-interactive);
  border-radius: 9999px;
  background-color: var(--color-background);
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
}

.row--me .row__avatar {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.row__pseudo {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

.row__score {
  flex-shrink: 0;
  color: var(--color-success);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
}

/* Libellé « Vous » : repère textuel du joueur courant. */
.tag--me {
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--color-accent);
  color: var(--color-accent-contrast);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  line-height: 15px;
  text-transform: uppercase;
}

/* --- États -------------------------------------------------------------- */

.state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 42px auto;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.state--error {
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .podium__card,
  .podium__card--winner {
    width: 100%;
    max-width: 320px;
  }
}
</style>
