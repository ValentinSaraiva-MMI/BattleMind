<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useLobby } from '~/composables/useLobby'
import { useGame } from '~/composables/useGame'
import { formatLobbyCode } from '~/utils/lobby'

const route = useRoute()
const lobbyId = computed(() => String(route.params.id ?? ''))

const {
  lobby,
  lobbyStatus,
  pending,
  errorMessage,
  resolveUserId,
  fetchLobby,
  leaveLobby,
  subscribeToLobbyPlayers,
  unsubscribeLobbyPlayers
} = useLobby()

// Le lancement appartient à la boucle de jeu : `start_game` passe le lobby en
// partie et crée le round 1. Son état de chargement/erreur est distinct de
// celui des actions de salon (jonction, sortie).
const { pending: starting, errorMessage: startError, startGame } = useGame()

useHead({ title: 'Salon — Battlemind' })

const userId = ref<string | null>(null)

/**
 * Seul l'hôte voit « Lancer l'arène ». Le masquage est un confort d'interface :
 * la policy RLS de mise à jour de `lobbies` est ce qui l'interdit réellement aux
 * autres joueurs.
 */
const isHost = computed(() => Boolean(userId.value) && lobby.value?.hostId === userId.value)

/** Places restantes, rendues en cases « en attente de connexion ». */
const emptySlots = computed(() => {
  if (!lobby.value) return 0
  return Math.max(0, lobby.value.maxPlayers - lobby.value.players.length)
})

const connectedLabel = computed(() =>
  lobby.value ? `${lobby.value.players.length} / ${lobby.value.maxPlayers} connectés` : ''
)

// Canal Realtime du salon, conservé pour être fermé au démontage.
let playersChannel: RealtimeChannel | null = null

// Les données se chargent au montage, puis le canal Realtime prend le relais :
// la grille et le compteur suivent les arrivées et départs sans rechargement.
onMounted(async () => {
  userId.value = await resolveUserId()
  await fetchLobby(lobbyId.value)

  // Chaque INSERT/DELETE sur lobby_players de ce salon déclenche un refetch
  // silencieux (sans flash de « Chargement… »), ce qui reconstruit la liste.
  playersChannel = subscribeToLobbyPlayers(lobbyId.value, () => {
    fetchLobby(lobbyId.value, { silent: true })
  })
})

// Sans ce nettoyage, chaque passage dans un salon laisserait une connexion
// Realtime ouverte — fuite de canaux côté Supabase.
onUnmounted(() => {
  if (playersChannel) {
    unsubscribeLobbyPlayers(playersChannel)
    playersChannel = null
  }
})

// --- Copie du code -------------------------------------------------------

const copyState = ref<'idle' | 'copied' | 'error'>('idle')

const copyCode = async () => {
  if (!lobby.value) return

  try {
    await navigator.clipboard.writeText(lobby.value.code)
    copyState.value = 'copied'
  } catch {
    // Presse-papiers indisponible (permission refusée, contexte non sécurisé) :
    // on le dit plutôt que de laisser croire à une copie réussie.
    copyState.value = 'error'
  }
}

// --- Actions -------------------------------------------------------------

const onLeave = async () => {
  if (pending.value) return

  const left = await leaveLobby(lobbyId.value)
  if (left) await navigateTo('/')
}

const onStart = async () => {
  if (starting.value) return

  // `start_game` renvoie l'id du round 1 : on l'emporte dans l'URL pour afficher
  // la première question sans nouvel aller-retour côté page de jeu.
  const roundId = await startGame(lobbyId.value)
  if (roundId) await navigateTo(`/game/${lobbyId.value}?round=${roundId}`)
}
</script>

