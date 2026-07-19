<script setup lang="ts">
useHead({ title: 'Connexion en cours — Battlemind' })

// Cible de callback (OAuth Discord + confirmation email) : le plugin Supabase
// échange le code de l'URL contre une session, puis on redirige. Page exclue
// du middleware d'auth (le visiteur n'est pas encore authentifié en arrivant).
const user = useSupabaseUser()
const route = useRoute()
const redirect = useSupabaseCookieRedirect()

const finish = () => {
  // pluck() restaure la page d'origine mémorisée, ou null → hub.
  const path = redirect.pluck()
  navigateTo(path || '/')
}

// Session déjà présente ou établie par le plugin → on quitte /confirm.
watch(user, () => {
  if (user.value) finish()
}, { immediate: true })

let fallbackTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  // Erreur du fournisseur (OAuth refusé, lien expiré) : query ?error ou hash #error.
  const hasError = Boolean(route.query.error) || route.hash.includes('error')
  if (hasError) {
    navigateTo('/login')
    return
  }

  // Filet de sécurité : ne pas bloquer indéfiniment si aucune session ne s'établit.
  fallbackTimer = setTimeout(() => {
    if (!user.value) navigateTo('/login')
  }, 8000)
})

onUnmounted(() => {
  if (fallbackTimer) clearTimeout(fallbackTimer)
})
</script>

<template>
  <div class="page">
    <main class="confirm">
      <h1 class="sr-only">Connexion en cours</h1>
      <p class="confirm__status" role="status">
        <span class="confirm__spinner" aria-hidden="true" />
        Connexion en cours, un instant…
      </p>
    </main>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  min-height: 100vh;
  background-color: var(--color-background);
}

.confirm {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 42px 24px;
}

.confirm__status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.confirm__spinner {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: 2px solid var(--color-border-interactive);
  border-top-color: var(--color-accent);
  border-radius: 9999px;
  animation: confirm-spin 0.8s linear infinite;
}

/* Respect des préférences de mouvement réduit (WCAG 2.3.3). */
@media (prefers-reduced-motion: reduce) {
  .confirm__spinner {
    animation: none;
  }
}

@keyframes confirm-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
