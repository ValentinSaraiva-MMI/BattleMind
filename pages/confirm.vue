<script setup lang="ts">
// Page de callback (OAuth / confirmation / réinitialisation) : aucun chrome applicatif.
definePageMeta({ layout: false })

// Cible de callback (OAuth Discord + confirmation email + réinitialisation) : le
// plugin Supabase échange le code de l'URL contre une session, puis on redirige.
// Page exclue du middleware d'auth (le visiteur n'est pas encore authentifié en
// arrivant).
const user = useSupabaseUser()
const route = useRoute()
const redirect = useSupabaseCookieRedirect()



const isRecovery = computed(
  () => route.query.type === 'recovery' || route.hash.includes('type=recovery')
)

// La session issue du lien étant déjà ouverte, le formulaire s'affiche dès qu'elle
// est disponible ; sans session, on reste sur l'attente (puis le filet ci-dessous).
const showResetForm = computed(() => isRecovery.value && Boolean(user.value))

useHead({
  title: computed(() =>
    isRecovery.value ? 'Nouveau mot de passe — Battlemind' : 'Connexion en cours — Battlemind'
  )
})

const finish = () => {
  // pluck() restaure la page d'origine mémorisée, ou null → hub.
  const path = redirect.pluck()
  navigateTo(path || '/')
}

// Session déjà présente ou établie par le plugin → on quitte /confirm. En
// réinitialisation on reste : cette session sert précisément à autoriser le
// changement de mot de passe, la consommer en redirigeant laisserait l'ancien
// mot de passe valide (ANO-029).
watch(user, () => {
  if (user.value && !isRecovery.value) finish()
}, { immediate: true })

const headingRef = ref<HTMLElement | null>(null)


const focusHeading = async () => {
  await nextTick()
  headingRef.value?.focus()
}

watch(showResetForm, (visible) => {
  if (visible) focusHeading()
})

let fallbackTimer: ReturnType<typeof setTimeout> | undefined
let successTimer: ReturnType<typeof setTimeout> | undefined

// Laisse le temps à la confirmation (role="status") d'être restituée avant le
// changement de page (RGAA 7.4 / WCAG 4.1.3).
const REDIRECT_AFTER_RESET_MS = 1500

const onPasswordUpdated = () => {
  successTimer = setTimeout(finish, REDIRECT_AFTER_RESET_MS)
}

onMounted(() => {
  // Erreur du fournisseur (OAuth refusé, lien expiré) : query ?error ou hash #error.
  const hasError = Boolean(route.query.error) || route.hash.includes('error')
  if (hasError) {
    navigateTo('/login')
    return
  }

  // Session déjà établie au montage (rechargement de la page) : le watcher
  // ci-dessus ne se déclenchera pas, on place le focus ici.
  if (showResetForm.value) focusHeading()

  // Filet de sécurité : ne pas bloquer indéfiniment si aucune session ne s'établit.
  fallbackTimer = setTimeout(() => {
    if (!user.value) navigateTo('/login')
  }, 8000)
})

onUnmounted(() => {
  if (fallbackTimer) clearTimeout(fallbackTimer)
  if (successTimer) clearTimeout(successTimer)
})
</script>

<template>
  <div class="page">
    <main class="confirm">
      <section v-if="showResetForm" class="confirm__panel">
        <h1 ref="headingRef" class="confirm__title" tabindex="-1">Nouveau mot de passe</h1>
        <ResetPasswordForm @done="onPasswordUpdated" />
      </section>

      <template v-else>
        <h1 class="sr-only">Connexion en cours</h1>
        <p class="confirm__status" role="status">
          <span class="confirm__spinner" aria-hidden="true" />
          Connexion en cours, un instant…
        </p>
      </template>
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

.confirm__panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 448px;
  max-width: 100%;
  padding: 33px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.confirm__title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-2xl);
  line-height: 32px;
}

/* Le titre reçoit le focus au basculement : il doit rester visible (RGAA 10.7). */
.confirm__title:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
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
