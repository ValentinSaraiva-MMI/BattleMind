<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { validateSignupForm } from '~/utils/authErrors'

type AuthTab = 'connexion' | 'inscription'

const tabOrder: AuthTab[] = ['connexion', 'inscription']
const activeTab = ref<AuthTab>('connexion')

const login = reactive({ email: '', password: '' })
const signup = reactive({ pseudo: '', email: '', password: '', passwordConfirm: '' })

const { loading, errorMessage, infoMessage, signIn, signUp, signInWithDiscord } = useAuth()

// Validation client (mots de passe), distincte des erreurs serveur.
const clientError = ref('')

// Sur inscription, la validation client prime sur l'erreur serveur.
const signupError = computed(() => clientError.value || errorMessage.value)

// Un changement d'onglet efface les messages (pas de fuite entre formulaires).
watch(activeTab, () => {
  errorMessage.value = ''
  infoMessage.value = ''
  clientError.value = ''
})

// Boutons d'onglet, pour déplacer le focus au clavier (roving tabindex).
const connexionTabRef = ref<HTMLButtonElement | null>(null)
const inscriptionTabRef = ref<HTMLButtonElement | null>(null)

const focusTab = (tab: AuthTab) => {
  const el = tab === 'connexion' ? connexionTabRef.value : inscriptionTabRef.value
  el?.focus()
}

// Navigation clavier du pattern tabs (RGAA 7.3) : flèches + Home/End.
const onTabKeydown = (event: KeyboardEvent) => {
  const current = tabOrder.indexOf(activeTab.value)
  let next = current

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (current + 1) % tabOrder.length
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (current - 1 + tabOrder.length) % tabOrder.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = tabOrder.length - 1
      break
    default:
      return
  }

  event.preventDefault()
  const target = tabOrder[next]!
  activeTab.value = target
  focusTab(target)
}

const onSubmitLogin = async () => {
  await signIn(login.email, login.password)
}

const onSubmitSignup = async () => {
  clientError.value = ''
  errorMessage.value = ''

  const validationError = validateSignupForm({
    password: signup.password,
    passwordConfirm: signup.passwordConfirm
  })
  if (validationError) {
    clientError.value = validationError
    return
  }

  // TODO: vérifier l'unicité du pseudo avant signUp (sinon la contrainte UNIQUE
  // fait échouer le trigger SQL avec une erreur Postgres illisible).
  await signUp(signup.pseudo, signup.email, signup.password)
}

const onDiscord = async () => {
  clientError.value = ''
  await signInWithDiscord()
}
</script>

