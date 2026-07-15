<script setup lang="ts">
defineProps<{
  playersOnline: number
}>()

const formatPlayers = (n: number) => n.toLocaleString('fr-FR').replace(/ /g, ' ')
</script>

<template>
  <header class="header">
    <div class="logo" />
    <div class="players">
      <span class="players__dot" />
      <span class="players__label">{{ formatPlayers(playersOnline) }} joueurs en ligne</span>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
}

.logo {
  width: 160px;
  height: 40px;
  border-radius: var(--radius);
  background-color: var(--color-secondary);
}

.players {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 17px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.players__dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background-color: var(--color-accent);
}

.players__label {
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
  white-space: nowrap;
}
</style>