<template>
  <main class="main">
    <template v-if="lobbyStatus === 'pending'">
      <h1 class="sr-only">Salon</h1>
      <p class="state" role="status">Chargement du salon…</p>
    </template>

    <template v-else-if="!lobby">
      <h1 class="sr-only">Salon introuvable</h1>
      <p class="state state--error" role="alert">
        <img src="/icons/close.svg" alt="" width="12" height="12">
        {{ errorMessage }}
      </p>
      <NuxtLink class="button button--ghost" to="/">Retour à l’accueil</NuxtLink>
    </template>

    <div v-else class="lobby">
      <div class="lobby__main">
        <header class="header">
          <button class="button button--danger" type="button" :disabled="pending" @click="onLeave">
            <img src="/icons/door-open.svg" alt="" width="20" height="20">
            Quitter le salon
          </button>

          <div class="header__identity">
            <h1 class="header__name">{{ lobby.name }}</h1>

            <div class="code">
              <p class="code__label">Code d’accès</p>
              <div class="code__row">
                <p class="code__value">{{ formatLobbyCode(lobby.code) }}</p>
                <button class="code__copy" type="button" @click="copyCode">
                  <img src="/icons/copy.svg" alt="" width="14" height="17">
                  <span class="sr-only">Copier le code d’accès</span>
                </button>
              </div>
              <!-- Retour accessible : la copie est confirmée à l'oral comme à l'écran. -->
              <p class="code__feedback" role="status">
                <template v-if="copyState === 'copied'">Code copié dans le presse-papiers.</template>
                <template v-else-if="copyState === 'error'">
                  Copie impossible. Note le code : {{ formatLobbyCode(lobby.code) }}.
                </template>
              </p>
            </div>
          </div>
        </header>

        <section class="roster" aria-labelledby="roster-title">
          <div class="roster__header">
            <h2 id="roster-title" class="roster__title">
              <img src="/icons/users.svg" alt="" width="22" height="16">
              Les joueurs
            </h2>
            <p class="roster__count">{{ connectedLabel }}</p>
          </div>

          <ul class="roster__grid">
            <li
              v-for="player in lobby.players"
              :key="player.id"
              class="player"
              :class="{ 'player--host': player.isHost }"
            >
              <div class="player__top">
                <span class="player__avatar" aria-hidden="true">{{ player.initials }}</span>
                <span v-if="player.isHost" class="player__badge">Hôte</span>
              </div>
              <p class="player__identity">
                <span class="player__pseudo">{{ player.pseudo }}</span>
                <span class="player__level">Niv. {{ player.level }}</span>
              </p>

            </li>

            <li v-for="slot in emptySlots" :key="`empty-${slot}`" class="slot">
              <img src="/icons/slot-empty.svg" alt="" width="20" height="11">
              <p class="slot__label">En attente de connexion</p>
            </li>
          </ul>
        </section>
      </div>

      <aside class="side">
        <section class="settings" aria-labelledby="settings-title">
          <h2 id="settings-title" class="settings__title">
            <img src="/icons/settings.svg" alt="" width="14" height="14">
            Paramètres
          </h2>
          <dl class="settings__list">
            <div class="settings__row">
              <dt class="settings__key">
                <img src="/icons/theme.svg" alt="" width="13" height="13">
                Thème
              </dt>
              <dd class="settings__value">{{ lobby.categoryLabel }}</dd>
            </div>
            <div class="settings__row">
              <dt class="settings__key">
                <img src="/icons/lock.svg" alt="" width="11" height="14">
                Accès
              </dt>
              <dd class="settings__value settings__value--accent">
                {{ lobby.access === 'public' ? 'Public' : 'Privé' }}
              </dd>
            </div>
            <div class="settings__row">
              <dt class="settings__key">
                <img src="/icons/players.svg" alt="" width="15" height="11">
                Nombre de joueurs
              </dt>
              <dd class="settings__value">{{ lobby.maxPlayers }} max</dd>
            </div>
            <div class="settings__row">
              <dt class="settings__key">
                <img src="/icons/bolt.svg" alt="" width="11" height="13">
                Power-ups
              </dt>
              <dd class="settings__value">
                <span class="pill" :class="{ 'pill--on': lobby.powerupsEnabled }">
                  {{ lobby.powerupsEnabled ? 'Activé' : 'Désactivé' }}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <div class="actions">
          <p v-if="lobby.status !== 'waiting'" class="state" role="status">
            La partie est lancée.
          </p>

          <button
            v-if="isHost && lobby.status === 'waiting'"
            class="button button--primary"
            type="button"
            :disabled="starting"
            :aria-busy="starting"
            @click="onStart"
          >
            <img src="/icons/play.svg" alt="" width="10" height="12">
            Lancer l’arène
          </button>

          <!-- Hors périmètre : désactivé et annoncé comme tel, jamais un bouton mort. -->
          <div class="soon">
            <button class="button button--ghost" type="button" disabled>
              Envoyer le lien d’invitation
            </button>
            <span class="soon__tag">Bientôt disponible</span>
          </div>

          <p v-if="errorMessage || startError" class="state state--error" role="alert">
            <img src="/icons/close.svg" alt="" width="12" height="12">
            {{ errorMessage || startError }}
          </p>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 42px 24px;
}

