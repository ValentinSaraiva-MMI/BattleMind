<script setup lang="ts">
import { useProfile } from '~/composables/useProfile'

// En-tête et pied de page communs aux écrans connectés (hub, profil).
// `useProfile()` est partagé : le chip est alimenté ici, et la page profil lit
// le même état sans déclencher de seconde requête.
const { player } = useProfile()
</script>

<template>
  <div class="page">
    <HubNav :player="player" />

    <slot />

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
</style>
