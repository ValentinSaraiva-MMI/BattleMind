<script setup lang="ts">
const joinCode = ref('')

const onCreate = () => {
  // TODO: brancher la création de partie (Supabase)
}

const onJoin = () => {
  // TODO: brancher la jonction par code (Supabase)
}
</script>

<template>
  <section class="panel" aria-label="Créer ou rejoindre une partie">
    <div class="panel__part">
      <h2 class="panel__title">Créez</h2>
      <p class="panel__text">Créez rapidement une partie et laissez vous porter par la culture.</p>
      <button class="button" type="button" @click="onCreate">
        <img src="/icons/plus.svg" alt="" width="12" height="12">
        Créer une partie
      </button>
    </div>

    <div class="panel__divider" aria-hidden="true" />

    <div class="panel__part">
      <h2 class="panel__title">Rejoignez</h2>
      <p class="panel__text">Entrez le code a 6 caractères pour rejoindre une partie.</p>
      <form class="join" @submit.prevent="onJoin">
        <label class="sr-only" for="join-code">Code de la partie (6 caractères, obligatoire)</label>
        <input
          id="join-code"
          v-model="joinCode"
          class="join__input"
          type="text"
          placeholder="000000"
          maxlength="6"
          required
          autocomplete="off"
        >
        <button class="button" type="submit">Rejoindre une partie</button>
      </form>
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

.button:hover {
  filter: brightness(1.08);
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
