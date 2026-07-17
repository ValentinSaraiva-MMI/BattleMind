<script lang="ts">
export interface PlayerSummary {
  pseudo: string
  initials: string
  level: number
  /** Progression vers le niveau suivant, en pourcentage (0-100). */
  xpPercent: number
  battlecoins: number
}
</script>

<script setup lang="ts">
const props = defineProps<{
  player: PlayerSummary
}>()

// Format du design (« 1,250 ») — séparateur de milliers par virgule.
const formattedBattlecoins = computed(() => props.player.battlecoins.toLocaleString('en-US'))
</script>

<template>
  <header class="topnav">
    <img class="topnav__logo" src="/icons/logo-symbole.svg" alt="Battlemind" width="46" height="35">

    <nav class="nav" aria-label="Navigation principale">
      <ul class="nav__list">
        <li>
          <NuxtLink class="nav__link" to="/">Accueil</NuxtLink>
        </li>
        <li>
          <NuxtLink class="nav__link" to="/classement">Classement</NuxtLink>
        </li>
        <li>
          <!-- Boutique hors périmètre : désactivée, jamais un lien mort. -->
          <span class="nav__link nav__link--disabled" aria-disabled="true">
            Shop
            <span class="nav__soon">Bientôt disponible</span>
          </span>
        </li>
        <li>
          <NuxtLink class="nav__link" to="/profil">Profil</NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="actions">
      <!-- Notifications non implémentées : bouton désactivé, jamais un bouton mort. -->
      <button class="bell" type="button" disabled title="Bientôt disponible">
        <img src="/icons/bell.svg" alt="" width="13" height="17">
        <span class="sr-only">Notifications (bientôt disponible)</span>
      </button>

      <div class="chip">
        <span class="chip__avatar" aria-hidden="true">{{ player.initials }}</span>
        <div class="chip__body">
          <p class="chip__identity">
            <span class="chip__pseudo">{{ player.pseudo }}</span>
            <span class="chip__level">Lv.{{ player.level }}</span>
          </p>
          <div class="chip__meta">
            <div
              class="chip__xp"
              role="progressbar"
              aria-label="Expérience vers le niveau suivant"
              :aria-valuenow="player.xpPercent"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span class="chip__xp-fill" :style="{ width: `${player.xpPercent}%` }" />
            </div>
            <p class="chip__currency">
              {{ formattedBattlecoins }}
              <span class="chip__currency-unit" aria-hidden="true">B</span>
              <span class="sr-only">battlecoins</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topnav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  width: 100%;
  padding: 12px 24px;
  border-bottom: 1px solid var(--color-border-subtle);
  background-color: var(--color-background);
}

.topnav__logo {
  flex-shrink: 0;
}

.nav__list {
  display: flex;
  align-items: center;
  gap: 32px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav__link {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 12px 6px;
  border-bottom: 2px solid transparent;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s ease;
}

.nav__link:hover,
.nav__link:focus-visible {
  color: var(--color-text);
}

/* Lien actif : couleur + soulignement (l'information ne repose pas sur la seule couleur). */
.nav__link.router-link-exact-active {
  border-bottom-color: var(--color-accent);
  color: var(--color-accent);
  font-weight: var(--weight-semibold);
}

.nav__link--disabled {
  cursor: not-allowed;
}

.nav__soon {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  line-height: 15px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.bell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: none;
}

.bell:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.chip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 5px 17px 5px 5px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
}

.chip__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: 9999px;
  background-color: var(--color-background);
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.chip__identity {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.chip__pseudo {
  color: var(--color-text);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  white-space: nowrap;
}

.chip__level {
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.chip__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
}

.chip__xp {
  width: 64px;
  height: 4px;
  overflow: hidden;
  border-radius: 9999px;
  background-color: var(--color-accent-subtle);
}

.chip__xp-fill {
  display: block;
  height: 100%;
  background-color: var(--color-accent);
}

.chip__currency {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
}

.chip__currency-unit {
  color: var(--color-accent);
}
</style>
