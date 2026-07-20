<script setup lang="ts">
import type { CreateLobbyInput } from '~/composables/useLobby'
import {
  LOBBY_CATEGORIES,
  MAX_PLAYERS,
  canDecrementPlayers,
  canIncrementPlayers,
  clampMaxPlayers,
  type LobbyCategory
} from '~/utils/lobby'

const props = defineProps<{
  /** Création en cours : verrouille le formulaire et annonce l'attente. */
  pending?: boolean
  /** Message d'échec remonté par le parent (`useLobby`). */
  errorMessage?: string
}>()

const emit = defineEmits<{
  close: []
  submit: [input: CreateLobbyInput]
}>()

const NAME_REQUIRED = 'Donne un nom à ton arène.'

const name = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const category = ref<LobbyCategory>(LOBBY_CATEGORIES[0]!.value)
const isPublic = ref(true)
const maxPlayers = ref(MAX_PLAYERS)
const powerupsEnabled = ref(true)
const nameError = ref('')

const canDecrement = computed(() => canDecrementPlayers(maxPlayers.value))
const canIncrement = computed(() => canIncrementPlayers(maxPlayers.value))

const decrement = () => {
  maxPlayers.value = clampMaxPlayers(maxPlayers.value - 1)
}

const increment = () => {
  maxPlayers.value = clampMaxPlayers(maxPlayers.value + 1)
}

const onSubmit = () => {
  if (props.pending) return

  if (!name.value.trim()) {
    nameError.value = NAME_REQUIRED
    nameInput.value?.focus()
    return
  }

  nameError.value = ''
  emit('submit', {
    name: name.value,
    category: category.value,
    access: isPublic.value ? 'public' : 'private',
    maxPlayers: clampMaxPlayers(maxPlayers.value),
    powerupsEnabled: powerupsEnabled.value
  })
}

// --- Pattern dialog (WAI-ARIA) -------------------------------------------
// Piège au clavier, fermeture par Échap, et focus rendu au déclencheur à la
// fermeture. Un ARIA partiel serait pire qu'aucun ARIA : le motif est complet.

const dialog = ref<HTMLElement | null>(null)
/** Élément qui avait le focus à l'ouverture — on le lui rendra à la fermeture. */
let trigger: HTMLElement | null = null

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

const focusableItems = (): HTMLElement[] =>
  Array.from(dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])

/** Maintient le focus dans la modale : Tab depuis le dernier revient au premier. */
const trapFocus = (event: KeyboardEvent) => {
  const items = focusableItems()
  if (items.length === 0) return

  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  if (event.shiftKey && (active === first || !dialog.value?.contains(active))) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key === 'Tab') trapFocus(event)
}

onMounted(() => {
  trigger = document.activeElement as HTMLElement | null
  nextTick(() => nameInput.value?.focus())
})

onUnmounted(() => {
  // Focus rendu au bouton « Créer une partie » qui a ouvert la modale.
  trigger?.focus?.()
})
</script>

