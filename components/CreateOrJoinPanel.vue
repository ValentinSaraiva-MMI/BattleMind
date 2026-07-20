<script setup lang="ts">
import { normalizeLobbyCode } from '~/utils/lobby'

defineProps<{
  /** Jonction en cours : verrouille le formulaire et annonce l'attente. */
  pending?: boolean
  /** Message d'échec remonté par le parent (`useLobby`). */
  errorMessage?: string
}>()

const emit = defineEmits<{
  create: []
  join: [code: string]
}>()

const joinCode = ref('')

/**
 * Le code ne contient que des chiffres : on filtre la frappe plutôt que de
 * laisser partir une saisie invalide. La validation qui fait foi reste celle de
 * la fonction Postgres `join_lobby_by_code`.
 */
const onCodeInput = (event: Event) => {
  joinCode.value = normalizeLobbyCode((event.target as HTMLInputElement).value)
}

const onJoin = () => emit('join', joinCode.value)
</script>

<template>
  <section class="panel" aria-label="Créer ou rejoindre une partie">
    <div class="panel__part">
      <h2 class="panel__title">Créez</h2>
      <p class="panel__text">Créez rapidement une partie et laissez vous porter par la culture.</p>
      <button class="button" type="button" :disabled="pending" @click="emit('create')">
        <img src="/icons/plus.svg" alt="" width="12" height="12">
        Créer une partie
      </button>
    </div>

    <div class="panel__divider" aria-hidden="true" />

    <div class="panel__part">
      <h2 class="panel__title">Rejoignez</h2>
      <p class="panel__text">Entrez le code a 6 caractères pour rejoindre une partie.</p>
      <form class="join" @submit.prevent="onJoin">
        <label class="sr-only" for="join-code">Code de la partie (6 chiffres, obligatoire)</label>
        <input
          id="join-code"
          class="join__input"
          type="text"
          inputmode="numeric"
          placeholder="000000"
          maxlength="6"
          required
          autocomplete="off"
          :value="joinCode"
          :disabled="pending"
          :aria-invalid="errorMessage ? 'true' : undefined"
          :aria-describedby="errorMessage ? 'join-code-error' : undefined"
          @input="onCodeInput"
        >
        <button class="button" type="submit" :disabled="pending" :aria-busy="pending">
          {{ pending ? 'Connexion…' : 'Rejoindre une partie' }}
        </button>
      </form>
      <!-- Erreur doublée d'une icône : jamais portée par la seule couleur (RGAA 3.1). -->
      <p v-if="errorMessage" id="join-code-error" class="join__error" role="alert">
        <img src="/icons/close.svg" alt="" width="10" height="10">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  align-items: stretch;
  gap: 24px;
  width: 100%;
  padding: 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.panel__part {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;
}

.panel__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

.panel__text {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.panel__divider {
  width: 1px;
  flex-shrink: 0;
  align-self: stretch;
  background-color: var(--color-text-muted);
}

.button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 24px;
  border: none;
  border-radius: var(--radius);
  background-color: var(--color-accent);
  color: var(--color-accent-contrast);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.button:hover:not(:disabled) {
  filter: brightness(1.08);
}

.button:disabled {
  cursor: progress;
  opacity: 0.7;
}

.join {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.join__input {
  width: 160px;
  padding: 11px 25px;
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-align: center;
}

.join__input::placeholder {
  color: var(--color-text-muted);
}

.join__input:focus-visible {
  border-color: var(--color-accent);
  outline: none;
}

.join__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
}

@media (max-width: 800px) {
  .panel {
    flex-direction: column;
  }

  .panel__divider {
    width: 100%;
    height: 1px;
    align-self: auto;
  }

  .join {
    flex-wrap: wrap;
  }
}
</style>
