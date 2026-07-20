<script setup lang="ts">
import { useLobby, type CreateLobbyInput } from '~/composables/useLobby'

useHead({ title: 'Accueil — Battlemind' })

// Le chip joueur est rendu par le layout par défaut, à partir de `useProfile()`.
const {
  lobbies,
  lobbiesStatus,
  lobbiesError,
  pending,
  errorMessage,
  createLobby,
  joinByCode,
  joinPublic,
  fetchPublicLobbies
} = useLobby()

/** Modale de création ouverte. */
const isCreating = ref(false)

/** Rafraîchissement automatique de la liste, en millisecondes. */
const POLL_INTERVAL = 10_000
let timer: ReturnType<typeof setInterval> | null = null

const stopPolling = () => {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

const startPolling = () => {
  stopPolling()
  // `silent` : le rafraîchissement ne repasse pas la liste en « Chargement… »,
  // sinon elle se viderait sous les yeux du joueur toutes les 10 secondes.
  timer = setInterval(() => fetchPublicLobbies({ silent: true }), POLL_INTERVAL)
}

/**
 * Onglet caché : on suspend le sondage plutôt que d'interroger la base pour
 * personne. Au retour, on recharge immédiatement avant de reprendre le rythme.
 */
const onVisibilityChange = () => {
  if (document.hidden) {
    stopPolling()
    return
  }

  fetchPublicLobbies({ silent: true })
  startPolling()
}

onMounted(() => {
  fetchPublicLobbies()
  startPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

const openCreate = () => {
  // Repart d'une ardoise propre : pas d'erreur héritée d'une jonction ratée.
  errorMessage.value = ''
  isCreating.value = true
}

const onCreateSubmit = async (input: CreateLobbyInput) => {
  const lobbyId = await createLobby(input)
  if (!lobbyId) return

  isCreating.value = false
  await navigateTo(`/lobby/${lobbyId}`)
}

const onJoinByCode = async (code: string) => {
  const lobbyId = await joinByCode(code)
  if (lobbyId) await navigateTo(`/lobby/${lobbyId}`)
}

const onJoinLobby = async (id: string) => {
  const lobbyId = await joinPublic(id)

  if (!lobbyId) {
    // Échec probable : partie devenue pleine ou fermée depuis le dernier sondage.
    await fetchPublicLobbies({ silent: true })
    return
  }

  await navigateTo(`/lobby/${lobbyId}`)
}
</script>

<template>
  <main class="main">
    <h1 class="sr-only">Accueil</h1>

    <CreateOrJoinPanel
      :pending="pending"
      :error-message="isCreating ? '' : errorMessage"
      @create="openCreate"
      @join="onJoinByCode"
    />

    <section class="lobbies" aria-labelledby="lobbies-title">
      <div class="lobbies__header">
        <h2 id="lobbies-title" class="lobbies__title">
          <img src="/icons/grid.svg" alt="" width="17" height="13">
          Parties public
        </h2>
        <button
          class="refresh"
          type="button"
          :disabled="lobbiesStatus === 'pending'"
          @click="fetchPublicLobbies()"
        >
          Rafraîchir<span class="sr-only"> la liste des parties publiques</span>
        </button>
      </div>

      <!-- Zone vivante : les arrivées et départs de parties sont annoncés sans
           interrompre le joueur. `aria-busy` évite d'annoncer un état transitoire. -->
      <div aria-live="polite" :aria-busy="lobbiesStatus === 'pending'">
        <p v-if="lobbiesStatus === 'pending'" class="state">Chargement des parties publiques…</p>

        <p v-else-if="lobbiesStatus === 'error'" class="state state--error" role="alert">
          <img src="/icons/close.svg" alt="" width="12" height="12">
          {{ lobbiesError }}
        </p>

        <p v-else-if="lobbies.length === 0" class="state">
          Aucune partie publique ouverte pour le moment. Crée la tienne !
        </p>

        <ul v-else class="lobbies__grid">
          <li v-for="lobby in lobbies" :key="lobby.id" class="lobbies__item">
            <LobbyCard :lobby="lobby" @join="onJoinLobby" />
          </li>
        </ul>
      </div>
    </section>

    <CreateLobbyModal
      v-if="isCreating"
      :pending="pending"
      :error-message="errorMessage"
      @close="isCreating = false"
      @submit="onCreateSubmit"
    />
  </main>
</template>

<style scoped>
/* `.page` (colonne pleine hauteur + fond) vit désormais dans layouts/default.vue. */
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

.lobbies {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.lobbies__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.lobbies__title {
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

.refresh {
  flex-shrink: 0;
  padding: 5px 9px;
  border: 1px solid var(--color-border-interactive);
  border-radius: 4px;
  background-color: var(--color-surface-overlay);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.refresh:hover:not(:disabled),
.refresh:focus-visible {
  border-color: var(--color-accent);
  color: var(--color-text);
}

.refresh:disabled {
  cursor: progress;
  opacity: 0.6;
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

.lobbies__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lobbies__item {
  display: flex;
}
</style>
