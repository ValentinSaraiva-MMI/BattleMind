<script setup lang="ts">
import type { Lobby } from '~/components/LobbyCard.vue'
import type { PlayerSummary } from '~/components/HubNav.vue'

useHead({ title: 'Accueil — Battlemind' })

// Données factices en attendant le branchement Supabase (profils, lobbies, Realtime).
const player: PlayerSummary = {
  pseudo: 'AlexTheQuizz',
  initials: 'AT',
  level: 13,
  xpPercent: 67,
  battlecoins: 1250
}

const lobbies: Lobby[] = [
  { id: 'neon-protocol', name: 'Neon Protocol', category: 'Culture générale', status: 'waiting', players: 6, maxPlayers: 8, host: 'CipherX' },
  { id: 'data-mines', name: 'Data Mines', category: 'Sciences', status: 'waiting', players: 2, maxPlayers: 4, host: 'NullPtr' },
  { id: 'void-sector', name: 'Void Sector', category: 'Histoire', status: 'full', players: 16, maxPlayers: 16, host: 'AdminBot' },
  { id: 'echo-chamber', name: 'Echo Chamber', category: 'Musique', status: 'waiting', players: 4, maxPlayers: 10, host: 'Melody' },
  { id: 'silicon-valley', name: 'Silicon Valley', category: 'Tech', status: 'waiting', players: 1, maxPlayers: 6, host: 'DevOps' },
  { id: 'global-trivia', name: 'Global Trivia', category: 'Culture générale', status: 'waiting', players: 12, maxPlayers: 20, host: 'QuizMaster' }
]

const onJoinLobby = (_id: string) => {
  // TODO: rejoindre le lobby via Supabase puis naviguer vers la page de la partie
}
</script>

<template>
  <div class="page">
    <HubNav :player="player" />

    <main class="main">
      <h1 class="sr-only">Accueil</h1>

      <CreateOrJoinPanel />

      <section class="lobbies" aria-labelledby="lobbies-title">
        <div class="lobbies__header">
          <h2 id="lobbies-title" class="lobbies__title">
            <img src="/icons/grid.svg" alt="" width="17" height="13">
            Parties public
          </h2>
        </div>
        <ul class="lobbies__grid">
          <li v-for="lobby in lobbies" :key="lobby.id" class="lobbies__item">
            <LobbyCard :lobby="lobby" @join="onJoinLobby" />
          </li>
        </ul>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--color-background);
}

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
