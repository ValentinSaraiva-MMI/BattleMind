<script setup lang="ts">
useHead({ title: 'Connexion — Battlemind' })

// Visiteur déjà authentifié → hub (le middleware ne gère que l'inverse).
const user = useSupabaseUser()
watch(user, () => {
  if (user.value) navigateTo('/')
}, { immediate: true })

const playersOnline = ref(1248)
</script>

<template>
  <div class="page">
    <AppHeader :players-online="playersOnline" />

    <main class="main">
      <div class="main__container">
        <AuthPanel />
        <RulesCarousel />
      </div>
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
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 42px 24px;
}

.main__container {
  display: flex;
  flex: 1;
  align-items: stretch;
  justify-content: center;
  gap: 48px;
  max-width: 1024px;
}

@media (max-width: 960px) {
  .main__container {
    flex-direction: column;
    align-items: center;
  }
}
</style>