.lobby {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 32px;
  align-items: start;
}

.lobby__main {
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-width: 0;
}

.header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  padding-bottom: 25px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.header__identity {
  display: flex;
  width: 100%;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.header__name {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: 38px;
}

.code {
  display: flex;
  min-width: 200px;
  flex-direction: column;
  align-items: flex-end;
  padding: 17px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.code__label {
  margin: 0 0 4px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 16px;
  text-transform: uppercase;
}

.code__row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}

.code__value {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: 38px;
}

.code__copy {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background-color: transparent;
  cursor: pointer;
}

.code__copy:hover,
.code__copy:focus-visible {
  border-color: var(--color-accent);
}

.code__feedback {
  margin: 4px 0 0;
  color: var(--color-info);
  font-size: var(--text-sm);
  line-height: 16px;
  text-align: right;
}

.roster {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.roster__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.roster__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

.roster__count {
  margin: 0;
  padding: 5px 17px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.roster__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.player {
  position: relative;
  display: flex;
  min-height: 140px;
  flex-direction: column;
  gap: 4px;
  padding: 17px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

/* L'hôte se distingue par la bordure ET le liseré ET le badge texte « Hôte ». */
.player--host {
  border-color: var(--color-accent);
}

.player--host::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 4px;
  border-radius: var(--radius) var(--radius) 0 0;
  background-color: var(--color-accent);
  content: '';
}

.player__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 24px;
}

.player__avatar {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-interactive);
  border-radius: 4px;
  background-color: var(--color-background);
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
}

.player--host .player__avatar {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.player__badge {
  padding: 3px 9px;
  border: 1px solid var(--color-accent);
  border-radius: 4px;
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  letter-spacing: 0.9px;
  line-height: 15px;
  text-transform: uppercase;
}

.player__identity {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
}

.player__pseudo {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player__level {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.player__status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.player__status--ready {
  color: var(--color-success);
}

.player__dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 9999px;
  background-color: var(--color-success);
}

.slot {
  display: flex;
  min-height: 140px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 17px;
  border: 1px dashed var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.slot__label {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.5px;
  line-height: 20px;
  text-align: center;
  text-transform: uppercase;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.settings {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.settings__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-transform: uppercase;
}

.settings__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 16px;
}

.settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings__row + .settings__row {
  padding-top: 16px;
  border-top: 1px solid var(--color-border-subtle);
}

.settings__key {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.settings__value {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
  text-align: right;
}

.settings__value--accent {
  color: var(--color-accent);
}

.pill {
  display: inline-block;
  padding: 5px 17px;
  border: 1px solid var(--color-border-interactive);
  border-radius: 4px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
}

.pill--on {
  border-color: var(--color-success);
  color: var(--color-success);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.button {
  display: flex;
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

.button--danger {
  background-color: var(--color-danger-strong);
  color: var(--color-text-strong);
}

.button--ghost {
  width: 100%;
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

.soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.soon__tag {
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  letter-spacing: 1px;
  line-height: 15px;
  text-transform: uppercase;
}

.state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

/* Erreur doublée d'une icône : jamais portée par la seule couleur (RGAA 3.1). */
.state--error {
  color: var(--color-danger);
}

@media (max-width: 900px) {
  .lobby {
    grid-template-columns: 1fr;
  }

  .header__identity {
    flex-direction: column;
    align-items: flex-start;
  }

  .code {
    align-self: stretch;
  }
}
</style>
