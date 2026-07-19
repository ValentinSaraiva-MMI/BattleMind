<script lang="ts">
export interface Lobby {
  id: string
  name: string
  category: string
  status: 'waiting' | 'full'
  players: number
  maxPlayers: number
  host: string
}
</script>

<script setup lang="ts">
const props = defineProps<{
  lobby: Lobby
}>()

const emit = defineEmits<{
  join: [id: string]
}>()

// Libellés du design (statut toujours doublé du point de couleur — RGAA 3.1).
const statusLabel = computed(() => (props.lobby.status === 'full' ? 'Full' : 'Waiting'))
</script>

<template>
  <article class="card" :class="{ 'card--full': lobby.status === 'full' }">
    <div class="card__header">
      <div class="card__titles">
        <p class="card__category">{{ lobby.category }}</p>
        <h3 class="card__name">{{ lobby.name }}</h3>
      </div>
      <p class="status" :class="`status--${lobby.status}`">
        <span class="status__dot" aria-hidden="true" />
        {{ statusLabel }}
      </p>
    </div>

    <div class="card__players">
      <span class="card__players-label">Players</span>
      <span class="card__players-value">{{ lobby.players }}/{{ lobby.maxPlayers }} Players</span>
    </div>

    <div class="card__footer">
      <div class="card__host">
        <span class="card__host-badge" aria-hidden="true">
          <img src="/icons/host.svg" alt="" width="8" height="8">
        </span>
        <span class="card__host-name">{{ lobby.host }}</span>
      </div>
      <button
        v-if="lobby.status !== 'full'"
        class="card__join"
        type="button"
        @click="emit('join', lobby.id)"
      >
        Join<span class="sr-only"> — {{ lobby.name }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 21px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.card__titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.card__category {
  margin: 0;
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-regular);
  letter-spacing: 1px;
  line-height: 15px;
  text-transform: uppercase;
}

.card__name {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 3px 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-regular);
  letter-spacing: 1px;
  line-height: 15px;
  white-space: nowrap;
}

.status__dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 9999px;
  background-color: var(--color-info);
}

.status--full {
  color: var(--color-danger);
}

.status--full .status__dot {
  background-color: var(--color-danger);
}

.card__players {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
}

.card__players-label {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 16px;
}

.card__players-value {
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
}

.card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  padding-top: 13px;
  border-top: 1px solid var(--color-border-subtle);
}

.card__host {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card__host-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  background-color: var(--color-background);
}

.card__host-name {
  overflow: hidden;
  max-width: 80px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__join {
  padding: 7px 17px;
  border: 1px solid var(--color-accent-subtle);
  border-radius: 4px;
  background-color: var(--color-surface-overlay);
  color: var(--color-accent);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.card__join:hover,
.card__join:focus-visible {
  border-color: var(--color-accent);
}

.card--full .card__players,
.card--full .card__host {
  opacity: 0.5;
}
</style>