<template>
  <div class="overlay" @keydown="onKeydown">
    <!-- Décoratif : la fermeture au clic hors modale double le bouton et Échap,
         elle n'est pas le seul moyen de sortir. -->
    <div class="overlay__backdrop" @click="emit('close')" />

    <div
      ref="dialog"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-lobby-title"
    >
      <form @submit.prevent="onSubmit">
        <div class="modal__header">
          <h2 id="create-lobby-title" class="modal__title">Créer une arène</h2>
          <button class="modal__close" type="button" @click="emit('close')">
            <img src="/icons/close.svg" alt="" width="14" height="14">
            <span class="sr-only">Fermer la fenêtre de création</span>
          </button>
        </div>

        <div class="modal__body">
          <div class="field">
            <label class="field__label" for="lobby-name">Nom du salon (obligatoire)</label>
            <input
              id="lobby-name"
              ref="nameInput"
              v-model="name"
              class="field__input"
              type="text"
              maxlength="40"
              required
              autocomplete="off"
              :disabled="pending"
              :aria-invalid="nameError ? 'true' : undefined"
              :aria-describedby="nameError ? 'lobby-name-error' : undefined"
            >
            <p v-if="nameError" id="lobby-name-error" class="field__error" role="alert">
              <img src="/icons/close.svg" alt="" width="10" height="10">
              {{ nameError }}
            </p>
          </div>

          <fieldset class="field field--fieldset">
            <legend class="field__label">Sélectionner un thème (obligatoire)</legend>
            <div class="themes">
              <label
                v-for="option in LOBBY_CATEGORIES"
                :key="option.value"
                class="theme"
                :class="{ 'theme--selected': category === option.value }"
              >
                <input
                  v-model="category"
                  class="sr-only"
                  type="radio"
                  name="lobby-category"
                  :value="option.value"
                  :disabled="pending"
                >
                <img :src="option.icon" alt="" width="20" height="20">
                <span class="theme__label">{{ option.short }}</span>
              </label>
            </div>
          </fieldset>

          <div class="row">
            <div class="field">
              <span id="lobby-access-label" class="field__label">Accès</span>
              <div class="control">
                <button
                  class="switch"
                  type="button"
                  role="switch"
                  :aria-checked="isPublic"
                  aria-labelledby="lobby-access-label lobby-access-state"
                  :disabled="pending"
                  @click="isPublic = !isPublic"
                >
                  <span class="switch__track" aria-hidden="true">
                    <span class="switch__thumb" />
                  </span>
                  <span id="lobby-access-state" class="switch__state">
                    {{ isPublic ? 'Public' : 'Privé' }}
                  </span>
                </button>
              </div>
            </div>

            <div class="field">
              <span id="lobby-players-label" class="field__label">Joueurs</span>
              <div class="control stepper" role="group" aria-labelledby="lobby-players-label">
                <button
                  class="stepper__button"
                  type="button"
                  :disabled="!canDecrement || pending"
                  @click="decrement"
                >
                  <img src="/icons/minus.svg" alt="" width="9" height="9">
                  <span class="sr-only">Retirer un joueur</span>
                </button>
                <p class="stepper__value" aria-live="polite">
                  {{ maxPlayers }}<span class="sr-only"> joueurs maximum</span>
                </p>
                <button
                  class="stepper__button"
                  type="button"
                  :disabled="!canIncrement || pending"
                  @click="increment"
                >
                  <img src="/icons/plus.svg" alt="" width="9" height="9">
                  <span class="sr-only">Ajouter un joueur</span>
                </button>
              </div>
            </div>

            <div class="field">
              <span id="lobby-powerups-label" class="field__label">Power-ups</span>
              <div class="control">
                <button
                  class="switch"
                  type="button"
                  role="switch"
                  :aria-checked="powerupsEnabled"
                  aria-labelledby="lobby-powerups-label lobby-powerups-state"
                  :disabled="pending"
                  @click="powerupsEnabled = !powerupsEnabled"
                >
                  <span class="switch__track" aria-hidden="true">
                    <span class="switch__thumb" />
                  </span>
                  <span id="lobby-powerups-state" class="switch__state">
                    {{ powerupsEnabled ? 'Activé' : 'Désactivé' }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <p v-if="errorMessage" class="field__error" role="alert">
            <img src="/icons/close.svg" alt="" width="10" height="10">
            {{ errorMessage }}
          </p>
        </div>

        <div class="modal__footer">
          <button class="button" type="submit" :disabled="pending" :aria-busy="pending">
            {{ pending ? 'Création…' : 'Créer l’arène' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  inset: 0;
}

.overlay__backdrop {
  position: absolute;
  background-color: var(--color-veil);
  backdrop-filter: blur(2px);
  inset: 0;
}

.modal {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 512px;
  max-height: 100%;
  flex-direction: column;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-background);
  overflow-y: auto;
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.modal__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

.modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background-color: transparent;
  cursor: pointer;
}

.modal__close:hover,
.modal__close:focus-visible {
  border-color: var(--color-border-interactive);
}

.modal__body {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 24px;
}

.field {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.field--fieldset {
  margin: 0;
  padding: 0;
  border: none;
}

.field__label {
  padding: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
  text-transform: uppercase;
}

.field__input {
  padding: 11px 13px;
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
}

.field__input:focus-visible {
  border-color: var(--color-accent);
  outline: none;
}

/* Erreur doublée d'une icône : jamais portée par la seule couleur (RGAA 3.1). */
.field__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 16px;
}

.themes {
  display: flex;
  gap: 8px;
}

.theme {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 17px 8px 13px;
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.theme__label {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.5px;
  line-height: 20px;
  text-align: center;
  text-transform: uppercase;
}

.theme:hover {
  border-color: var(--color-accent);
}

.theme:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Sélection : bordure accentuée ET épaissie ET fond teinté — le choix reste
   perceptible sans distinction chromatique (RGAA 3.1). Le libellé passe en
   `--color-text-strong` : sur le fond teinté, `--color-accent` ne tiendrait
   que 4,4:1, sous le seuil de 4,5:1 exigé à cette taille (RGAA 3.2). */
.theme--selected {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
  box-shadow: inset 0 0 0 1px var(--color-accent);
  color: var(--color-text-strong);
}

.row {
  display: flex;
  gap: 24px;
}

.control {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.switch {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: none;
  background-color: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  cursor: pointer;
}

.switch__track {
  position: relative;
  display: block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  border: 1px solid var(--color-border-interactive);
  border-radius: 9999px;
  background-color: var(--color-surface);
  transition: background-color 0.15s ease;
}

.switch__thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background-color: var(--color-text-muted);
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.switch[aria-checked='true'] .switch__track {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
}

/* La position du curseur porte l'état autant que sa couleur, et l'état est
   également écrit en toutes lettres à côté (« Public » / « Privé »). */
.switch[aria-checked='true'] .switch__thumb {
  background-color: var(--color-text-strong);
  transform: translateX(20px);
}

.switch:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.stepper {
  justify-content: space-between;
  gap: 12px;
}

.stepper__button {
  display: flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--color-border-interactive);
  border-radius: 4px;
  background-color: var(--color-surface);
  cursor: pointer;
}

.stepper__button:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.stepper__button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.stepper__value {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
}

.modal__footer {
  padding: 24px;
  border-top: 1px solid var(--color-border-subtle);
}

.button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
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

@media (max-width: 560px) {
  .themes,
  .row {
    flex-wrap: wrap;
  }
}
</style>