<template>
  <section class="panel">
    <div class="panel__content">
      <div class="tabs" role="tablist" aria-label="Authentification">
        <button
          id="tab-connexion"
          ref="connexionTabRef"
          class="tab"
          :class="{ 'tab--active': activeTab === 'connexion' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'connexion'"
          aria-controls="panel-connexion"
          :tabindex="activeTab === 'connexion' ? 0 : -1"
          @click="activeTab = 'connexion'"
          @keydown="onTabKeydown"
        >
          Connexion        </button>
        <button
          id="tab-inscription"
          ref="inscriptionTabRef"
          class="tab"
          :class="{ 'tab--active': activeTab === 'inscription' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'inscription'"
          aria-controls="panel-inscription"
          :tabindex="activeTab === 'inscription' ? 0 : -1"
          @click="activeTab = 'inscription'"
          @keydown="onTabKeydown"
        >
          Inscription
        </button>
      </div>

      <form
        id="panel-connexion"
        class="form"
        role="tabpanel"
        aria-labelledby="tab-connexion"
        :hidden="activeTab !== 'connexion'"
        @submit.prevent="onSubmitLogin"
      >
        <template v-if="activeTab === 'connexion'">
          <label class="sr-only" for="login-email">Adresse email (obligatoire)</label>
          <input
            id="login-email"
            v-model="login.email"
            class="input"
            type="email"
            placeholder="Email"
            autocomplete="email"
            required
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'login-error' : undefined"
          >
          <label class="sr-only" for="login-password">Mot de passe (obligatoire)</label>
          <input
            id="login-password"
            v-model="login.password"
            class="input"
            type="password"
            placeholder="Mot de passe"
            autocomplete="current-password"
            required
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'login-error' : undefined"
          >
          <p v-if="errorMessage" id="login-error" class="form__error" role="alert">
            <svg class="form__error-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            {{ errorMessage }}
          </p>
          <button
            class="button button--primary"
            type="submit"
            :disabled="loading"
            :aria-busy="loading ? 'true' : undefined"
          >
            {{ loading ? 'Connexion…' : 'Se connecter' }}
          </button>
        </template>
      </form>

      <form
        id="panel-inscription"
        class="form"
        role="tabpanel"
        aria-labelledby="tab-inscription"
        :hidden="activeTab !== 'inscription'"
        @submit.prevent="onSubmitSignup"
      >
        <template v-if="activeTab === 'inscription'">
          <label class="sr-only" for="signup-pseudo">Pseudo (obligatoire)</label>
          <input
            id="signup-pseudo"
            v-model="signup.pseudo"
            class="input"
            type="text"
            placeholder="Pseudo"
            autocomplete="username"
            required
          >
          <label class="sr-only" for="signup-email">Adresse email (obligatoire)</label>
          <input
            id="signup-email"
            v-model="signup.email"
            class="input"
            type="email"
            placeholder="Email"
            autocomplete="email"
            required
            :aria-invalid="signupError ? 'true' : undefined"
            :aria-describedby="signupError ? 'signup-error' : undefined"
          >
          <label class="sr-only" for="signup-password">Mot de passe (obligatoire)</label>
          <input
            id="signup-password"
            v-model="signup.password"
            class="input"
            type="password"
            placeholder="Mot de passe"
            autocomplete="new-password"
            required
            :aria-invalid="signupError ? 'true' : undefined"
            :aria-describedby="signupError ? 'signup-error' : undefined"
          >
          <label class="sr-only" for="signup-password-confirm">Confirmer le mot de passe (obligatoire)</label>
          <input
            id="signup-password-confirm"
            v-model="signup.passwordConfirm"
            class="input"
            type="password"
            placeholder="Confirmer le mot de passe"
            autocomplete="new-password"
            required
            :aria-invalid="signupError ? 'true' : undefined"
            :aria-describedby="signupError ? 'signup-error' : undefined"
          >
          <p v-if="signupError" id="signup-error" class="form__error" role="alert">
            <svg class="form__error-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            {{ signupError }}
          </p>
          <p v-if="infoMessage" id="signup-info" class="form__info" role="status">
            {{ infoMessage }}
          </p>
          <button
            class="button button--primary"
            type="submit"
            :disabled="loading"
            :aria-busy="loading ? 'true' : undefined"
          >
            {{ loading ? 'Inscription…' : "S'inscrire" }}
          </button>
        </template>
      </form>

      <div class="divider">
        <span class="divider__line" />
        <span class="divider__label">OU</span>
        <span class="divider__line" />
      </div>

      <div class="providers">
        <button
          class="button button--ghost"
          type="button"
          :disabled="loading"
          :aria-busy="loading ? 'true' : undefined"
          @click="onDiscord"
        >
          <img class="button__icon" src="/icons/discord.svg" alt="" width="16" height="16">
          Continuer avec Discord
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 448px;
  max-width: 448px;
  padding: 33px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.panel__content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
}

.tabs {
  display: flex;
  padding: 5px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-background);
}

.tab {
  flex: 1;
  padding: 11px 1px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background-color: transparent;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.tab:hover {
  color: var(--color-text);
}

.tab--active {
  border-color: var(--color-border-subtle);
  background-color: var(--color-surface-overlay);
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  color: var(--color-text);
  font-weight: var(--weight-semibold);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Rétablit l'effet de l'attribut `hidden` sur le panneau inactif */
.form[hidden] {
  display: none;
}

/* Message d'erreur : couleur danger DOUBLÉE d'une icône et d'un texte (RGAA 3.1). */
.form__error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
}

.form__error-icon {
  flex-shrink: 0;
}

/* Message d'information (ex. vérification email) : équivalent en couleur info. */
.form__info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-info);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
}

.input {
  width: 100%;
  padding: 14px 17px;
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.input::placeholder {
  color: var(--color-text-muted);
}

.input:focus-visible {
  border-color: var(--color-accent);
}

.form__aside {
  display: flex;
  justify-content: flex-end;
}

.link {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-decoration: none;
  transition: color 0.15s ease;
}

.link:hover,
.link:focus-visible {
  color: var(--color-text);
}

.button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-family: inherit;
  font-size: var(--text-md);
  line-height: 20px;
  cursor: pointer;
  transition: filter 0.15s ease, border-color 0.15s ease;
}

.button--primary {
  padding: 12px 0;
  background-color: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: var(--weight-semibold);
}

.button--primary:hover {
  filter: brightness(1.08);
}

/* État désactivé (pendant une requête) : exempté de contraste (RGAA 3.2). */
.button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.button:disabled:hover {
  filter: none;
}

.button--ghost {
  padding: 13px 1px;
  border-color: var(--color-border-interactive);
  background-color: var(--color-background);
  color: var(--color-text);
  font-weight: var(--weight-medium);
}

.button--ghost:hover {
  border-color: var(--color-text-muted);
}

.button__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.divider {
  display: flex;
  align-items: center;
  gap: 16px;
}

.divider__line {
  flex: 1;
  height: 1px;
  background-color: var(--color-border-subtle);
}

.divider__label {
  padding: 0 8px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.providers {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
