<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { MIN_PASSWORD_LENGTH, validateSignupForm } from '~/utils/authErrors'

// Affiché par /confirm au retour d'un lien de réinitialisation (ANO-029).
// La page reste maîtresse de la destination : on signale seulement le succès.
const emit = defineEmits<{ done: [] }>()

const form = reactive({ password: '', passwordConfirm: '' })

const { loading, errorMessage, infoMessage, updatePassword } = useAuth()

// Validation client (longueur, correspondance), distincte des erreurs serveur.
const clientError = ref('')
const formError = computed(() => clientError.value || errorMessage.value)

// L'aide de saisie reste annoncée même quand une erreur s'ajoute (RGAA 11.10).
const passwordDescribedBy = computed(() =>
  formError.value ? 'reset-password-hint reset-error' : 'reset-password-hint'
)

const onSubmit = async () => {
  clientError.value = ''
  errorMessage.value = ''

  // Mêmes règles qu'à l'inscription : longueur minimale, puis correspondance.
  const validationError = validateSignupForm({
    password: form.password,
    passwordConfirm: form.passwordConfirm
  })
  if (validationError) {
    clientError.value = validationError
    return
  }

  if (await updatePassword(form.password)) emit('done')
}
</script>

<template>
  <form class="form" @submit.prevent="onSubmit">
    <p class="form__intro">
      Choisis un nouveau mot de passe. Il remplacera l'ancien immédiatement.
    </p>

    <div class="form__field">
      <label class="form__label" for="reset-password">Nouveau mot de passe (obligatoire)</label>
      <input
        id="reset-password"
        v-model="form.password"
        class="input"
        type="password"
        autocomplete="new-password"
        :minlength="MIN_PASSWORD_LENGTH"
        required
        :aria-invalid="formError ? 'true' : undefined"
        :aria-describedby="passwordDescribedBy"
      >
      <p id="reset-password-hint" class="form__hint">
        {{ MIN_PASSWORD_LENGTH }} caractères minimum.
      </p>
    </div>

    <div class="form__field">
      <label class="form__label" for="reset-password-confirm">
        Confirmer le nouveau mot de passe (obligatoire)
      </label>
      <input
        id="reset-password-confirm"
        v-model="form.passwordConfirm"
        class="input"
        type="password"
        autocomplete="new-password"
        :minlength="MIN_PASSWORD_LENGTH"
        required
        :aria-invalid="formError ? 'true' : undefined"
        :aria-describedby="formError ? 'reset-error' : undefined"
      >
    </div>

    <p v-if="formError" id="reset-error" class="form__error" role="alert">
      <svg class="form__error-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
      {{ formError }}
    </p>

    <p v-if="infoMessage" id="reset-info" class="form__info" role="status">
      <svg class="form__info-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
      </svg>
      {{ infoMessage }}
    </p>

    <button
      class="button button--primary"
      type="submit"
      :disabled="loading"
      :aria-busy="loading ? 'true' : undefined"
    >
      {{ loading ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe' }}
    </button>
  </form>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form__intro {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form__label {
  color: var(--color-text);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.form__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
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

/* Confirmation : même principe, couleur succès doublée d'une icône. */
.form__info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-success);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
}

.form__error-icon,
.form__info-icon {
  flex-shrink: 0;
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

.input:focus-visible {
  border-color: var(--color-accent);
}

.button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-family: inherit;
  font-size: var(--text-md);
  line-height: 20px;
  cursor: pointer;
  transition: filter 0.15s ease;
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
</style>
